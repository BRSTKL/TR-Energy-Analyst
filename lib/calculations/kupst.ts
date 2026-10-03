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
 *     (EPDK 11/12/2025 tarihli ve 14029 sayılı kurul kararı, RG 29.12.2025, 33122; metin 03.10.2026'da Resmî Gazete'den
 *     okunup doğrulandı). 13025 sayılı kararı yürürlükten kaldırır.
 *   - Formül (14029 md. 1, 13025 ile aynı): KÜPSM = UDÜPS − m × BUDÜP, UDÜPS = |UEVM − BUDÜP|, BUDÜP = KUDÜP + (YAL − YAT)
 *     + SRDM + SFHM; KUDÜP gün içi piyasası kapandıktan sonra güncellenen KGÜP. Tolerans, plan miktarına oranlanır
 *     (varsayım doğrulandı). Yük alma/atma talimatı ve yan hizmet terimleri açık veride santral bazında yok: sıfır alınır.
 *   - Toplayıcı portföyü (14029 / 13025 md. 4): dengeleme birimi olmayan lisanslı tesislerin KÜPST'ü topluluk için oluşturulan
 *     uzlaştırmaya esas veriş-çekiş birimi bazında hesaplanır (portföy toplamı; sapmalar netleşir); tolerans, kaynak
 *     türlerinin işletmedeki kurulu gücüne göre ağırlıklandırılır; fiyat katsayısı topluluk için md. 2(b): 2025'te 0,03,
 *     2026'da 0,05. Tesisler topluluk oluşturmazsa her biri münferit hesaplanır (kupstForHour).
 *   - Arıza sayısına bağlı katsayı artışı (arıza kayıtları açık veride yok) ve topluluk / depolama katsayıları kapsam
 *     dışıdır: hesap, arızası eşiği aşmayan yenilenebilir santral içindir (alt sınır).
 * Bu nedenle rapor KÜPST'ü "tahmini" olarak etiketler.
 */

import type { HourlyResult } from "./types";

export interface KupstRegime {
  from: string;
  label: string;
  tolerance: { RES: number; GES: number; other: number };
  /** Santral (UEVÇB) bazında fiyat katsayısı n (arızası eşiği aşmayan yenilenebilir) */
  priceCoef: number;
  /** Toplayıcı topluluğu (dengeleme birimi olmak üzere oluşturulan topluluk) için fiyat katsayısı: md. 2(b) */
  communityCoef: number;
}

export const KUPST_REGIMES: KupstRegime[] = [
  { from: "0000-01-01", label: "Rüzgâr %21, güneş %12, diğer %5 (2025 öncesi)", tolerance: { RES: 0.21, GES: 0.12, other: 0.05 }, priceCoef: 0.03, communityCoef: 0.03 },
  { from: "2025-01-01", label: "Rüzgâr %17, güneş %10, diğer %5 (EPDK 13025)", tolerance: { RES: 0.17, GES: 0.1, other: 0.05 }, priceCoef: 0.03, communityCoef: 0.03 },
  { from: "2026-01-01", label: "Rüzgâr %15, güneş %8, diğer %5; katsayı 0,05 (EPDK 14029)", tolerance: { RES: 0.15, GES: 0.08, other: 0.05 }, priceCoef: 0.05, communityCoef: 0.05 },
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

export interface KupstCommunityPlant {
  hourly: HourlyResult[];
  plantType: string;
  /** İşletmedeki elektriksel kurulu güç (MW): toleransın ağırlığı */
  capacityMw: number;
}

/**
 * Toplayıcı topluluğunun saatlik KÜPST'ü (14029 / 13025 md. 4): topluluk UEVÇB'sinin toplam UEVM'si ile toplam KÜP'ü
 * karşılaştırılır (santraller arası sapmalar netleşir); tolerans, o saatte verisi olan santrallerin kaynak türü
 * toleranslarının kurulu güce göre ağırlıklı ortalamasıdır; fiyat katsayısı topluluk katsayısıdır. Dönen: saat (ms) → TL.
 */
export function kupstCommunityHours(plants: KupstCommunityPlant[], regimeOverride?: KupstRegime): Map<number, number> {
  const byHour = new Map<number, { actual: number; kup: number; tolCap: number; cap: number; tolSum: number; n: number; h: HourlyResult }>();
  for (const p of plants) {
    for (const h of p.hourly) {
      const t = new Date(h.timestamp).getTime();
      const regime = regimeOverride ?? kupstRegimeAt(t);
      const tol = toleranceFor(regime, p.plantType);
      const b = byHour.get(t) ?? { actual: 0, kup: 0, tolCap: 0, cap: 0, tolSum: 0, n: 0, h };
      b.actual += h.actualMwh;
      b.kup += Math.max(h.forecastFinalMwh ?? h.forecastMwh, 0);
      b.tolCap += tol * p.capacityMw;
      b.cap += p.capacityMw;
      b.tolSum += tol;
      b.n += 1;
      byHour.set(t, b);
    }
  }
  const out = new Map<number, number>();
  for (const [t, b] of Array.from(byHour.entries())) {
    const regime = regimeOverride ?? kupstRegimeAt(t);
    const tol = b.cap > 0 ? b.tolCap / b.cap : b.tolSum / b.n; // kurulu güç bilinmiyorsa eşit ağırlık
    const excess = Math.max(0, Math.abs(b.actual - b.kup) - tol * b.kup);
    out.set(t, excess * Math.max(b.h.ptf, b.h.smf) * regime.communityCoef);
  }
  return out;
}

export function kupstCommunityTotal(plants: KupstCommunityPlant[], regimeOverride?: KupstRegime): number {
  let s = 0;
  for (const v of Array.from(kupstCommunityHours(plants, regimeOverride).values())) s += v;
  return s;
}
