/**
 * TR-Energy Analyst - KÜPST (Kesinleşmiş Günlük Üretim Programından Sapma Tutarı)
 *
 * Lisanslı üretici, dengesizlik tutarından ayrı olarak, saatlik plan sapmasının tolerans payını aşan kısmı için
 * sapma bedeli öder (DUY md. 110; tolerans ve katsayılar EPDK kurul kararıyla):
 *
 *   KÜPSM = max(0, |UEVM − KÜP| − tolerans × KÜP)          (saatlik, santral / uzlaştırma birimi bazında)
 *   KÜPST = KÜPSM × max(PTF, SMF) × katsayı
 *
 * Santral bazında hesaplandığı için şirket içinde netleşmez (dengesizlikten farkı budur).
 *
 * Dayanak ve belirsizlikler (29.09.2026'da kaynak metinlerle kontrol edildi):
 *   - 2025 öncesi: rüzgâr 0,21, güneş 0,12, diğer 0,05; katsayı 0,03 (13025 sayılı kararın değiştirdiği oranlar).
 *   - 01.01.2025'ten itibaren: rüzgâr 0,17, güneş 0,10, depolamalı ve diğer 0,05; katsayı n 0,03, aylık arıza ≥ 40
 *     (yenilenebilir) ise 0,05 (EPDK 21.11.2024 tarihli, 13025 sayılı karar; RG 17.12.2024, metin doğrulandı).
 *   - 01.01.2026'dan itibaren: rüzgâr 0,15, güneş 0,08, depolamalı ve diğer 0,05, iletimden bağlı lisanssız 0,20;
 *     katsayı n yenilenebilirde 0,05, aylık arıza ≥ 30 ise 0,08; depolamalı 0,10; dengeleme birimi toplulukları 0,05
 *     (EPDK "KÜPSM değerinin ve KÜPSM ile KÜPST hesaplamalarında kullanılacak katsayıların belirlenmesi" kurul kararı
 *     taslağı, Ekim 2025; taslak metni doğrulandı, nihai karar sayısı görülmedi). 13025 sayılı kararı yürürlükten kaldırır.
 *   - Formülün resmi metni görsel olarak yayımlandığından toleransın plan (KÜP) miktarına oranlandığı varsayılmıştır.
 *   - Arıza sayısına bağlı katsayı artışı (arıza kayıtları açık veride yok) ve topluluk / depolama katsayıları kapsam
 *     dışıdır: hesap, arızası eşiği aşmayan yenilenebilir santral içindir (alt sınır).
 * Bu nedenle rapor KÜPST'ü "tahmini" olarak etiketler.
 */

import type { HourlyResult } from "./types";

export interface KupstRegime {
  from: string;
  label: string;
  tolerance: { RES: number; GES: number; other: number };
  priceCoef: number;
}

export const KUPST_REGIMES: KupstRegime[] = [
  { from: "0000-01-01", label: "Rüzgâr %21, güneş %12, diğer %5 (2025 öncesi)", tolerance: { RES: 0.21, GES: 0.12, other: 0.05 }, priceCoef: 0.03 },
  { from: "2025-01-01", label: "Rüzgâr %17, güneş %10, diğer %5 (EPDK 13025)", tolerance: { RES: 0.17, GES: 0.1, other: 0.05 }, priceCoef: 0.03 },
  { from: "2026-01-01", label: "Rüzgâr %15, güneş %8, diğer %5; katsayı 0,05 (EPDK 2026 taslağı)", tolerance: { RES: 0.15, GES: 0.08, other: 0.05 }, priceCoef: 0.05 },
];

const STARTS = KUPST_REGIMES.map((r) => Date.parse(`${r.from}T00:00:00Z`));

export function kupstRegimeAt(timestamp: Date | string | number): KupstRegime {
  const t = new Date(timestamp).getTime();
  let idx = 0;
  for (let i = 0; i < STARTS.length; i++) if (t >= STARTS[i]) idx = i;
  return KUPST_REGIMES[idx];
}

const toleranceFor = (regime: KupstRegime, plantType: string) =>
  plantType === "RES" ? regime.tolerance.RES : plantType === "GES" ? regime.tolerance.GES : regime.tolerance.other;

/** Bir saatin KÜPST tutarı (TL). `regime` verilmezse saatin tarihine göre seçilir. */
export function kupstForHour(h: HourlyResult, plantType: string, regime: KupstRegime = kupstRegimeAt(h.timestamp)): number {
  // Mevzuat: KÜP, gün içi piyasası kapandıktan sonra güncellenen (son) plandır; havuzda yoksa ilk plan (üst sınıra yakın)
  const kup = h.forecastFinalMwh ?? h.forecastMwh;
  const plan = Math.max(kup, 0);
  const excess = Math.max(0, Math.abs(h.actualMwh - kup) - toleranceFor(regime, plantType) * plan);
  return excess * Math.max(h.ptf, h.smf) * regime.priceCoef;
}

/** Santralin saatlik sonuçları için toplam KÜPST */
export function kupstTotal(hourly: HourlyResult[], plantType: string, regime?: KupstRegime): number {
  let s = 0;
  for (const h of hourly) s += kupstForHour(h, plantType, regime);
  return s;
}
