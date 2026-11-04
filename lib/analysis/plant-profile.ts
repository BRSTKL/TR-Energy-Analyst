/**
 * TR-Energy Analyst - Santral kartı: günün saatine göre üretim ve gelir dağılımı
 *
 * Bir santralin saatleri (üretim MWh ve PTF) günün saatine göre toplanır: hangi saatlerde ne kadar ürettiği, o saatlerin
 * ortalama PTF'si, üretimin ve gelirin payı. Gelir = Σ üretim × PTF (gün öncesi fiyatıyla; dengesizlik ve KÜPST dahil
 * değil). Ay kırılımı `monthlyCapture` (capture-rate.ts), ortalama fiyat tanımı `captureStat` ile aynıdır.
 * SAF: I/O yok.
 */

import type { CaptureHour } from "@/lib/analysis/capture-rate";

export interface HourOfDayRow {
  /** 0–23 (duvar saati) */
  hour: number;
  /** Bu saatte verisi olan gün sayısı */
  days: number;
  /** Ortalama üretim, MWh */
  avgMwh: number;
  /** Bu saatlerin ortalama PTF'si, TL/MWh */
  avgPtfTl: number;
  /** Toplam üretimin bu saate düşen payı (%) */
  mwhSharePct: number;
  /** Toplam gelirin bu saate düşen payı (%); gelir yoksa 0 */
  revenueSharePct: number;
}

/** 24 satır, her zaman 0–23; verisi olmayan saatte days = 0 ve sayılar 0 */
export function hourOfDayProfile(hours: CaptureHour[]): HourOfDayRow[] {
  const acc = Array.from({ length: 24 }, () => ({ n: 0, mwh: 0, ptf: 0, value: 0 }));
  let totalMwh = 0;
  let totalValue = 0;
  for (const h of hours) {
    const a = acc[new Date(h.t).getUTCHours()];
    a.n++;
    a.mwh += h.mwh;
    a.ptf += h.ptf;
    a.value += h.mwh * h.ptf;
    totalMwh += h.mwh;
    totalValue += h.mwh * h.ptf;
  }
  return acc.map((a, hour) => ({
    hour,
    days: a.n,
    avgMwh: a.n ? a.mwh / a.n : 0,
    avgPtfTl: a.n ? a.ptf / a.n : 0,
    mwhSharePct: totalMwh > 0 ? (a.mwh / totalMwh) * 100 : 0,
    revenueSharePct: totalValue > 0 ? (a.value / totalValue) * 100 : 0,
  }));
}

/** Verisi olan saat sayısının beklenen saate oranı (%) */
export const coveragePct = (haveHours: number, expectedHours: number): number =>
  expectedHours > 0 ? Math.min(100, (haveHours / expectedHours) * 100) : 0;
