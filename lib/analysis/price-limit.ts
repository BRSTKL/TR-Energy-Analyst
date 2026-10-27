/**
 * TR-Energy Analyst - PTF fiyat limiti (tavan) uyarısı
 *
 * Limitin kendisi EPDK / EPİAŞ kararıyla değişir ve elimizde resmî bir tablo yoktur; bu yüzden limit verideki platodan
 * çıkarılır: son `PRICE_LIMIT_WINDOW_DAYS` günde en az `PRICE_LIMIT_MIN_HOURS` saat görülen en yüksek PTF değeri. Ölçüm
 * (27.10.2026, doğrulanmış PTF): 2026 Ocak–Mart'ta 3.400 TL/MWh, Nisan'dan beri 4.500 TL/MWh; Ekim'de 38 saat tavanda,
 * 413 saat 0 TL. Çıkarılan değer her yerde "veriden çıkarıldı" diye yazılır, resmî değer gibi sunulmaz.
 * Tavandaki saatte dengesizlik fiyatı da kural değiştirir (azami fiyat limiti × 1,05, yönetmelik md. 110; yöntem sayfası).
 * SAF: I/O yok.
 */

import { ZERO_PRICE_MAX } from "./market-summary";

export type Series24 = Array<number | null>;

export const PRICE_LIMIT_WINDOW_DAYS = 60;
export const PRICE_LIMIT_MIN_HOURS = 3;
/** Tavana yakın: tavanın bu oranından yüksek */
export const NEAR_CAP_RATIO = 0.9;
const EPS = 0.01;

export interface PriceLimit {
  /** TL/MWh */
  cap: number;
  /** Pencerede (son PRICE_LIMIT_WINDOW_DAYS gün) tavanda görülen saat */
  hoursInWindow: number;
  /** Son 7 günde tavanda görülen saat */
  hoursLast7: number;
  windowDays: number;
  /** Bu değerin geçmişte ilk görüldüğü gün (YYYY-AA-GG) */
  firstSeen: string;
  /** Ondan önceki tavan (en az PRICE_LIMIT_MIN_HOURS saat görülmüş en yüksek değer); yoksa null */
  previousCap: number | null;
  /** Verinin son günü */
  lastDay: string;
}

export type HourLevel = "cap" | "near" | "zero" | null;

export interface PriceDay {
  date: string;
  ptf: Series24;
}

const hoursOf = (days: PriceDay[]) =>
  days.flatMap((d) => d.ptf.filter((v): v is number => v !== null && Number.isFinite(v)));

/** En az `minHours` saat görülen değerlerin en yükseği; yoksa null */
function plateau(values: number[], minHours: number): number | null {
  const counts = new Map<number, number>();
  for (const v of values) {
    const k = Math.round(v * 100) / 100;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [k, n] of Array.from(counts))
    if (n >= minHours && (best === null || k > best)) best = k;
  return best;
}

/** `days`: gün gün PTF (tarihe göre sıralı olması gerekmez). Tavan çıkarılamazsa null */
export function inferPriceLimit(
  days: PriceDay[],
  windowDays = PRICE_LIMIT_WINDOW_DAYS,
  minHours = PRICE_LIMIT_MIN_HOURS
): PriceLimit | null {
  const sorted = [...days]
    .filter((d) => d.ptf.some((v) => v !== null))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return null;
  const window = sorted.slice(-windowDays);
  const cap = plateau(hoursOf(window), minHours);
  if (cap === null || cap <= ZERO_PRICE_MAX) return null;
  const atCap = (d: PriceDay) => d.ptf.filter((v) => v !== null && v >= cap - EPS).length;
  const firstSeen = sorted.find((d) => atCap(d) > 0)!.date;
  const before = sorted.filter((d) => d.date < firstSeen);
  const prev = before.length ? plateau(hoursOf(before), minHours) : null;
  return {
    cap,
    hoursInWindow: window.reduce((s, d) => s + atCap(d), 0),
    hoursLast7: sorted.slice(-7).reduce((s, d) => s + atCap(d), 0),
    windowDays: window.length,
    firstSeen,
    previousCap: prev !== null && prev < cap ? prev : null,
    lastDay: sorted[sorted.length - 1].date,
  };
}

/** Saatin fiyat düzeyi: tavanda, tavana yakın (≥ %90), sıfır fiyat (taban) ya da null */
export function hourLevel(ptf: number | null, limit: PriceLimit | null): HourLevel {
  if (ptf === null || !Number.isFinite(ptf)) return null;
  if (ptf <= ZERO_PRICE_MAX) return "zero";
  if (!limit) return null;
  if (ptf >= limit.cap - 0.5) return "cap";
  if (ptf >= limit.cap * NEAR_CAP_RATIO) return "near";
  return null;
}

export const LEVEL_LABEL: Record<Exclude<HourLevel, null>, string> = {
  cap: "limitte",
  near: "limite yakın",
  zero: "sıfır fiyat",
};
