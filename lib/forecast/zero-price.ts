/**
 * TR-Energy Analyst - Planlı kısıntı tahmini: sıfır fiyat olasılığı × santralin kısma oranı (Aşama 22.6; rüzgârda 23.7)
 *
 * Sorun: santraller sıfır fiyatlı saatte üretimi kısar (planlı kısıntı, lib/forecast/curtailment.ts "planned"). D günün
 * PTF'si GÖP sonucuyla D-1 öğleden sonra açıklanır, kesim D-1 12:30: sıfır fiyat kesimde ancak OLASILIK olarak bilinir.
 * Tahmin motorları eğitimde sıfır fiyatlı saatleri dışarıda bırakır (TRAIN_ZERO_PRICE_MAX), yani kısılmamış üretimi tahmin
 * eder. Beklenen kısıntı = P(sıfır fiyat) × santralin kısma oranı × tahmin; tahminden düşülür (`curtailedForecast`).
 *
 * (a) Sıfır fiyat olasılığı (`fitZeroPrice`): L2 lojistik regresyon (lib/analysis/direction-model.ts `fitLogistic`; λ sabit,
 *     test verisine bakılarak seçilmez). Özellikler (`ZERO_PRICE_FEATURES`), hepsi kesimden önce bilinir:
 *     - takvim: saat (24 kukla), yılın günü (iki harmonik), cumartesi, pazar, tatil (lib/forecast/tr-holidays.ts);
 *     - fiyat: D-1'in aynı saati sıfır mı, log(1 + PTF), son 7 günün aynı saatinde sıfır payı, D-1 gündüzünde (09–16)
 *       sıfır payı (D-1 PTF'si D-2 14:00'te yayımlanır; `marketFeature`);
 *     - isteğe bağlı ek özellikler (`extra`): çağıranın verdiği, kesimden önce bilinen beklentiler (ör. santralin kendi
 *       `d2` hava tahminiyle üretim / tavan oranı). Bilgi zamanını çağıran sağlar.
 *     Rakipler: iklim (`zeroPriceClimatology`: eğitim döneminde ay × saat sıfır fiyat payı) ve kalıcılık
 *     (`zeroPricePersistence`: D-1'in aynı saati sıfırsa / değilse eğitimde gerçekleşen sıfır payı). Brier karşılaştırması
 *     geriye dönük testte ölçülür; ay ay test sonucuna bakılarak model açılıp kapatılmaz (seçim sızıntısı). Karar bütün
 *     dönemin sonucuyla verilir, sonra gölge sürüm.
 * (b) Kısma oranı (`curtailmentRate`): geçmiş sıfır fiyatlı saatlerde kayıp ÷ beklenen üretim. Beklenen üretim gerçekleşen
 *     bilgiyle kurulur (güneşte uydu, `detectLostHours().expected`; rüzgârda `detectWindLoss`): yalnız ETİKET, etiket
 *     gecikmesinden önceki saatlerle. Az saatte sıfıra (kısıntı yok varsayımı) büzülür: (kayıp + 0) / (beklenen + k × ort.).
 *
 * Zaman: duvar saati ms (Türkiye saati UTC alanlarında). SAF: I/O yok.
 */

import { fitLogistic, predictLogistic, type LogisticModel } from "@/lib/analysis/direction-model";
import { ZERO_PRICE_MAX } from "@/lib/analysis/market-summary";
import { assertAvailable, calendarFeature, marketFeature, type FeatureInfo } from "@/lib/forecast/info-time";
import { isHolidayHour } from "@/lib/forecast/tr-holidays";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Model için en az satır ve en az sıfır fiyatlı saat (az olayla lojistik anlamsız) */
export const MIN_ZERO_PRICE_ROWS = 500;
export const MIN_ZERO_PRICE_EVENTS = 20;
export const ZERO_PRICE_LAMBDA = 1;
/** Son kaç günün aynı saatine bakılır */
export const RECENT_DAYS = 7;
/** D-1 gündüz payının saatleri (dahil) */
export const DAYTIME = [9, 16] as const;
/** Kısma oranının büzülmesi: bu kadar ortalama saatlik beklenen üretim sıfır kısıntıyla eklenir. Baştan seçildi
 * (≈ iki günün gündüz saatleri), test sonucuna bakılarak ayarlanmaz. */
export const CURTAIL_PSEUDO_HOURS = 20;

export const ZERO_PRICE_FEATURES = [
  ...Array.from({ length: 24 }, (_, h) => `saat_${h}`),
  "doy_sin",
  "doy_cos",
  "doy2_sin",
  "doy2_cos",
  "cumartesi",
  "pazar",
  "tatil",
  "dun_sifir",
  "dun_log_ptf",
  "son7_sifir_payi",
  "dun_gunduz_sifir_payi",
];

