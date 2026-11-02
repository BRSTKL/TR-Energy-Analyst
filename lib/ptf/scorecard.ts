/**
 * TR-Energy Analyst - PTF motoru: ileriye dönük karne (saf, I/O yok; dosya okuma lib/services/ptf-scorecard.ts)
 *
 * Değişmeyen günlük kayıtlar (`PtfForecastLog`) gerçekleşen PTF'yle karşılaştırılır. Yalnız kesimden önce yazılmış (`onTime`)
 * kayıt skorlanır; referans basit yöntem (benzer günlerin ortancası) aynı günde aynı bilgi kuralıyla hesaplanır. Betik
 * (scripts/ptf/scorecard.mts) ve Bugün kokpiti aynı fonksiyonları kullanır.
 */

import type { PtfForecastLog } from "./forecast-log";

/** Karar için gereken en az gün sayısı (altında ekranda "kanıt zayıf" yazılır) */
export const SCORECARD_MIN_DAYS = 30;

export interface ScoredDay {
  date: string;
  /** Saat başına ortalama mutlak sapma (TL/MWh) */
  mae: number;
  /** Ortalama (tahmin − gerçek) */
  bias: number;
  /** Referansın MAE'si; referans kurulamadıysa null */
  refMae: number | null;
  /** Aralığı olan saatler ve içinde kalanlar */
  banded: number;
  inside: number;
  actual: number[];
  p50: number[];
  q10: Array<number | null>;
  q90: Array<number | null>;
}

/** Bir günü skorlar; kayıt kesimden sonra yazıldıysa ya da saatleri eksikse null */
export function scoreDay(
  log: PtfForecastLog,
  actual: ReadonlyArray<number> | null | undefined,
  ref: ReadonlyArray<number> | null | undefined
): ScoredDay | null {
  if (!log.onTime || !actual || actual.length !== 24 || actual.some((v) => !Number.isFinite(v)))
    return null;
  if (log.hours.length !== 24) return null;
  const hours = [...log.hours].sort((a, b) => a.hour - b.hour);
  const p50 = hours.map((h) => h.p50);
  let sum = 0;
  let bias = 0;
  let refSum = 0;
  let banded = 0;
  let inside = 0;
  for (const h of hours) {
    const a = actual[h.hour];
    sum += Math.abs(h.p50 - a);
    bias += h.p50 - a;
    if (ref) refSum += Math.abs(ref[h.hour] - a);
    if (h.q10 !== null && h.q90 !== null) {
      banded++;
      if (a >= h.q10 && a <= h.q90) inside++;
    }
  }
  return {
    date: log.targetDate,
    mae: sum / 24,
    bias: bias / 24,
    refMae: ref ? refSum / 24 : null,
    banded,
    inside,
    actual: [...actual],
    p50,
    q10: hours.map((h) => h.q10),
    q90: hours.map((h) => h.q90),
  };
}

export interface ScoreSummary {
  days: number;
  mae: number;
  bias: number;
  /** Aynı günlerde referansın MAE'si ve ona göre iyileşme (%, pozitif: daha yakın); referanslı gün yoksa null */
  refMae: number | null;
  vsRefPct: number | null;
  /** Aralık kapsaması, % (hedef 80); aralıklı saat yoksa null */
  coveragePct: number | null;
}

export function summarizeScores(days: ScoredDay[]): ScoreSummary | null {
  if (!days.length) return null;
  const n = days.length;
  const mae = days.reduce((s, d) => s + d.mae, 0) / n;
  const bias = days.reduce((s, d) => s + d.bias, 0) / n;
  // Referans yalnız hepsinin referansı olan günlerde kıyaslanır (aynı günlerde elma ile elma)
  const withRef = days.filter((d) => d.refMae !== null);
  const refMae = withRef.length ? withRef.reduce((s, d) => s + (d.refMae as number), 0) / withRef.length : null;
  const maeSame = withRef.length ? withRef.reduce((s, d) => s + d.mae, 0) / withRef.length : null;
  const banded = days.reduce((s, d) => s + d.banded, 0);
  const inside = days.reduce((s, d) => s + d.inside, 0);
  return {
    days: n,
    mae,
    bias,
    refMae,
    vsRefPct: refMae && maeSame !== null && refMae > 0 ? ((refMae - maeSame) / refMae) * 100 : null,
    coveragePct: banded ? (inside / banded) * 100 : null,
  };
}

/** Karnenin güvenilirlik etiketi: gün sayısına göre */
export function evidenceLabel(days: number): string {
  if (days < SCORECARD_MIN_DAYS)
    return `Kanıt zayıf: ${days} gün (karar için en az ${SCORECARD_MIN_DAYS})`;
  return `${days} gün`;
}
