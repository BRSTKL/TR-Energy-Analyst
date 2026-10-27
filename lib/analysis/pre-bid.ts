/**
 * TR-Energy Analyst - Teklif öncesi görünüm (ÖNİZLEME; saatlik fiyat beklentisi ve ± aralık)
 *
 * Bir hedef gün T+1 için, teklif öncesi (12:30) bilinebilen girdilerle her saatin PTF beklentisi:
 *   beklenti(h) = referans(h) + k × dünkü artık(h) + b × (net yük(h) − net yük medyanı(h))
 *   referans    : önceki 28 günün aynı sınıftaki (hafta içi, hafta sonu, tatil, yarım gün) saatlik PTF ortancası
 *   dünkü artık : hedef günden bir önceki günün PTF'si − o günün referansı (T günü 14:00'te açıklanır)
 *   net yük     : yarının yük tahmini − EPİAŞ'ın yarınki rüzgâr tahmini − güneş vekili (önceki günlerin aynı saat KGÜP güneşi ortancası;
 *                 yarının KGÜP'ü sorulamaz)
 * k ve b, önceki aynı sınıf günlerinde (en çok 56 gün) iki değişkenli en küçük kareler. ± aralık: modelin önceki günlerdeki
 * (aynı yöntemle, o günün kendi girdileriyle) hatalarının saat bazında %10 ve %90 yüzdelikleri. Ölçümler (27.10.2026,
 * scripts/analysis/res-forecast-price-evidence.mts, ptf-load-evidence.mts): Haziran–Ekim 2026'da 141 günde saatlik hata 583 → 491
 * TL/MWh (%15,9); aralık hedef %80'e karşı yaklaşık %75 kapsıyor. Sınırlar: EPİAŞ rüzgâr tahmininin sürüm saati bilinmiyor
 * (anlık görüntü işi ölçecek), tahmin geçmişi yalnız 2026-06-01'den, güneşin günlük değişimi (vekil) ve yakıt, hidro, arz-talep
 * eğrisi, ithalat yok. SAF: I/O yok.
 */

import { dayClass, DAY_CLASS_LABEL, type DayClass } from "./daily-market";
import { hourLevel, type HourLevel, type PriceLimit } from "./price-limit";

const H = 24;
export const PREBID_REFERENCE_DAYS = 28;
export const PREBID_TRAIN_DAYS = 56;
export const PREBID_ERROR_DAYS = 60;
export const PREBID_MIN_SAME_CLASS = 4;
export const PREBID_MIN_ERROR_DAYS = 20;
/** EPİAŞ rüzgâr tahmin serisinin tanımı bu günden önce gerçekleşen rüzgârla tutmuyor; öncesinde tahmin kullanılmaz */
export const PREBID_FORECAST_FROM = "2026-06-01";

export interface DayData {
  ptf: number[] | null;
  lep: number[] | null;
  /** Gerçek zamanlı rüzgâr (MW) */
  wind: number[] | null;
  /** KGÜP güneş planı (MW) */
  sunK: number[] | null;
  /** EPİAŞ rüzgâr tahmini (MW, saatlik ortalama) */
  windF: number[] | null;
}

export interface PreBidInput {
  /** Hedef gün (YYYY-AA-GG) */
  date: string;
  /** Hedef günden ÖNCEKİ günler (hedef gün ve sonrası kullanılmaz) */
  days: Map<string, DayData>;
  /** Hedef günün girdileri (teklif öncesi bilinenler) */
  target: { lep: number[] | null; windF: number[] | null };
  /** Hedef günden bir önceki günün PTF'si (açıklanmış); days içinde de olabilir */
  prevPtf?: number[] | null;
  limit: PriceLimit | null;
  /** Geçmiş günde denemek için gerçekleşen PTF; yalnız karşılaştırma, modele girmez */
  actual?: number[] | null;
}

