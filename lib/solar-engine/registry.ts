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

/** Adaylar. trainingMonths: eğitim penceresi; bias: temel tahmine günlük hata düzeltmesi */
export const MODEL_VARIANTS = [
  { id: BASE_MODEL, trainingMonths: 4, bias: false },
  { id: `${BASE_MODEL}-w2`, trainingMonths: 2, bias: false },
  { id: `${BASE_MODEL}-w6`, trainingMonths: 6, bias: false },
  { id: `${BASE_MODEL}-bias`, trainingMonths: 4, bias: true },
] as const;
/**
 * Kayıtlı gün BIAS_MIN_LOGGED_DAYS'ten azken hata düzeltmesi eğitimin son günlerinden (örneklem içi) kurulur ve bu ayrı
 * kimlikle yazılır: iki yöntem tek sürüm gibi değerlendirilmez; terfi edemez (sızıntı denetimi 19.10.2026).
 */
export const BIAS_INSAMPLE_MODEL = `${BASE_MODEL}-bias-insample`;
/** Karnede gerçekte gönderilen tahmin (o günün şampiyonu, sürümden bağımsız): seçim yanlılığı taşımaz */
export const LIVE_SERIES = "canlı";
export type ModelVariant = (typeof MODEL_VARIANTS)[number];
