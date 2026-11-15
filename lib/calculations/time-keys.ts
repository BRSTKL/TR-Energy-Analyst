/**
 * Saat başına çağrılan zaman anahtarları. `new Date(x).toISOString().slice(0, 7)` her saatte bir tarih ve iki metin
 * üretiyordu (büyük projelerde istek süresinin ve çöp toplamanın belirgin payı); sonuçlar aynıdır (UTC alanları).
 */

/** Zaman damgası (ms). Date ise kopyalamadan okunur. */
export const timeOf = (t: Date | string | number): number => (t instanceof Date ? t.getTime() : new Date(t).getTime());

/** "YYYY-MM" (UTC): toISOString().slice(0, 7) ile aynı (0–9999 yılları) */
export function utcMonthKey(t: Date | string | number): string {
  const d = t instanceof Date ? t : new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y < 1000 ? String(y).padStart(4, "0") : y}-${m < 10 ? "0" : ""}${m}`;
}
