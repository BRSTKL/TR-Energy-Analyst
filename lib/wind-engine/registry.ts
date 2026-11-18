/** Rüzgâr günlük kayıt sürümleri. Birleşimler gölgedir; mevcut temel otomatik değiştirilmez. */
export const WIND_BASE_MODEL = "wind-median-d2-uevm-v1";
/**
 * Uzun eğitim süresi (gün): birleşim gölgeleri ve "temel 480 gün" gölgesi. Sınama (18.11.2026, wind-candidates-backtest
 * `--set window`): 120 → 480 gün her modelde ≈ %4 ucuz, 480 gün bütün geçmişle aynı. Canlı temel 120 günde kalır (terfi yolu).
 */
export const WIND_LONG_TRAIN_DAYS = 480;
/** Birleşimler (v2: 480 gün eğitim; v1 120 gündü, 26.10–18.11.2026 kayıtlarında) */
export const WIND_SHADOWS = [
  { kind: "mean", id: "wind-ensemble-mean-v2" },
  { kind: "speed", id: "wind-ensemble-speed-v2" },
  { kind: "weighted", id: "wind-ensemble-weighted-v2" },
] as const;
/** Canlı temelin birebiri, 480 gün eğitimle (gölge; terfiyle canlıya geçer) */
export const WIND_BASE_LONG_MODEL = "wind-median-d2-uevm-480-v1";

export const WIND_CORRECTION_MODEL = "wind-median-correction-v1";
export const WIND_CURTAILMENT_MODEL = "wind-median-curtailment-v1";
/** Ağırlıklı birleşim (bütün geçmiş) + öğrenen düzeltme (learning/ensemble-correction.ts; 17.11.2026) */
export const WIND_ENSEMBLE_CORRECTION_MODEL = "wind-ensemble-weighted-corr-v1";
