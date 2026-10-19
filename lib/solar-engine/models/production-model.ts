/**
 * TR-Energy Analyst - Santral bazında güneş üretim tahmini (PLAN 15.4)
 *
 * D günü saatlik üretim (MWh) tahmini, D-1 12:30 kesiminden önce elde olan bilgiyle (info-time.ts; her özellik
 * eğitimde ve tahminde `assertAvailable` ile denetlenir):
 *   - 2 gün önceki ECMWF tahmini (`d2`): GHI, doğrudan, dağınık ışınım (saat ortalaması), sıcaklık, bulut (anlık);
 *   - açık gök GHI ve açıklık oranı (GHI ÷ açık gök) – takvim; konumdan hesaplanır (solar-geometry.ts);
 *   - aynı saatin 48 saat önceki üretimi (D-2; yoksa 0 ve gösterge) ve havaya göre düzeltilmiş kalıcılık: 48 saat önceki
 *     üretim × (bu saatin GHI tahmini ÷ 48 saat önceki saatin GHI tahmini, ikisi de `d2`; [0, 3]). Kalıcılık santralin
 *     kendi davranışını (panel açısı, kirlenme, inverter sınırı) taşır, oran hava değişimini (15.4 ön denemesi: D-2
 *     kalıcılığı Ağustos'ta yalın ışınım modelinden iyiydi; bu özellik o denemeden sonra eklendi, model sonra donduruldu).
 * Model: ridge (direction-model.ts `fitRidge`, standartlaştırılmış özellikler), λ sabit (test sonucuna göre seçilmez).
 * Güneş yokken (açık gök ve GHI ≈ 0) tahmin 0. Tahmin [0, eğitimdeki en yüksek saatlik üretim] aralığına kırpılır: bu
 * sınır kurulu güç DEĞİLDİR (kurulu güç üretimden türetilmez, CLAUDE.md), yalnız modelin dış değer sınırıdır.
 *
 * Eğitimden çıkarılan saatler (15.2 bulgusu): verisi eksik saatler, gece, sıfır fiyatlı saatler (PTF ≤ eşik: planlı
 * kısıntı; üretim havayı izlemez) ve devreye alma dönemi (`steadyFrom`). Test saatleri çıkarılmaz; kıyas 15.5'te
 * "tüm saatler" ve ayrımlı raporlanır.
 *
 * Rakipler: ilk KGÜP (ana), son KGÜP (referans; bilgi avantajlı), D-2 kalıcılık, iklim (eğitimin saat ortalaması).
 */

import { fitRidge, predictRidge, type RidgeModel } from "@/lib/analysis/direction-model";
import { assertAvailable, calendarFeature, productionFeature, weatherFeature, type FeatureInfo } from "../../forecast/info-time";
import { clearSkyGhiHour } from "../physics/solar-geometry";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Bir üretim saati: hedef, rakipler ve 2 gün önceki hava tahmini (üretim saatine hizalı, weather-codec.ts) */
export interface SolarHour {
  /** Üretim saatinin başı (duvar saati ms) */
  t: number;
  uevm: number | null;
  kgupFirst: number | null;
  kgupFinal: number | null;
  ptf: number | null;
  ghi: number | null;
  direct: number | null;
  diffuse: number | null;
  temp: number | null;
  cloud: number | null;
  /** Aynı saatin 48 saat önceki üretimi */
  lag48: number | null;
  /** 48 saat önceki saatin 2 gün önceki GHI tahmini (düzeltilmiş kalıcılık için) */
  ghiLag48: number | null;
}

export interface SolarSite {
  latitude: number;
  longitude: number;
}

export const SOLAR_FEATURE_NAMES = [
  "ghi_d2",
  "ghi2_d2",
  "direct_d2",
  "diffuse_d2",
  "temp_x_ghi_d2",
  "cloud_d2",
  "clear_sky",
  "clearness_d2",
  "uevm_lag48",
  "has_lag48",
  "lag48_weather_adjusted",
] as const;

export const DEFAULT_PRODUCTION_LAMBDA = 1;
/** Eğitimden çıkarılan sıfır fiyat eşiği (TL/MWh): bu saatlerde kısıntı yaygın */
export const TRAIN_ZERO_PRICE_MAX = 1;

