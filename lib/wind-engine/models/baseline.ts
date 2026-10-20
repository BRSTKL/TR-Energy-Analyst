/**
 * TR-Energy Analyst - Rüzgâr motoru temel sürümü (Aşama 23.2): güç eğrisi + hava yoğunluğu düzeltmesi
 *
 * Mevcut güç eğrisi (lib/forecast/wind-forecast.ts `fitWindForecast`: 100 m hız × yön hücresinde üretimin medyanı, eğitim
 * temizliği, bilgi zamanı denetimi) aynen kullanılır; `density: true` ile hız önce yoğunluğa göre eşdeğer hıza çevrilir
 * (physics/air-density.ts). Yoğunluk aynı hava sürümünün (d2) 2 m sıcaklığı ve yüzey basıncından; yoksa santral rakımı ve
 * deniz seviyesi basıncından. Yoğunluğu hesaplanamayan saatte hız düzeltilmez (ρ₀ varsayılır).
 * `density: false` mevcut eğriyle birebir aynıdır (testle sabit): temel kıyas.
 *
 * Bilgi zamanı: sıcaklık ve basınç rüzgârla aynı çalışmadan geldiği için aynı `availableAt`; `fitWindForecast` her
 * tahminde rüzgâr özelliklerini denetler, sıcaklık ve basınç burada ayrıca denetlenir. SAF: I/O yok.
 */

import { assertAvailable, weatherFeature } from "@/lib/forecast/info-time";
import { fitWindForecast, type WindFcHour, type WindForecastModel } from "@/lib/forecast/wind-forecast";
import { airDensity, densityAdjustedSpeed, stationPressure } from "../physics/air-density";

type Lead = "d1" | "d2";
type ByLead = { d1: number | null; d2: number | null };

export interface WindEngineHour extends WindFcHour {
  /** 2 m sıcaklık (°C), sürüm başına */
  temp?: ByLead;
  /** Yüzey basıncı (hPa), sürüm başına */
  pressure?: ByLead;
  /** Deniz seviyesi basıncı (hPa), sürüm başına; yüzey basıncı yoksa */
  msl?: ByLead;
  /** 10 m hız (m/s), sürüm başına; kesme üssü için (23.3) */
  ws10?: ByLead;
}

export interface BaselineOptions {
  lead: Lead;
  trainingEnd: number;
  density: boolean;
  /** Santral rakımı (m); deniz seviyesi basıncından yüzey basıncına inmek için */
  elevationM?: number | null;
  leak?: boolean;
}

/** Saatin hava yoğunluğu (kg/m³) ya da null */
export function hourDensity(h: WindEngineHour, lead: Lead, elevationM: number | null = null): number | null {
  const t = h.temp?.[lead] ?? null;
  if (t === null) return null;
  const p = h.pressure?.[lead] ?? null;
  if (p !== null) return airDensity(t, p);
  const msl = h.msl?.[lead] ?? null;
  if (msl === null || elevationM === null) return null;
  return airDensity(t, stationPressure(msl, elevationM, t));
}

/** Hızları eşdeğer hıza çevrilmiş saat (her iki sürüm kendi yoğunluğuyla) */
export function withDensity(h: WindEngineHour, elevationM: number | null = null): WindEngineHour {
  const adj = (l: Lead) => {
    const ws = h.ws[l];
    return ws === null ? null : densityAdjustedSpeed(ws, hourDensity(h, l, elevationM));
  };
  return { ...h, ws: { d1: adj("d1"), d2: adj("d2") } };
}

export function fitWindBaseline(train: WindEngineHour[], capacityMw: number, opts: BaselineOptions): WindForecastModel & { density: boolean } {
  const elev = opts.elevationM ?? null;
  const prep = (h: WindEngineHour) => (opts.density ? withDensity(h, elev) : h);
  const model = fitWindForecast(train.map(prep), capacityMw, { lead: opts.lead, trainingEnd: opts.trainingEnd, leak: opts.leak });
  const L = opts.lead === "d2" ? 2 : 1;
  return {
    ...model,
    density: opts.density,
    predict: (h) => {
      // Sıcaklık ve basınç aynı çalışmadan, damga i ve i+1 ortalaması: iki damga da denetlenir (biri "instant", biri "mean")
      if (opts.density && !opts.leak) assertAvailable([weatherFeature(`t2m_${opts.lead}`, h.t, "instant", L), weatherFeature(`p_${opts.lead}`, h.t, "mean", L)], h.t);
      return model.predict(prep(h as WindEngineHour));
    },
  };
}