export interface ZeroPriceRow {
  t: number;
  x: number[];
  /** Hedef: 1 = PTF ≤ eşik; fiyatı henüz bilinmeyen (canlı) saatte null */
  y: 0 | 1 | null;
  /** Canlı tahmin saati: eğitime giremez */
  live?: boolean;
}

const startOfDay = (t: number) => Math.floor(t / DAY) * DAY;
const isZero = (p: number, max: number) => p <= max;

/** Satırın dayandığı bilgiler (bilgi zamanı denetimi): D-1 ve son 7 günün PTF'si, takvim */
function rowInfo(t: number): FeatureInfo[] {
  const h = t - startOfDay(t);
  const info: FeatureInfo[] = [calendarFeature("takvim")];
  for (let d = 1; d <= RECENT_DAYS; d++) info.push(marketFeature(`ptf_d-${d}`, startOfDay(t) - d * DAY + h));
  info.push(marketFeature("ptf_d-1_gunduz", startOfDay(t) - DAY + DAYTIME[1] * HOUR));
  return info;
}

/**
 * Hedef saatler için özellik satırları. `ptf`: saat → PTF (geçmiş; hedef günün kendisi gerekmez). D-1'in aynı saatinin
 * fiyatı yoksa satır kurulmaz. `extra`: saat → ek özellikler (her saat aynı uzunlukta) ya da null (satır kurulmaz).
 * `liveFrom`: bu andan sonraki saatler canlı sayılır (y = null, live = true).
 */
export function buildZeroPriceRows(
  targets: number[],
  ptf: Map<number, number>,
  opts: { extra?: (t: number) => number[] | null; zeroMax?: number; liveFrom?: number } = {}
): ZeroPriceRow[] {
  const zeroMax = opts.zeroMax ?? ZERO_PRICE_MAX;
  const rows: ZeroPriceRow[] = [];
  for (const t of targets) {
    const day = startOfDay(t);
    const hour = Math.round((t - day) / HOUR);
    const prev = ptf.get(t - DAY);
    if (prev === undefined) continue;
    assertAvailable(rowInfo(t), t);
    let recentN = 0;
    let recentZ = 0;
    for (let d = 1; d <= RECENT_DAYS; d++) {
      const p = ptf.get(t - d * DAY);
      if (p === undefined) continue;
      recentN++;
      if (isZero(p, zeroMax)) recentZ++;
    }
    let dayN = 0;
    let dayZ = 0;
    for (let k = DAYTIME[0]; k <= DAYTIME[1]; k++) {
      const p = ptf.get(day - DAY + k * HOUR);
      if (p === undefined) continue;
      dayN++;
      if (isZero(p, zeroMax)) dayZ++;
    }
    const extra = opts.extra ? opts.extra(t) : [];
    if (extra === null) continue;
    const date = new Date(t);
    const doy = (day - Date.UTC(date.getUTCFullYear(), 0, 1)) / DAY;
    const a = (2 * Math.PI * doy) / 365.25;
    const dow = date.getUTCDay();
    const x = [
      ...Array.from({ length: 24 }, (_, h) => (h === hour ? 1 : 0)),
      Math.sin(a),
      Math.cos(a),
      Math.sin(2 * a),
      Math.cos(2 * a),
      dow === 6 ? 1 : 0,
      dow === 0 ? 1 : 0,
      isHolidayHour(t) ? 1 : 0,
      isZero(prev, zeroMax) ? 1 : 0,
      Math.log1p(Math.max(0, prev)) / 10,
      recentN ? recentZ / recentN : 0,
      dayN ? dayZ / dayN : 0,
      ...extra,
    ];
    const live = opts.liveFrom !== undefined && t >= opts.liveFrom;
    const own = ptf.get(t);
    rows.push({ t, x, y: live || own === undefined ? null : isZero(own, zeroMax) ? 1 : 0, ...(live ? { live: true } : {}) });
  }
  return rows;
}

export interface ZeroPriceModel {
  /** P(PTF ≤ eşik) */
  predict: (row: ZeroPriceRow) => number;
  rows: number;
  events: number;
  model: LogisticModel;
}