/** Özellikler ve bilgi zamanları; hava eksikse null */
export function solarFeatures(h: SolarHour, site: SolarSite): { x: number[]; info: FeatureInfo[]; clearSky: number } | null {
  if (h.ghi === null || h.direct === null || h.diffuse === null || h.temp === null || h.cloud === null) return null;
  const cs = clearSkyGhiHour(site.latitude, site.longitude, h.t);
  const kt = cs > 20 ? Math.min(h.ghi / cs, 1.5) : 0;
  const ratio = h.ghiLag48 !== null && h.ghiLag48 > 20 ? Math.min(3, Math.max(0, h.ghi / h.ghiLag48)) : h.ghi > 20 ? 1 : 0;
  const adjusted = (h.lag48 ?? 0) * ratio;
  const x = [h.ghi, (h.ghi * h.ghi) / 1000, h.direct, h.diffuse, (h.temp * h.ghi) / 1000, h.cloud, cs, kt, h.lag48 ?? 0, h.lag48 === null ? 0 : 1, adjusted];
  const info: FeatureInfo[] = [
    weatherFeature("ghi_d2", h.t, "mean", 2),
    weatherFeature("direct_d2", h.t, "mean", 2),
    weatherFeature("diffuse_d2", h.t, "mean", 2),
    weatherFeature("temp_d2", h.t, "instant", 2),
    weatherFeature("cloud_d2", h.t, "instant", 2),
    calendarFeature("clear_sky"),
    productionFeature("uevm_lag48", h.t - 2 * DAY),
    weatherFeature("ghi_lag48_d2", h.t - 2 * DAY, "mean", 2),
  ];
  return { x, info, clearSky: cs };
}

const isNight = (ghi: number, clearSky: number) => clearSky < 1 && ghi < 1;

/**
 * Devreye alma bitişi: günlük en yüksek üretimin, verilen saatlerin en yüksek üretiminin `share` katına ilk ulaştığı
 * günün başı (duvar saati). Yalnız eğitim saatleriyle çağrılır.
 */
export function steadyFrom(hours: Array<{ t: number; uevm: number | null }>, share = 0.8): number | null {
  const daily = new Map<number, number>();
  for (const h of hours) {
    if (h.uevm === null) continue;
    const d = Math.floor(h.t / DAY) * DAY;
    daily.set(d, Math.max(daily.get(d) ?? 0, h.uevm));
  }
  const peak = Math.max(0, ...daily.values());
  if (peak <= 0) return null;
  const days = Array.from(daily.keys()).sort((a, b) => a - b);
  return days.find((d) => daily.get(d)! >= share * peak) ?? null;
}

export interface SolarModel {
  /** Tahmin (MWh); hava eksikse null */
  predict: (h: SolarHour) => number | null;
  /** İklim rakibi: eğitimin aynı saat ortalaması (gece hariç saatlerde) */
  climatology: (h: SolarHour) => number;
  trainHours: number;
  excluded: { missing: number; night: number; zeroPrice: number; commissioning: number };
  trainMaxMwh: number;
  steadyFrom: number | null;
  ridge: RidgeModel;
}

export function fitSolarModel(
  train: SolarHour[],
  site: SolarSite,
  opts: { lambda?: number; zeroPriceMax?: number; excludeCommissioning?: boolean } = {}
): SolarModel {
  const lambda = opts.lambda ?? DEFAULT_PRODUCTION_LAMBDA;
  const zeroMax = opts.zeroPriceMax ?? TRAIN_ZERO_PRICE_MAX;
  const steady = opts.excludeCommissioning === false ? null : steadyFrom(train);
  const excluded = { missing: 0, night: 0, zeroPrice: 0, commissioning: 0 };
  const xs: number[][] = [];
  const ys: number[] = [];
  const hourSum = new Array<number>(24).fill(0);
  const hourN = new Array<number>(24).fill(0);
  for (const h of train) {
    const f = solarFeatures(h, site);
    if (!f || h.uevm === null) {
      excluded.missing++;
      continue;
    }
    assertAvailable(f.info, h.t);
    if (isNight(h.ghi!, f.clearSky)) {
      excluded.night++;
      continue;
    }
    if (h.ptf !== null && h.ptf <= zeroMax) {
      excluded.zeroPrice++;
      continue;
    }
    if (steady !== null && h.t < steady) {
      excluded.commissioning++;
      continue;
    }
    xs.push(f.x);
    ys.push(h.uevm);
    const hr = new Date(h.t).getUTCHours();
    hourSum[hr] += h.uevm;
    hourN[hr]++;
  }
  if (xs.length < 100) throw new Error(`Eğitim için yeterli saat yok (${xs.length})`);
  const ridge = fitRidge(xs, ys, lambda);
  const trainMaxMwh = Math.max(...ys);
  return {
    predict: (h) => {
      const f = solarFeatures(h, site);
      if (!f) return null;
      assertAvailable(f.info, h.t);
      if (isNight(h.ghi!, f.clearSky)) return 0;
      return Math.min(trainMaxMwh, Math.max(0, predictRidge(ridge, f.x)));
    },
    climatology: (h) => {
      const hr = new Date(h.t).getUTCHours();
      return hourN[hr] ? hourSum[hr] / hourN[hr] : 0;
    },
    trainHours: xs.length,
    excluded,
    trainMaxMwh,
    steadyFrom: steady,
    ridge,
  };
}