export interface PreBidRow {
  hour: number;
  baseline: number | null;
  /** Dünkü artığın katkısı (TL/MWh) */
  persistence: number | null;
  /** Net yükün katkısı (TL/MWh) */
  load: number | null;
  expected: number | null;
  lo: number | null;
  hi: number | null;
  level: HourLevel;
  /** Üst sınır tavana ulaşıyor mu */
  hiAtCap: boolean;
  lep: number | null;
  windF: number | null;
  net: number | null;
  actual: number | null;
}

export interface PreBidBacktest {
  days: number;
  /** Saatlik ortalama mutlak hata (TL/MWh) */
  modelMae: number;
  baselineMae: number;
  improvementPct: number;
  /** Modelin referanstan iyi olduğu günlerin oranı (%) */
  betterDaysPct: number;
}

export type PreBidView =
  | { ok: false; reason: string }
  | {
      ok: true;
      date: string;
      dayClass: DayClass;
      rows: PreBidRow[];
      coefficients: { persistence: number; load: number; trainDays: number };
      backtest: PreBidBacktest | null;
      intervalDays: number;
      summary: {
        meanExpected: number | null;
        meanBaseline: number | null;
        vsBaselinePct: number | null;
        peak: { hour: number; value: number } | null;
        eveningMinusNoon: number | null;
        hiAtCapHours: number;
        nearCapHours: number;
        /** Geçmiş günde denemede: gerçekleşen / beklenti hatası ve aralığın tutma sayısı */
        actualCheck: {
          mae: number;
          baselineMae: number;
          inInterval: number;
          hours: number;
        } | null;
      };
      warnings: string[];
      sentences: string[];
    };

// ---------------------------------------------------------------- yardımcılar

export const shiftDay = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const quantile = (v: number[], q: number) => {
  const a = [...v].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  return a[lo] + (a[Math.ceil(pos)] - a[lo]) * (pos - lo);
};
const full = (a: number[] | null | undefined): a is number[] =>
  !!a && a.length === H && a.every((v) => Number.isFinite(v));