/** Sıfır fiyat olasılığı modeli; satır ya da olay azsa null. Canlı saat ya da etiketsiz satır hata verir. */
export function fitZeroPrice(rows: ZeroPriceRow[], lambda = ZERO_PRICE_LAMBDA): ZeroPriceModel | null {
  for (const r of rows) {
    if (r.live) throw new Error("Canlı tahmin saati eğitime giremez");
    if (r.y === null) throw new Error("Etiketsiz satır eğitime giremez");
  }
  const events = rows.filter((r) => r.y === 1).length;
  if (rows.length < MIN_ZERO_PRICE_ROWS || events < MIN_ZERO_PRICE_EVENTS) return null;
  const model = fitLogistic(
    rows.map((r) => r.x),
    rows.map((r) => r.y as number),
    lambda
  );
  return { predict: (r) => predictLogistic(model, r.x), rows: rows.length, events, model };
}

/** Rakip: eğitim döneminde ay × saat sıfır fiyat payı (az örnekte bütün eğitimin saat payı) */
export function zeroPriceClimatology(rows: ZeroPriceRow[]): (t: number) => number {
  const key = (t: number) => new Date(t).getUTCMonth() * 24 + new Date(t).getUTCHours();
  const cell = new Map<number, [number, number]>();
  const hour = new Map<number, [number, number]>();
  for (const r of rows) {
    if (r.y === null) continue;
    for (const [m, k] of [
      [cell, key(r.t)],
      [hour, new Date(r.t).getUTCHours()],
    ] as const) {
      const c = m.get(k) ?? [0, 0];
      c[0] += r.y;
      c[1]++;
      m.set(k, c);
    }
  }
  return (t) => {
    const c = cell.get(key(t));
    if (c && c[1] >= 10) return c[0] / c[1];
    const h = hour.get(new Date(t).getUTCHours());
    return h && h[1] ? h[0] / h[1] : 0;
  };
}

/** Rakip: D-1'in aynı saati sıfırsa / değilse eğitim döneminde gerçekleşen sıfır payı (0/1 olasılık Brier'de haksız olurdu) */
export function zeroPricePersistence(rows: ZeroPriceRow[]): (row: ZeroPriceRow) => number {
  const j = ZERO_PRICE_FEATURES.indexOf("dun_sifir");
  const c = [
    [0, 0],
    [0, 0],
  ];
  for (const r of rows) {
    if (r.y === null) continue;
    const k = r.x[j] > 0.5 ? 1 : 0;
    c[k][0] += r.y;
    c[k][1]++;
  }
  const rate = c.map(([z, n]) => (n ? z / n : 0));
  return (row) => rate[row.x[j] > 0.5 ? 1 : 0];
}

/** Brier skoru (olasılık, 0/1) */
export function brier(pairs: Array<{ p: number; y: 0 | 1 }>): number {
  if (!pairs.length) return NaN;
  return pairs.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / pairs.length;
}

export interface CurtailmentHour {
  t: number;
  ptf: number | null;
  uevm: number | null;
  /** Gerçekleşen bilgiyle beklenen (kısılmamış) üretim, MWh; yoksa null */
  expected: number | null;
}

/**
 * Santralin sıfır fiyatta kısma oranı: Σ max(0, beklenen − gerçekleşen) ÷ Σ beklenen, sıfır fiyatlı ve beklenen üretimi
 * olan saatlerde; `CURTAIL_PSEUDO_HOURS` saatlik "kısıntısız" gözlemle sıfıra büzülür. [0, 1].
 */
export function curtailmentRate(hours: CurtailmentHour[], opts: { zeroMax?: number; minExpected?: number } = {}): { rate: number; hours: number; raw: number | null } {
  const zeroMax = opts.zeroMax ?? ZERO_PRICE_MAX;
  const minExpected = opts.minExpected ?? 0;
  let lost = 0;
  let exp = 0;
  let n = 0;
  for (const h of hours) {
    if (h.ptf === null || h.uevm === null || h.expected === null || h.expected <= minExpected || !isZero(h.ptf, zeroMax)) continue;
    lost += Math.min(h.expected, Math.max(0, h.expected - h.uevm));
    exp += h.expected;
    n++;
  }
  if (!n) return { rate: 0, hours: 0, raw: null };
  const mean = exp / n;
  return { rate: Math.min(1, Math.max(0, lost / (exp + CURTAIL_PSEUDO_HOURS * mean))), hours: n, raw: lost / exp };
}

/** Beklenen kısıntı düşülmüş tahmin: tahmin × (1 − p × oran); [0, tahmin] */
export function curtailedForecast(pred: number, pZero: number, rate: number): number {
  const p = Math.min(1, Math.max(0, pZero));
  const r = Math.min(1, Math.max(0, rate));
  return Math.max(0, pred * (1 - p * r));
}
