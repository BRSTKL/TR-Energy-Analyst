/**
 * TR-Energy Analyst - Güneş tahmin motorunun sürüm kayıt defteri: hangi sürümler var, nasıl kurulur
 *
 * Yeni bir yöntem (fiziksel zincir, çok model hava, öğrenen düzeltme…) buraya bir sürüm olarak eklenir; günlük akış
 * (pipeline.ts) her sürümle tahmin yapar, karne ölçer, şampiyon kararı (learning/self-learning.ts) kanıtla seçer.
 * Kimlikler kayıtta ve karnede sürüm adıdır: değiştirilmez (eski kayıtlar okunamaz olur), yeni kimlik eklenir.
 */

import { SOLAR_MODEL_ID } from "./learning/forecast-log";

/** Temel (ilk canlı) sürüm: donmuş sürüm 3, kalıcılıksız, geçici üretimle 4 ay eğitim */
export const BASE_MODEL = SOLAR_MODEL_ID;

/** Adaylar. trainingMonths: eğitim penceresi; bias: temel tahmine günlük hata düzeltmesi; ensemble: üç hava modelli
 * birleşim (models/ensemble.ts, Aşama 22.3: ECMWF + ICON-EU + GFS; tek eğitimle üçü birden) ya da onunla aynı çalışmada öğrenen
 * düzeltme katmanı (models/correction.ts, Aşama 22.4: "base-corr" temel, "weighted-corr" ağırlıklı birleşim üstüne) ya da
 * ağırlıklı+düzeltmeden beklenen planlı kısıntı düşülmüş tahmin (lib/forecast/zero-price.ts, Aşama 22.6: "weighted-corr-curt") */
export const MODEL_VARIANTS = [
  { id: BASE_MODEL, trainingMonths: 4, bias: false, ensemble: null },
  { id: `${BASE_MODEL}-w2`, trainingMonths: 2, bias: false, ensemble: null },
  { id: `${BASE_MODEL}-w6`, trainingMonths: 6, bias: false, ensemble: null },
  { id: `${BASE_MODEL}-bias`, trainingMonths: 4, bias: true, ensemble: null },
  { id: `${BASE_MODEL}-ens-mean`, trainingMonths: 4, bias: false, ensemble: "mean" },
  { id: `${BASE_MODEL}-ens-input`, trainingMonths: 4, bias: false, ensemble: "input" },
  { id: `${BASE_MODEL}-ens-weighted`, trainingMonths: 4, bias: false, ensemble: "weighted" },
  { id: `${BASE_MODEL}-corr`, trainingMonths: 4, bias: false, ensemble: "base-corr" },
  { id: `${BASE_MODEL}-ens-weighted-corr`, trainingMonths: 4, bias: false, ensemble: "weighted-corr" },
  { id: `${BASE_MODEL}-ens-weighted-corr-curt`, trainingMonths: 4, bias: false, ensemble: "weighted-corr-curt" },
] as const;
/**
 * Kayıtlı gün BIAS_MIN_LOGGED_DAYS'ten azken hata düzeltmesi eğitimin son günlerinden (örneklem içi) kurulur ve bu ayrı
 * kimlikle yazılır: iki yöntem tek sürüm gibi değerlendirilmez; terfi edemez (sızıntı denetimi 19.10.2026).
 */
export const BIAS_INSAMPLE_MODEL = `${BASE_MODEL}-bias-insample`;
/**
 * Temel sürüm WeatherNext 3 girdisiyle (18.11.2026; sınama Eyl–Eki 2026: 227 → 205 TL/MWh). Ek kayıtla yazılır
 * (learning/forecast-log-store.ts `writeForecastAddendum`; WN3 D-1 00 UTC çalışması ≈ 11:10 TR'de yayımlanır, ana kayıt
 * 09:30'da). Canlı akış bu sürümü üretemediği için şimdilik terfi edemez (self-learning `promotable`): yalnız karne.
 */
export const SOLAR_WN3_MODEL = `${BASE_MODEL}-wn3`;
/** Karnede gerçekte gönderilen tahmin (o günün şampiyonu, sürümden bağımsız): seçim yanlılığı taşımaz */
export const LIVE_SERIES = "canlı";
export type ModelVariant = (typeof MODEL_VARIANTS)[number];
