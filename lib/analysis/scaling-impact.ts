/**
 * TR-Energy Analyst - Tahmin Ölçeklemesinin Dengesizlik Maliyetine Etkisi
 *
 * Tahmin serisi tek bir katsayıyla (Σ gerçekleşen / Σ tahmin) çarpılsaydı dengesizlik maliyeti ne olurdu?
 * Net hacim sapmasını gideren bu basit düzeltmenin TL cinsinden gerçek etkisini ölçer.
 *
 * planning-efficiency.ts'teki simülasyondan farkları:
 * - Yanlılık eşiği uygulanmaz; her santral aynı kuralla ölçeklenir.
 * - Sonuç sabitlenmez: ölçekleme maliyeti artırıyorsa değişim pozitif (kötüleşme) olarak döner.
 *
 * Katsayı aynı dönemin verisinden hesaplandığı için (in-sample) sonuç iyimser bir üst sınırdır.
 */

import { processHourlyRecord } from "@/lib/calculations/engine";
import {
  DEFAULT_IMBALANCE_PROFILE,
  HourlyResult,
  ImbalancePricingProfile,
} from "@/lib/calculations/types";

export interface ScalingImpact {
  scaleFactor: number;
  baselineImbalanceCost: number;
  scaledImbalanceCost: number;
  /** scaled − baseline; negatif = tasarruf, pozitif = maliyet artışı */
  changeTl: number;
  /** changeTl / baseline */
  changeRatio: number;
}

export function simulateForecastScaling(
  hourly: HourlyResult[],
  profile: ImbalancePricingProfile = DEFAULT_IMBALANCE_PROFILE
): ScalingImpact {
  let forecast = 0;
  let actual = 0;
  let baseline = 0;
  for (const h of hourly) {
    forecast += h.forecastMwh;
    actual += h.actualMwh;
    baseline += h.imbalanceCost;
  }

  const scaleFactor = forecast > 0 ? actual / forecast : 1;

  let scaled = 0;
  for (const h of hourly) {
    scaled += processHourlyRecord(
      { timestamp: h.timestamp, actualMwh: h.actualMwh, forecastMwh: h.forecastMwh * scaleFactor },
      { timestamp: h.timestamp, ptf: h.ptf, smf: h.smf, systemDirection: h.systemDirection },
      profile
    ).imbalanceCost;
  }

  const changeTl = scaled - baseline;

  return {
    scaleFactor,
    baselineImbalanceCost: baseline,
    scaledImbalanceCost: scaled,
    changeTl,
    changeRatio: baseline !== 0 ? changeTl / baseline : 0,
  };
}
