/** Rüzgâr günlük kayıt sürümleri. Birleşimler gölgedir; mevcut temel otomatik değiştirilmez. */
export const WIND_BASE_MODEL = "wind-median-d2-uevm-v1";
export const WIND_SHADOWS = [
  { kind: "mean", id: "wind-ensemble-mean-v1" },
  { kind: "speed", id: "wind-ensemble-speed-v1" },
  { kind: "weighted", id: "wind-ensemble-weighted-v1" },
] as const;

export const WIND_CORRECTION_MODEL = "wind-median-correction-v1";
export const WIND_CURTAILMENT_MODEL = "wind-median-curtailment-v1";
