/**
 * TR-Energy Analyst - Fiziksel güç eğrisi (Aşama 23.3): medyan eğri yerine santral başına düzgün, parametreli eğri
 *
 * Eğri: P(v) = tavan × kırp((v³ − v_ci³) / (v_r³ − v_ci³), 0, 1); v ≥ v_co (durma) ise 0. Türbin gücü nominal hızın altında
 * hızın küpüyle artar (kinetik enerji akısı ∝ ρ v³), nominalde sabitlenir.
 *   - tavan: eğitimdeki üretimin %99'luk dilimi (kurulu güçle sınırlı): kısmi kullanılabilirlik (bakımdaki türbinler,
 *     şebeke sınırı) tavana girer.
 *   - v_ci (başlama) ve v_r (nominal): ızgarada en küçük mutlak hata (dengesizlik maliyetinin ana sürücüsü medyandır).
 *   - Yön çarpanı (8 dilim): hız × k_s, k_s ∈ [0,7, 1,3]; arazi ve iz etkisi, hava modelinin yöne bağlı sapması. Dilim başına
 *     en küçük mutlak hata; az saatli dilim 1.
 *   - Göbek yüksekliği: 80 / 100 / 120 m arasından eğitim hatası en küçük olan (PLAN 23.0 b: kayıtlarda yok). 100 m hız,
 *     aynı d2 çalışmasının 10 m ↔ 100 m kesme üssüyle taşınır (gece kararlı katmanda üs büyür; saat ve mevsim etkisi
 *     üssün kendisinden gelir). 10 m hız yoksa 1/7 üs.
 *   - Yoğunluk: isteğe bağlı, models/baseline.ts ile aynı eşdeğer hız.
 *   - Durma: v_co = 25 m/s; `predictSeries` histerezisi uygular (durduktan sonra hız v_co − 3'ün altına inene kadar 0).
 * Eğitim temizliği medyan eğriyle aynı (lib/forecast/wind-forecast.ts): sıfır / eksi fiyatlı saatler, ilk eğriye göre
 * kısıntı ve arıza saatleri dışarıda. 22.2'den ders: fizik tek başına kaybedebilir; aday ancak geriye dönük testte kazanırsa.
 *
 * Bilgi zamanı: hava `d2` (rüzgâr, 10 m, sıcaklık, basınç aynı çalışmadan); eğitimde `trainingEnd` sonrası üretim hata
 * verir; tahminde `assertAvailable`. Ayarlar (ızgaralar, dilim sayısı, sınırlar) baştan sabittir. SAF: I/O yok.
 */

import { assertAvailable, LeakageError, productionFeature, weatherFeature } from "@/lib/forecast/info-time";
import { fitPowerCurve, LOSS_EXPECTED_MIN, LOSS_SHARE, PLANNED_SHARE } from "@/lib/forecast/wind-loss";
import { extrapolateSpeed, shearExponent } from "../physics/air-density";
import { withDensity, type WindEngineHour } from "./baseline";

export const HUB_HEIGHTS = [80, 100, 120];
export const DIR_SECTORS = 8;
export const SECTOR_K = { min: 0.7, max: 1.3, step: 0.02 };
export const CUT_OUT = 25;
export const RESTART_BELOW = CUT_OUT - 3;
const V_CI_GRID = [2, 2.5, 3, 3.5, 4, 4.5, 5];
const V_R_GRID = Array.from({ length: 19 }, (_, i) => 8 + i * 0.5);
const MIN_SECTOR_HOURS = 100;
export const MIN_PHYS_TRAIN_HOURS = 500;
/** 10 m hız yoksa ya da üs hesaplanamazsa (zayıf rüzgâr) varsayılan üs */
export const DEFAULT_ALPHA = 1 / 7;
/** Üs sınırları (aşırı değerler tek saatlik model gürültüsü) */
const ALPHA_RANGE = [-0.1, 0.6] as const;

export interface PhysicalCurveParams {
  ceiling: number;
  vCutIn: number;
  vRated: number;
  hubM: number;
  sectorK: number[];
}

export interface PhysicalCurveModel {
  params: PhysicalCurveParams;
  trainHours: number;
  excludedHours: number;
  predict: (h: WindEngineHour) => number | null;
  /** Zaman sıralı saatler için tahmin; durma histerezisi uygulanır */
  predictSeries: (hs: WindEngineHour[]) => Array<number | null>;
}