/** En küçük kareler (normal denklemler, Gauss yok etme); matris tekilse sıfır katsayı */
function olsN(rows: Array<{ x: number[]; y: number }>, k: number): number[] {
  const a = Array.from({ length: k }, () => Array<number>(k + 1).fill(0));
  for (const r of rows)
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) a[i][j] += r.x[i] * r.x[j];
      a[i][k] += r.x[i] * r.y;
    }
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-9) return Array<number>(k).fill(0);
    [a[c], a[piv]] = [a[piv], a[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let j = c; j <= k; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((row, i) => row[k] / row[i]);
}

// ---------------------------------------------------------------- model

/** Üretimdeki model dışında denenen değişkenler (etki ölçümü: lib/analysis/pre-bid-effects.ts) */
export interface ModelOptions {
  /** Güneşin (MW) saatlik değeri; verilirse KGÜP vekilinin yerine geçer */
  sun?: (d: string) => number[] | null;
  /** Ek değişkenler: günün 24 saatlik değeri; referans günlerin medyanından sapması katsayıyla çarpılır */
  extras?: Array<(d: string) => number[] | null>;
}

export class Model {
  private baseMemo = new Map<
    string,
    { mP: number[]; mN: number[]; mX: number[][] } | null
  >();
  private sunMemo = new Map<string, number[] | null>();

  constructor(
    private days: Map<string, DayData>,
    private prevPtfOf: (d: string) => number[] | null,
    private opt: ModelOptions = {}
  ) {}

  /** Net yükte kullanılan güneş: seçenekteki değer ya da KGÜP vekili */
  sunOf(d: string): number[] | null {
    return this.opt.sun ? (this.opt.sun(d) ?? null) : this.sunProxy(d);
  }

  /** Ek değişkenlerin d günü değerleri; biri yoksa null */
  extrasOf(d: string): number[][] | null {
    const out: number[][] = [];
    for (const f of this.opt.extras ?? []) {
      const v = f(d);
      if (!full(v)) return null;
      out.push(v);
    }
    return out;
  }

  /** Önceki 7 günün aynı saat KGÜP güneşi ortancası (≥ 4 gün) */
  sunProxy(d: string): number[] | null {
    if (this.sunMemo.has(d)) return this.sunMemo.get(d)!;
    const prev = Array.from(
      { length: 7 },
      (_, i) => this.days.get(shiftDay(d, -(i + 1)))?.sunK
    ).filter(full);
    const r =
      prev.length >= 4
        ? Array.from({ length: H }, (_, h) => median(prev.map((x) => x[h])))
        : null;
    this.sunMemo.set(d, r);
    return r;
  }

  /** Gerçekleşen girdilerle net yük: yük tahmini − gerçek zamanlı rüzgâr − güneş vekili */
  nlReal(d: string): number[] | null {
    const x = this.days.get(d);
    const sp = this.sunOf(d);
    return x && full(x.lep) && full(x.wind) && sp
      ? x.lep.map((v, h) => v - x.wind![h] - sp[h])
      : null;
  }

  ptfOf(d: string): number[] | null {
    const p = this.days.get(d)?.ptf;
    return full(p) ? p : null;
  }

  /** Referans: önceki 28 günün aynı sınıftaki PTF ortancası ve net yük ortancası (net yük hesaplanabilen günlerden) */
  base(d: string) {
    if (this.baseMemo.has(d)) return this.baseMemo.get(d)!;
    const cls = dayClass(d);
    const pr: string[] = [];
    for (let i = 1; i <= PREBID_REFERENCE_DAYS; i++) {
      const p = shiftDay(d, -i);
      if (dayClass(p) === cls && this.ptfOf(p) && this.nlReal(p) && this.extrasOf(p))
        pr.push(p);
    }
    const r =
      pr.length < PREBID_MIN_SAME_CLASS
        ? null
        : {
            mP: Array.from({ length: H }, (_, h) =>
              median(pr.map((p) => this.ptfOf(p)![h]))
            ),
            mN: Array.from({ length: H }, (_, h) =>
              median(pr.map((p) => this.nlReal(p)![h]))
            ),
            mX: (this.opt.extras ?? []).map((_, j) =>
              Array.from({ length: H }, (_, h) =>
                median(pr.map((p) => this.extrasOf(p)![j][h]))
              )
            ),
          };
    this.baseMemo.set(d, r);
    return r;
  }

  /** Günün artığı: PTF − referans */
  resid(d: string): number[] | null {
    const b = this.base(d);
    const p = this.ptfOf(d) ?? this.prevPtfOf(d);
    return b && p ? p.map((v, h) => v - b.mP[h]) : null;
  }

  /** d günü için katsayılar: önceki aynı sınıf günlerinde (en çok 56 gün) PTF sapması ~ dünkü artık + net yük sapması (+ ek değişkenler) */
  fit(d: string): { k: number; b: number; extra: number[]; n: number } | null {
    const base = this.base(d);
    if (!base) return null;
    const cls = dayClass(d);
    const dim = 2 + base.mX.length;
    const rows: Array<{ x: number[]; y: number }> = [];
    let n = 0;
    for (let i = 1; i <= PREBID_TRAIN_DAYS; i++) {
      const p = shiftDay(d, -i);
      if (dayClass(p) !== cls) continue;
      const pt = this.ptfOf(p);
      const nl = this.nlReal(p);
      const rr = this.resid(shiftDay(p, -1));
      const ex = this.extrasOf(p);
      if (!pt || !nl || !rr || !ex || !this.base(p)) continue;
      n++;
      for (let h = 0; h < H; h++)
        rows.push({
          x: [rr[h], nl[h] - base.mN[h], ...ex.map((e, j) => e[h] - base.mX[j][h])],
          y: pt[h] - base.mP[h],
        });
    }
    if (n < PREBID_MIN_SAME_CLASS) return null;
    const c = olsN(rows, dim);
    return { k: c[0], b: c[1], extra: c.slice(2), n };
  }

  /** d günü için beklenti: girdiler (yük tahmini, rüzgâr tahmini, dünkü artık) dışarıdan */
  predict(d: string, lep: number[], windF: number[], res1: number[]) {
    const base = this.base(d);
    const sp = this.sunOf(d);
    const f = this.fit(d);
    const ex = this.extrasOf(d);
    if (!base || !sp || !f || !ex) return null;
    const net = lep.map((v, h) => v - windF[h] - sp[h]);
    const persistence = res1.map((r) => f.k * r);
    const load = net.map((v, h) => f.b * (v - base.mN[h]));
    const extra = ex.map((e, j) => e.map((v, h) => f.extra[j] * (v - base.mX[j][h])));
    return {
      base,
      f,
      net,
      persistence,
      load,
      extra,
      expected: base.mP.map(
        (m, h) => m + persistence[h] + load[h] + extra.reduce((s, e) => s + e[h], 0)
      ),
    };
  }
}

// ---------------------------------------------------------------- görünüm

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const pctSigned = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}%${Math.abs(v).toFixed(0)}`;
const nf0 = (v: number) => Math.round(v).toLocaleString("tr-TR");

export function buildPreBid(input: PreBidInput): PreBidView {
  const { date, days, target, limit } = input;
  const cls = dayClass(date);
  const hist = new Map(Array.from(days).filter(([d]) => d < date));
  const prevDay = shiftDay(date, -1);
  const prevPtfOf = (d: string) => (d === prevDay ? (input.prevPtf ?? null) : null);
  const model = new Model(hist, prevPtfOf);

  if (!full(target.lep))
    return {
      ok: false,
      reason: "Yarının yük tahmini henüz yayımlanmadı ya da eksik; net yük hesaplanamaz.",
    };
  if (!full(target.windF))
    return {
      ok: false,
      reason: "EPİAŞ'ın rüzgâr tahmini yayımlanmamış ya da eksik; net yük hesaplanamaz.",
    };
  const res1 = model.resid(prevDay);
  if (!res1)
    return {
      ok: false,
      reason: `Dünkü artık hesaplanamadı: ${prevDay} PTF'si ya da referansı yok.`,
    };
  const p = model.predict(date, target.lep, target.windF, res1);
  if (!p) {
    return {
      ok: false,
      reason: `${DAY_CLASS_LABEL[cls]} günü için son ${PREBID_REFERENCE_DAYS} günde yeterli (en az ${PREBID_MIN_SAME_CLASS}) benzer gün yok; beklenti kurulamaz. Arife, bayram ve ara tatiller böyledir.`,
    };
  }

  // Geriye dönük: önceki günlerde aynı yöntemle (o günün kendi girdileriyle) hata havuzu
  const errs: Array<{ day: string; err: number[]; baseErr: number[] }> = [];
  for (let i = 1; i <= PREBID_ERROR_DAYS + 20 && errs.length < PREBID_ERROR_DAYS; i++) {
    const d = shiftDay(date, -i);
    if (d < PREBID_FORECAST_FROM) break;
    const x = hist.get(d);
    const r1 = model.resid(shiftDay(d, -1));
    if (!x || !full(x.ptf) || !full(x.lep) || !full(x.windF) || !r1) continue;
    const q = model.predict(d, x.lep, x.windF, r1);
    if (!q) continue;
    errs.push({
      day: d,
      err: x.ptf.map((v, h) => v - q.expected[h]),
      baseErr: x.ptf.map((v, h) => v - q.base.mP[h]),
    });
  }
  const hasBand = errs.length >= PREBID_MIN_ERROR_DAYS;
  const cap = limit?.cap ?? Infinity;
  const clamp = (v: number) => Math.max(0, Math.min(cap, v));
  const q10 = Array.from({ length: H }, (_, h) =>
    hasBand
      ? quantile(
          errs.map((e) => e.err[h]),
          0.1
        )
      : NaN
  );
  const q90 = Array.from({ length: H }, (_, h) =>
    hasBand
      ? quantile(
          errs.map((e) => e.err[h]),
          0.9
        )
      : NaN
  );

  const rows: PreBidRow[] = Array.from({ length: H }, (_, h) => {
    const expected = clamp(p.expected[h]);
    const lo = hasBand ? clamp(p.expected[h] + q10[h]) : null;
    const hi = hasBand ? clamp(p.expected[h] + q90[h]) : null;
    return {
      hour: h,
      baseline: p.base.mP[h],
      persistence: p.persistence[h],
      load: p.load[h],
      expected,
      lo,
      hi,
      level: hourLevel(expected, limit),
      hiAtCap: !!limit && hi !== null && hi >= limit.cap - 0.5,
      lep: target.lep![h],
      windF: target.windF![h],
      net: p.net[h],
      actual: input.actual?.[h] ?? null,
    };
  });

  const backtest: PreBidBacktest | null = errs.length
    ? (() => {
        const m = errs.map((e) => e.err.reduce((s, v) => s + Math.abs(v), 0) / H);
        const b = errs.map((e) => e.baseErr.reduce((s, v) => s + Math.abs(v), 0) / H);
        const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
        return {
          days: errs.length,
          modelMae: avg(m),
          baselineMae: avg(b),
          improvementPct: (1 - avg(m) / avg(b)) * 100,
          betterDaysPct: (m.filter((v, i) => v < b[i]).length / m.length) * 100,
        };
      })()
    : null;

  const ex = rows.map((r) => r.expected!);
  const meanExpected = ex.reduce((s, v) => s + v, 0) / H;
  const meanBaseline = p.base.mP.reduce((s, v) => s + v, 0) / H;
  let peak = { hour: 0, value: ex[0] };
  ex.forEach((v, h) => v > peak.value && (peak = { hour: h, value: v }));
  const mean = (a: number[], x: number, y: number) =>
    a.slice(x, y + 1).reduce((s, v) => s + v, 0) / (y - x + 1);
  const actualCheck =
    full(input.actual) && hasBand
      ? {
          mae:
            input.actual.reduce((s, v, h) => s + Math.abs(v - rows[h].expected!), 0) / H,
          baselineMae:
            input.actual.reduce((s, v, h) => s + Math.abs(v - p.base.mP[h]), 0) / H,
          inInterval: input.actual.filter((v, h) => v >= rows[h].lo! && v <= rows[h].hi!)
            .length,
          hours: H,
        }
      : null;
  const summary = {
    meanExpected,
    meanBaseline,
    vsBaselinePct: meanBaseline > 0 ? (meanExpected / meanBaseline - 1) * 100 : null,
    peak,
    eveningMinusNoon: mean(ex, 18, 21) - mean(ex, 11, 14),
    hiAtCapHours: rows.filter((r) => r.hiAtCap).length,
    nearCapHours: rows.filter((r) => r.level === "cap" || r.level === "near").length,
    actualCheck,
  };

  const warnings: string[] = [];
  if (!hasBand)
    warnings.push(
      `± aralık için yeterli geçmiş gün yok (${errs.length}/${PREBID_MIN_ERROR_DAYS}); aralık gösterilmiyor.`
    );
  if (!limit) warnings.push("Fiyat limiti çıkarılamadı; beklenti tavanla kırpılmadı.");
  if (p.f.n < 10)
    warnings.push(`Katsayılar yalnız ${p.f.n} benzer günle uydurulmuş (az).`);

  const sentences: string[] = [
    `Referansa (son ${PREBID_REFERENCE_DAYS} günün ${DAY_CLASS_LABEL[cls]} ortancası) göre ortalama beklenti ${pctSigned(summary.vsBaselinePct ?? 0)}: ${nf0(meanBaseline)} → ${nf0(meanExpected)} TL/MWh.`,
    `Beklentiye göre en pahalı saat ${hh(peak.hour)} (${nf0(peak.value)} TL/MWh). Pik saati tahmin etme becerisi ölçümde yok (referans ±1 saatle %69, modeller %60–65); bunu fiyat seviyesi için değil şekil için güvenilir saymayın.`,
  ];
  if (summary.hiAtCapHours)
    sentences.push(
      `${summary.hiAtCapHours} saatte %90'lık aralığın üst ucu fiyat limitine (${nf0(cap)} TL/MWh) dayanıyor.`
    );

  return {
    ok: true,
    date,
    dayClass: cls,
    rows,
    coefficients: { persistence: p.f.k, load: p.f.b, trainDays: p.f.n },
    backtest,
    intervalDays: errs.length,
    summary,
    warnings,
    sentences,
  };
}
