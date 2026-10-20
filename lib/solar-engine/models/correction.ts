/**
 * TR-Energy Analyst - Öğrenen düzeltme katmanı (Aşama 22.4)
 *
 * Bir tahmin modelinin (temel sürüm 3 ya da üç hava modelli birleşim) GEÇMİŞTEKİ ÖRNEKLEM DIŞI hatasını gradient boosting
 * (models/gbm.ts) ile öğrenir ve yeni tahmine ekler. Hedef: (gerçekleşen − tahmin) / tavan; tavan = tahmin modelinin
 * eğitimdeki en yüksek üretimi. Düzeltilmiş tahmin [0, max(tavan, tahmin)] aralığına kırpılır.
 * Özellikler (hepsi kesimden önce bilinir):
 *   saat, yılın günü (sin, cos), güneş yüksekliği (cos zenit), açıklık oranı (tahmin GHI / açık gök), bulut, sıcaklık,
 *   tahmin / tavan, hava modellerinin ayrışması (en yüksek − en düşük GHI tahmini / açık gök; yoksa 0),
 *   son günlerin hatası: hedef günden 9 ile 3 gün önceki gündüz saatlerinin ortalama (gerçekleşen − tahmin) / tavan
 *   (üretim en geç D-3: gerçek zamanlı üretim iki gün gecikir, kesim D-1 12:30; info-time productionFeature ile denetlenir).
 * Eğitim satırları: üretimi ve tahmini olan gündüz saatleri; sıfır fiyatlı ve uyduyla kayıp saatler çağıranın süzgecinde.
 * Tahminler örneklem dışı olmalı (her ay kendinden önceki pencereyle kurulan modelin tahmini): örneklem içi artık
 * küçük ve yanlıdır.
 * Kazancın kaynağı (güneş sıradaki işler 4 d): `drop` ile "son günlerin hatası" ya da "yılın günü" özellikleri sabitlenir
 * (ağaç onları kullanamaz); yalnız geriye dönük test içindir, canlı varsayılan boş. SAF: I/O yok.
 */

import { fitGbm, type GbmModel, type GbmOptions } from "./gbm";
import type { SolarHourV2 } from "./production-model-v2";
import type { SolarSite } from "./production-model";
import { clearSkyGhiHour, cosZenith } from "../physics/solar-geometry";
import { assertAvailable, productionFeature, TR_UTC_OFFSET_MS } from "../../forecast/info-time";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Son günlerin hatası penceresi: hedef günden RECENT_FROM ile RECENT_TO gün önce (ikisi dahil) */
export const RECENT_FROM_DAYS = 9;
export const RECENT_TO_DAYS = 3;
/** Bundan az eğitim satırında düzeltme kurulmaz (≈ 4 ayın gündüz saatleri) */
export const MIN_CORRECTION_ROWS = 1500;
export const CORRECTION_GBM: GbmOptions = { trees: 150, depth: 3, learningRate: 0.05, minLeaf: 40, subsample: 0.8, bins: 32, seed: 1 };
/** Çıkarılabilen özellik grupları (geriye dönük test) */
export type CorrectionDrop = "recent" | "doy";

export interface CorrectionInput {
  h: SolarHourV2;
  /** Düzeltilecek tahmin (MWh) */
  pred: number;
  /** Hava modellerinin GHI tahminleri (ayrışma için; yoksa boş) */
  ghis?: Array<number | null>;
  /** Son günlerin hatası (recentErrorFor); yoksa null */
  recent: number | null;
}

const dayOf = (t: number) => Math.floor(t / DAY) * DAY;

function features(r: CorrectionInput, site: SolarSite, cap: number, drop: CorrectionDrop[] = []): number[] | null {
  const h = r.h;
  if (h.ghi === null || h.temp === null || h.cloud === null) return null;
  const cs = clearSkyGhiHour(site.latitude, site.longitude, h.t);
  const kt = cs > 20 ? Math.min(h.ghi / cs, 1.5) : 0;
  const cz = Math.max(0, cosZenith(site.latitude, site.longitude, h.t - TR_UTC_OFFSET_MS + 30 * 60_000));
  const d = new Date(h.t);
  const doy = (dayOf(h.t) - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY;
  const g = (r.ghis ?? []).filter((v): v is number => v !== null);
  const spread = g.length >= 2 && cs > 20 ? (Math.max(...g) - Math.min(...g)) / cs : 0;
  const noDoy = drop.includes("doy");
  return [
    d.getUTCHours(),
    noDoy ? 0 : Math.sin((2 * Math.PI * doy) / 365.25),
    noDoy ? 0 : Math.cos((2 * Math.PI * doy) / 365.25),
    cz,
    kt,
    h.cloud / 100,
    h.temp,
    r.pred / cap,
    spread,
    drop.includes("recent") ? 0 : (r.recent ?? 0),
  ];
}

/** Hedef günün "son günlerin hatası": tahmin serisinden (saat → tahmin, gerçekleşen) gündüz saatlerinin ortalaması */
export function recentErrorFor(t: number, series: Map<number, { pred: number; actual: number | null }>, cap: number): number | null {
  const d0 = dayOf(t);
  let s = 0;
  let n = 0;
  for (let t2 = d0 - RECENT_FROM_DAYS * DAY; t2 < d0 - (RECENT_TO_DAYS - 1) * DAY; t2 += HOUR) {
    const v = series.get(t2);
    if (!v || v.actual === null || (v.pred <= 0.01 * cap && v.actual <= 0.01 * cap)) continue;
    s += (v.actual - v.pred) / cap;
    n++;
  }
  return n >= 20 ? s / n : null;
}

/** Son günlerin hatasının bilgi anı: en yeni kullanılan üretim saati (hedef günden RECENT_TO gün önceki günün son saati) */
function assertRecentAvailable(t: number): void {
  assertAvailable([productionFeature("recent_error", dayOf(t) - (RECENT_TO_DAYS - 1) * DAY - HOUR)], t);
}

export interface CorrectionModel {
  apply: (r: CorrectionInput) => number;
  rows: number;
  gbm: GbmModel;
}

/** Örneklem dışı tahminlerin geçmişinden düzeltme modeli; satır azsa null (tahmin olduğu gibi kalır) */
export function fitCorrection(
  rows: Array<CorrectionInput & { actual: number }>,
  site: SolarSite,
  cap: number,
  opts: GbmOptions = CORRECTION_GBM,
  drop: CorrectionDrop[] = []
): CorrectionModel | null {
  if (cap <= 0) return null;
  const X: number[][] = [];
  const y: number[] = [];
  for (const r of rows) {
    if (r.h.live) throw new Error("Canlı tahmin saati eğitime giremez");
    if (r.pred <= 0.01 * cap && r.actual <= 0.01 * cap) continue; // gece ve sıfır saatler
    assertRecentAvailable(r.h.t);
    const x = features(r, site, cap, drop);
    if (!x) continue;
    X.push(x);
    y.push((r.actual - r.pred) / cap);
  }
  if (X.length < MIN_CORRECTION_ROWS) return null;
  const gbm = fitGbm(X, y, opts);
  return {
    rows: X.length,
    gbm,
    apply: (r) => {
      if (!r.h.live) assertRecentAvailable(r.h.t);
      if (r.pred <= 0) return r.pred;
      const x = features(r, site, cap, drop);
      if (!x) return r.pred;
      return Math.min(Math.max(cap, r.pred), Math.max(0, r.pred + cap * gbm.predict(x)));
    },
  };
}
