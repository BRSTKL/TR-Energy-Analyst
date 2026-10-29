/**
 * TR-Energy Analyst - günün fazı (saf, I/O yok): üst şerit ve Bugün kokpiti
 *
 * Enerji ticareti gününün saatleri sabit: yarının tahmini kesimden sonra (12:05), GÖP teklif kapanışı 12:30, fiyat 14:00'te
 * açıklanır. Faz bu saatlerden türer; sabitler PTF motorunun kendi sabitleriyle aynı kaynaktan gelir (ikinci kopya yok).
 */

import { GOP_CLOSE_MINUTES } from "@/lib/ptf/auto";
import { PTF_CUTOFF_MINUTES } from "@/lib/ptf/forecast-log";

/** Gün öncesi piyasası sonuçlarının (PTF) açıklandığı saat (Türkiye, dakika) */
export const RESULTS_MINUTES = 14 * 60;
/** Teklif öncesi hazırlığın başladığı saat */
export const PREP_END_MINUTES = 8 * 60;
/** Gün sonu fazının başladığı saat */
export const EVENING_MINUTES = 18 * 60;
/** Kapanışa bu kadar dakika kala faz "acil" sayılır */
export const URGENT_MINUTES = 15;

export type DayPhaseId =
  "prep" | "pre-bid" | "closing" | "awaiting" | "intraday" | "evening";

export interface DayPhase {
  id: DayPhaseId;
  label: string;
  /** Teklif kapanışına (12:30) kalan dakika; kapanış geçtiyse null */
  minutesToClose: number | null;
  /** Fiyatın açıklanmasına (14:00) kalan dakika; açıklandıysa null */
  minutesToResults: number | null;
  /** Kapanışa 15 dakika ya da daha az */
  urgent: boolean;
}

/** Türkiye saatiyle gün başından bu yana dakika (kesirli) */
export function trNowMinutes(now: number = Date.now()): number {
  const w = new Date(now + 3 * 3_600_000);
  return w.getUTCHours() * 60 + w.getUTCMinutes() + w.getUTCSeconds() / 60;
}

export function dayPhase(nowMinutes: number): DayPhase {
  const toClose = GOP_CLOSE_MINUTES - nowMinutes;
  const toResults = RESULTS_MINUTES - nowMinutes;
  const base = {
    minutesToClose: toClose > 0 ? toClose : null,
    minutesToResults: toResults > 0 ? toResults : null,
  };
  if (nowMinutes < PREP_END_MINUTES)
    return { id: "prep", label: "Hazırlık", ...base, urgent: false };
  if (nowMinutes < PTF_CUTOFF_MINUTES)
    return { id: "pre-bid", label: "Teklif öncesi", ...base, urgent: false };
  if (nowMinutes < GOP_CLOSE_MINUTES)
    return {
      id: "closing",
      label: "Teklif kapanışına",
      ...base,
      urgent: toClose <= URGENT_MINUTES,
    };
  if (nowMinutes < RESULTS_MINUTES)
    return { id: "awaiting", label: "Sonuç bekleniyor", ...base, urgent: false };
  if (nowMinutes < EVENING_MINUTES)
    return { id: "intraday", label: "Gün içi", ...base, urgent: false };
  return { id: "evening", label: "Gün sonu", ...base, urgent: false };
}

/** "16 dk", "1 sa 05 dk" (yukarı yuvarlar: kapanışa 15,2 dk kala "16 dk") */
export function formatCountdown(minutes: number): string {
  const m = Math.max(0, Math.ceil(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} sa ${String(m % 60).padStart(2, "0")} dk` : `${m} dk`;
}

/** Üst şeritte gösterilen kısa cümle: faz etiketi ve varsa geri sayım */
export function phaseText(p: DayPhase): string {
  if (p.id === "closing" && p.minutesToClose !== null)
    return `Teklif kapanışına ${formatCountdown(p.minutesToClose)}`;
  if (p.id === "pre-bid" && p.minutesToClose !== null)
    return `Teklif öncesi · kapanışa ${formatCountdown(p.minutesToClose)}`;
  if (p.id === "awaiting" && p.minutesToResults !== null)
    return `Sonuç bekleniyor · 14:00'e ${formatCountdown(p.minutesToResults)}`;
  return p.label;
}