const sectorOf = (dir: number) => Math.floor((((dir % 360) + 360 + 180 / DIR_SECTORS) % 360) / (360 / DIR_SECTORS));

/** 100 m hızı göbek yüksekliğine taşır (d2 10 m ↔ 100 m üssüyle) */
export function hubSpeed(ws100: number, ws10: number | null, hubM: number): number {
  if (hubM === 100) return ws100;
  const a = shearExponent(ws10, 10, ws100, 100);
  const alpha = a === null ? DEFAULT_ALPHA : Math.min(ALPHA_RANGE[1], Math.max(ALPHA_RANGE[0], a));
  return extrapolateSpeed(ws100, 100, hubM, alpha);
}

/** Parametreli eğri (yön çarpanı uygulanmış hızla) */
export function curvePower(v: number, p: Pick<PhysicalCurveParams, "ceiling" | "vCutIn" | "vRated">): number {
  if (v >= CUT_OUT || v <= p.vCutIn) return 0;
  if (v >= p.vRated) return p.ceiling;
  return (p.ceiling * (v ** 3 - p.vCutIn ** 3)) / (p.vRated ** 3 - p.vCutIn ** 3);
}

interface Row {
  uevm: number;
  ws: number;
  sector: number;
}

const mae = (rows: Row[], p: Omit<PhysicalCurveParams, "hubM">) => rows.reduce((s, r) => s + Math.abs(curvePower(r.ws * p.sectorK[r.sector], p) - r.uevm), 0);

function fitParams(rows: Row[], ceiling: number): Omit<PhysicalCurveParams, "hubM"> & { err: number } {
  let best = { ceiling, vCutIn: 3, vRated: 12, sectorK: Array(DIR_SECTORS).fill(1) as number[], err: Infinity };
  const grid = (sectorK: number[]) => {
    // Her ızgara adayında aynı hızın küpünü yeniden hesaplamadan; toplama sırası ve formül birebir korunur.
    const speeds = rows.map(r => r.ws * sectorK[r.sector]);
    const cubes = speeds.map(v => v ** 3);
    for (const vCutIn of V_CI_GRID)
      for (const vRated of V_R_GRID) {
        if (vRated <= vCutIn + 3) continue;
        const ci3 = vCutIn ** 3, denominator = vRated ** 3 - ci3;
        let err = 0;
        for (let i = 0; i < rows.length; i++) {
          const v = speeds[i];
          const power = v >= CUT_OUT || v <= vCutIn ? 0 : v >= vRated ? ceiling : ceiling * (cubes[i] - ci3) / denominator;
          err += Math.abs(power - rows[i].uevm);
        }
        if (err < best.err - 1e-9) best = { ceiling, vCutIn, vRated, sectorK, err };
      }
  };
  grid(best.sectorK);
  // Yön çarpanları: dilim başına (diğerleri sabit), iki geçiş; sonra eğri ızgarası yeniden
  const bySector = Array.from({ length: DIR_SECTORS }, (_, s) => rows.filter((r) => r.sector === s));
  for (let pass = 0; pass < 2; pass++) {
    const k = [...best.sectorK];
    for (let s = 0; s < DIR_SECTORS; s++) {
      if (bySector[s].length < MIN_SECTOR_HOURS) continue;
      let bestK = k[s];
      let bestErr = Infinity;
      for (let v = SECTOR_K.min; v <= SECTOR_K.max + 1e-9; v += SECTOR_K.step) {
        const kk = Math.round(v * 100) / 100;
        const err = bySector[s].reduce((sum, r) => sum + Math.abs(curvePower(r.ws * kk, best) - r.uevm), 0);
        // Eşitlikte 1'e yakın olan
        if (err < bestErr - 1e-9 || (Math.abs(err - bestErr) <= 1e-9 && Math.abs(kk - 1) < Math.abs(bestK - 1))) {
          bestErr = err;
          bestK = kk;
        }
      }
      k[s] = bestK;
    }
    best = { ...best, sectorK: k, err: mae(rows, { ...best, sectorK: k }) };
    grid(k);
  }
  return best;
}

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
}

