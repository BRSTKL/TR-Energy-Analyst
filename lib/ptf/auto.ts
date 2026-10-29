/**
 * TR-Energy Analyst - PTF motoru: günlük otomatik çalışmanın kararı ve telefon özeti (saf, I/O yok; betik scripts/ptf/forecast-daily.mts)
 *
 * Kesim 12:05 (lib/ptf/forecast-log.ts): EPİAŞ yarının yük tahminini 11:02 ile 12:02 arasında yayımlıyor (28 ve 29.10.2026 anlık
 * görüntüleri: 11:02'de yok, 12:02'de var). Sunucu işi 12:03, 12:15 ve 12:25'te çalışır:
 *   - 12:03'te yük tahmini varsa hemen yazar; yoksa kesime (12:05) kadar yoklar.
 *   - Kesimde de yoksa çıkar, 12:15 ve 12:25'te yeniden dener; o zaman yazılan kayıt `onTime: false` taşır (skora girmez).
 *   - 12:30'dan (GÖP kapanışı) sonra kayıt yazılmaz.
 */

import { PTF_CUTOFF_MINUTES, type PtfForecastLog } from "./forecast-log";
import { nf } from "@/lib/format";

/** GÖP teklif kapanışı (Türkiye, dakika) */
export const GOP_CLOSE_MINUTES = 12 * 60 + 30;
/** Son deneme: bundan sonraki çalışmada başarısızlık telefona bildirilir */
export const FINAL_ATTEMPT_MINUTES = 12 * 60 + 20;
/** Kesimden bu kadar dakika önce başlayan çalışma yük tahminini beklemez */
const EARLY_MINUTES = 5;

export type AutoAction =
  /** Yük tahmini elde: tahmini kur ve kaydı yaz */
  | "write"
  /** Kesime kadar kısa aralıklarla yeniden sor */
  | "wait"
  /** Yük tahmini yok: çık, sonraki çalışma dener */
  | "retry"
  /** Çok erken (manuel çalıştırma): çık */
  | "early"
  /** GÖP kapanışı geçti: kayıt yazılmaz */
  | "closed";

/** `nowMinutes`: Türkiye saatiyle gün başından bu yana dakika (kesirli olabilir) */
export function planAuto(input: { nowMinutes: number; hasLep: boolean }): AutoAction {
  const { nowMinutes, hasLep } = input;
  if (nowMinutes >= GOP_CLOSE_MINUTES) return "closed";
  if (hasLep) return "write";
  if (nowMinutes < PTF_CUTOFF_MINUTES - EARLY_MINUTES) return "early";
  if (nowMinutes < PTF_CUTOFF_MINUTES) return "wait";
  return "retry";
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** Telefon bildirimi: yazılan kaydın düz Türkçe özeti */
export function forecastNotification(
  log: PtfForecastLog,
  notes: string[] = []
): { title: string; text: string } {
  const p = log.hours.map((h) => h.p50);
  const mean = p.reduce((s, v) => s + v, 0) / p.length;
  const max = p.indexOf(Math.max(...p));
  const min = p.indexOf(Math.min(...p));
  const lo = log.hours.map((h) => h.q10).filter((v): v is number => v !== null);
  const hi = log.hours.map((h) => h.q90).filter((v): v is number => v !== null);
  const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const parts = [
    `Ortalama ${nf(mean)} TL/MWh` +
      (lo.length && hi.length ? ` (olası aralık ${nf(avg(lo))}–${nf(avg(hi))})` : "") +
      ".",
    `En pahalı ${hh(max)} ${nf(p[max])}, en ucuz ${hh(min)} ${nf(p[min])}.`,
  ];
  const nearCap = log.cap ? p.filter((v) => v >= log.cap! * 0.9).length : 0;
  if (nearCap) parts.push(`Limite yakın ${nearCap} saat.`);
  if (log.band.recentMae !== null)
    parts.push(
      `Son ${log.band.days} gün motor saat başına ±${nf(log.band.recentMae)} saptı.`
    );
  const lv = log.level?.applied[log.modelId];
  if (lv && lv.basis && Math.abs(lv.adj) >= 1)
    parts.push(
      `Dünkü sapma düzeltmesi ${lv.adj > 0 ? "+" : "−"}${nf(Math.abs(lv.adj))} TL/MWh (dünkü kayıt ${dm(lv.basis)}).`
    );
  const missing: string[] = [];
  if (log.inputs.windKind !== 1 && log.inputs.windKind !== 4)
    missing.push("EPİAŞ rüzgâr tahmini yok, yedek kullanıldı");
  if (log.inputs.sunKind !== undefined && log.inputs.sunKind !== 1)
    missing.push("güneş için hava tahmini alınamadı, vekil kullanıldı");
  for (const f of log.inputs.fallbacks)
    if (f.startsWith("kgup:")) missing.push(`${f.slice(5)} üretim planı yok`);
  missing.push(...notes);
  if (missing.length) parts.push(`Eksik: ${missing.join("; ")}.`);
  parts.push(
    `Kayıt ${clock(log.issuedAt)}'te yazıldı` +
      (log.onTime ? " (kesimden önce)." : " (kesimden sonra: skora girmez).")
  );
  return { title: `PTF tahmini ${dm(log.targetDate)}`, text: parts.join(" ") };
}

/** Telefon bildirimi: kayıt yazılamadı (son deneme) */
export function failureNotification(
  target: string,
  reason: string
): { title: string; text: string } {
  return {
    title: `PTF tahmini ${dm(target)} yazılamadı`,
    text: `${reason} Teklif kapanışına (12:30) kadar Piyasa → Teklif öncesi sayfasından "Yenile" ile elle denenebilir.`,
  };
}
