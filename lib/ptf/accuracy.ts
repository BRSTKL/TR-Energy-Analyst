/**
 * TR-Energy Analyst - PTF motoru: son günlerde fiyata ne kadar yakın tahmin etti (saf, I/O yok)
 *
 * Kayıttaki `band` son 60 günün düzeltilmiş birleşim hatasını, aynı günlerin ortalama fiyatını ve basit yöntemin
 * (benzer günlerin ortancası) hatasını taşır. Ekranda üç şey söylenir: saat başına ortalama sapma (TL/MWh), fiyata oranı (%)
 * ve basit yönteme göre ne kadar yakın olduğu. Hepsi geçmiş örneklem dışı gün tahminleri üstündendir; bugünün tahmininin
 * doğruluğu değil, motorun yakın geçmişteki sicilidir.
 */

import type { PtfForecastLog } from "./forecast-log";

export interface AccuracySummary {
  days: number;
  /** Saat başına ortalama mutlak sapma, TL/MWh */
  maeTl: number;
  /** Sapmanın ortalama fiyata oranı, %; fiyat bilinmiyorsa null */
  relPct: number | null;
  /** Basit yönteme göre iyileşme, % (pozitif: daha yakın); basit yöntem bilinmiyorsa null */
  vsBaselinePct: number | null;
}

export function accuracySummary(
  band: PtfForecastLog["band"] | null | undefined
): AccuracySummary | null {
  if (
    !band ||
    band.recentMae === null ||
    !Number.isFinite(band.recentMae) ||
    band.days <= 0
  )
    return null;
  const mae = band.recentMae;
  const price = band.meanPrice ?? null;
  const base = band.baselineMae ?? null;
  return {
    days: band.days,
    maeTl: mae,
    relPct: price !== null && price > 0 ? (mae / price) * 100 : null,
    vsBaselinePct: base !== null && base > 0 ? (1 - mae / base) * 100 : null,
  };
}