export function fitPhysicalCurve(
  train: WindEngineHour[],
  capacityMw: number,
  opts: { trainingEnd: number; density?: boolean; elevationM?: number | null; hubHeights?: number[] }
): PhysicalCurveModel {
  if (train.some(h => h.live)) throw new Error("Canlı tahmin saati eğitime giremez");
  const late = train.find((h) => h.t >= opts.trainingEnd);
  if (late) throw new LeakageError(`Eğitimde kesimden sonraki üretim: ${new Date(late.t).toISOString()}`, [{ name: "uevm", source: "production", availableAt: late.t }]);
  const prep = (h: WindEngineHour) => (opts.density ? withDensity(h, opts.elevationM ?? null) : h);
  const ws10 = (h: WindEngineHour) => h.ws10?.d2 ?? null;
  const valid = train
    .map(prep)
    .filter((h) => h.uevm !== null && h.ws.d2 !== null && h.dir.d2 !== null && (h.ptf ?? 1) > 0)
    .map((h) => ({ t: h.t, uevm: Math.max(0, h.uevm as number), ws: h.ws.d2 as number, dir: h.dir.d2 as number, ws10: ws10(h), kgup: h.kgupFirst }));
  if (valid.length < MIN_PHYS_TRAIN_HOURS) throw new Error(`Eğitim verisi yetersiz (${valid.length} saat)`);
  // Temizlik: medyan eğriye göre kısıntı ve arıza saatleri
  const first = fitPowerCurve(valid);
  const keep = valid.filter((h) => {
    const e = first(h.ws, h.dir);
    if (e === null) return true;
    const exp = Math.min(Math.max(0, e), capacityMw);
    if (exp < LOSS_EXPECTED_MIN * capacityMw) return true;
    return !(h.uevm < LOSS_SHARE * exp || (h.kgup !== null && h.kgup < PLANNED_SHARE * exp));
  });
  const use = keep.length >= MIN_PHYS_TRAIN_HOURS ? keep : valid;
  const ceiling = Math.min(capacityMw, quantile(use.map((h) => h.uevm), 0.99));
  let best: (PhysicalCurveParams & { err: number }) | null = null;
  for (const hubM of opts.hubHeights ?? HUB_HEIGHTS) {
    const rows = use.map((h) => ({ uevm: h.uevm, ws: hubSpeed(h.ws, h.ws10, hubM), sector: sectorOf(h.dir) }));
    const p = fitParams(rows, ceiling);
    // Eşitlikte 100 m (kayıt yokken en olağan)
    if (!best || p.err < best.err - 1e-9) best = { ...p, hubM };
  }
  const params: PhysicalCurveParams = { ceiling: best!.ceiling, vCutIn: best!.vCutIn, vRated: best!.vRated, hubM: best!.hubM, sectorK: best!.sectorK };
  const speedOf = (h: WindEngineHour): number | null => {
    const x = prep(h);
    if (x.ws.d2 === null || x.dir.d2 === null) return null;
    return hubSpeed(x.ws.d2, ws10(x), params.hubM) * params.sectorK[sectorOf(x.dir.d2)];
  };
  const check = (h: WindEngineHour) =>
    assertAvailable(
      [
        weatherFeature("ws100_d2@i", h.t, "instant", 2),
        weatherFeature("ws100_d2@i+1", h.t, "mean", 2),
        // 10 m hız, sıcaklık ve basınç aynı d2 çalışmasından, aynı damgalarla
        weatherFeature("ws10_t2m_p_d2@i", h.t, "instant", 2),
        weatherFeature("ws10_t2m_p_d2@i+1", h.t, "mean", 2),
        productionFeature("son eğitim üretimi", opts.trainingEnd - 3_600_000),
      ],
      h.t
    );
  return {
    params,
    trainHours: use.length,
    excludedHours: valid.length - use.length,
    predict: (h) => {
      check(h);
      const v = speedOf(h);
      return v === null ? null : Math.min(capacityMw, curvePower(v, params));
    },
    predictSeries: (hs) => {
      let stopped = false;
      return hs.map((h) => {
        check(h);
        const v = speedOf(h);
        if (v === null) return null;
        if (v >= CUT_OUT) stopped = true;
        else if (v < RESTART_BELOW) stopped = false;
        return stopped ? 0 : Math.min(capacityMw, curvePower(v, params));
      });
    },
  };
}
