/**
 * TR-Energy Analyst - Rüzgârda öğrenen düzeltme katmanı (Aşama 23.5; güneşteki 22.4'ün rüzgâr karşılığı)
 *
 * Bir rüzgâr tahmininin (medyan eğri, fiziksel eğri ya da birleşim) GEÇMİŞTEKİ ÖRNEKLEM DIŞI hatasını gradient boosting
 * (lib/forecast/gbm.ts, güneşle ortak) öğrenir ve yeni tahmine ekler. Hedef: (gerçekleşen − tahmin) / kurulu güç; düzeltilmiş
 * tahmin [0, kurulu güç] aralığına kırpılır. Özellikler (hepsi kesimden önce bilinir):
 *   - takvim: saat, yılın günü (sin, cos);
 *   - kararlılık: d2 10 m ↔ 100 m kesme üssü (gece kararlı katmanda model 100 m hızı sistematik yanlış verir), 2 m sıcaklık;
 *   - rüzgâr: 100 m hız, yön (sin, cos); modellerin hız ayrışması (yoksa 0);
 *   - rampa: tahminin son 3 ve 6 saatteki değişimi / kurulu güç (zamanlama hatası rampada büyür; tahminin kendisinden);
 *   - düzey: tahmin / kurulu güç;
 *   - son günlerin hatası: hedef günden 9 ile 3 gün önceki saatlerin ortalama (gerçekleşen − tahmin) / kurulu güç (üretim
 *     en geç D-3; info-time `productionFeature` ile denetlenir).
 * Eğitim satırları: üretimi ve tahmini olan saatler; sıfır fiyatlı ve kayıp saatler çağıranın süzgecinde. Ayarlar güneşle
 * aynı (CORRECTION_GBM), baştan sabit. Tahminler örneklem dışı olmalı (her ay kendinden önceki pencereyle kurulan modelin
 * tahmini). SAF: I/O yok.
 */

import { fitGbm, type GbmModel, type GbmOptions } from "@/lib/forecast/gbm";
import { assertAvailable, productionFeature } from "@/lib/forecast/info-time";
import { shearExponent } from "../physics/air-density";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const RECENT_FROM_DAYS = 9;
export const RECENT_TO_DAYS = 3;
/** Bundan az eğitim satırında düzeltme kurulmaz (≈ 2,5 ayın saatleri; rüzgâr gece de üretir) */
export const MIN_WIND_CORRECTION_ROWS = 1800;
export const WIND_CORRECTION_GBM: GbmOptions = { trees: 150, depth: 3, learningRate: 0.05, minLeaf: 40, subsample: 0.8, bins: 32, seed: 1 };

export interface WindCorrectionInput {
  t: number;
  /** Düzeltilecek tahmin (MWh) */
  pred: number;
  /** Aynı tahminin 3 ve 6 saat önceki değeri (yoksa null) */
  pred3: number | null;
  pred6: number | null;
  /** d2 100 m hız ve yön, 10 m hız, 2 m sıcaklık */
  ws: number | null;
  dir: number | null;
  ws10: number | null;
  temp: number | null;
  /** Modellerin hız ayrışması (m/s); yoksa null */
  spreadMs?: number | null;
  /** Son günlerin hatası (`windRecentError`); yoksa null */
  recent: number | null;
  live?: boolean;
}

const dayOf = (t: number) => Math.floor(t / DAY) * DAY;

function features(r: WindCorrectionInput, cap: number): number[] | null {
  if (r.ws === null || r.dir === null) return null;
  const d = new Date(r.t);
  const doy = (dayOf(r.t) - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY;
  const a = shearExponent(r.ws10, 10, r.ws, 100);
  const rad = Math.PI / 180;
  return [
    d.getUTCHours(),
    Math.sin((2 * Math.PI * doy) / 365.25),
    Math.cos((2 * Math.PI * doy) / 365.25),
    a === null ? 0.14 : Math.min(0.6, Math.max(-0.1, a)),
    r.temp ?? 15,
    r.ws,
    Math.sin(r.dir * rad),
    Math.cos(r.dir * rad),
    r.spreadMs ?? 0,
    r.pred3 === null ? 0 : (r.pred - r.pred3) / cap,
    r.pred6 === null ? 0 : (r.pred - r.pred6) / cap,
    r.pred / cap,
    r.recent ?? 0,
  ];
}

/** Hedef günün son günlerin hatası: tahmin serisinden (saat → tahmin, gerçekleşen) saatlerin ortalaması */
export function windRecentError(t: number, series: Map<number, { pred: number | null; actual: number | null }>, cap: number): number | null {
  const d0 = dayOf(t);
  let s = 0;
  let n = 0;
  for (let t2 = d0 - RECENT_FROM_DAYS * DAY; t2 < d0 - (RECENT_TO_DAYS - 1) * DAY; t2 += HOUR) {
    const v = series.get(t2);
    if (!v || v.actual === null || v.pred === null) continue;
    s += (v.actual - v.pred) / cap;
    n++;
  }
  return n >= 48 ? s / n : null;
}

function assertRecentAvailable(t: number): void {
  assertAvailable([productionFeature("recent_error", dayOf(t) - (RECENT_TO_DAYS - 1) * DAY - HOUR)], t);
}

export interface WindCorrectionModel {
  apply: (r: WindCorrectionInput) => number;
  rows: number;
  gbm: GbmModel;
}

/** Örneklem dışı tahminlerin geçmişinden düzeltme modeli; satır azsa null (tahmin olduğu gibi kalır) */
export function fitWindCorrection(rows: Array<WindCorrectionInput & { actual: number }>, capacityMw: number, opts: GbmOptions = WIND_CORRECTION_GBM): WindCorrectionModel | null {
  if (capacityMw <= 0) return null;
  const X: number[][] = [];
  const y: number[] = [];
  for (const r of rows) {
    if (r.live) throw new Error("Canlı tahmin saati eğitime giremez");
    assertRecentAvailable(r.t);
    const x = features(r, capacityMw);
    if (!x) continue;
    X.push(x);
    y.push((r.actual - r.pred) / capacityMw);
  }
  if (X.length < MIN_WIND_CORRECTION_ROWS) return null;
  const gbm = fitGbm(X, y, opts);
  return {
    rows: X.length,
    gbm,
    apply: (r) => {
      if (!r.live) assertRecentAvailable(r.t);
      const x = features(r, capacityMw);
      if (!x) return r.pred;
      return Math.min(capacityMw, Math.max(0, r.pred + capacityMw * gbm.predict(x)));
    },
  };
}
