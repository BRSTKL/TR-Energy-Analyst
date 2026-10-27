/**
 * TR-Energy Analyst - PTF motoru: günlük tahmin kaydı (saf, I/O yok; dosya forecast-log-store.ts)
 *
 * Her hedef gün için bir kez yazılan, bir daha değişmeyen kayıt: ileriye dönük skorun tek dayanağı. Kesimden (T-1, 11:30
 * Türkiye) sonra yazılan kayıt `onTime: false` taşır ve skora girmez. Aralık: birleşim modelinin son 60 günlük örneklem dışı
 * saatlik hatalarının %10 ve %90 yüzdelikleri (nominal %80).
 */

import { H } from "./history";

export const PTF_LOG_FORMAT = 1;
/** Kesim: hedef günden önceki gün, Türkiye saatiyle (dakika) */
export const PTF_CUTOFF_MINUTES = 11 * 60 + 30;

export interface PtfLogHour {
  hour: number;
  p50: number;
  /** Hedef %80 aralığın alt ve üst ucu (adlar alanın tarihî adı; değerler %5/%95 hata yüzdeliğinden) */
  q10: number | null;
  q90: number | null;
}

export interface PtfForecastLog {
  format: number;
  targetDate: string;
  /** Yazılma anı (UTC ISO) */
  issuedAt: string;
  /** Kesim (UTC ISO) ve kesimden önce mi */
  cutoff: string;
  onTime: boolean;
  modelId: string;
  hours: PtfLogHour[];
  /** Birleşimi oluşturan modellerin saatlik tahminleri */
  members: Record<string, number[]>;
  /** Girdi notları: rüzgâr kaynağı (0 kalıcılık, 1 EPİAŞ tahmini), yedeğe düşen girdiler, canlı alınan alanlar */
  inputs: { windKind: number; fallbacks: string[]; live: string[] };
  /** Aralığın dayandığı örneklem dışı gün sayısı ve son 60 günde birleşimin hatası (TL/MWh) */
  band: { days: number; recentMae: number | null };
  cap: number | null;
}

/** Hedef gün için kesim anı (UTC ms) */
export function cutoffMs(targetDate: string): number {
  return (
    Date.parse(`${targetDate}T00:00:00Z`) -
    86_400_000 +
    PTF_CUTOFF_MINUTES * 60_000 -
    3 * 3_600_000
  );
}

const quantile = (v: number[], q: number) => {
  const a = [...v].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  return a[lo] + (a[Math.ceil(pos)] - a[lo]) * (pos - lo);
};

/** Saatlik aralık (hedef %80): geçmiş hataların (gerçek − tahmin) %5 / %95 yüzdeliği; en az 20 gün */
export const BAND_QUANTILES = [0.05, 0.95] as const;
export function bandsFrom(
  errorsByDay: number[][],
  p50: number[],
  cap: number | null
): Array<{ q10: number | null; q90: number | null }> {
  const ok = errorsByDay.length >= 20;
  const clamp = (v: number) => Math.max(0, cap ? Math.min(cap, v) : v);
  return Array.from({ length: H }, (_, h) =>
    ok
      ? {
          q10: clamp(
            p50[h] +
              quantile(
                errorsByDay.map((e) => e[h]),
                BAND_QUANTILES[0]
              )
          ),
          q90: clamp(
            p50[h] +
              quantile(
                errorsByDay.map((e) => e[h]),
                BAND_QUANTILES[1]
              )
          ),
        }
      : { q10: null, q90: null }
  );
}
