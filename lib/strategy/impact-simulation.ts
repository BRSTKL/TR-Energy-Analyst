/**
 * TR-Energy Analyst - Öneri Etkisi Simülasyonu
 *
 * Strateji önerilerinin "beklenen etki"sini sabit yüzdelerle değil, önerilen aksiyonu geçmiş veriye
 * uygulayıp hesaplama motorunu yeniden çalıştırarak ölçer. Sonuç negatif çıkabilir: bu durumda öneri
 * geçmiş veride maliyeti artırmıştır ve "önerilmez" olarak işaretlenir.
 *
 * Tüm simülasyonlar aynı dönemin verisiyle yapılır (in-sample); gelecekteki etki için üst sınır niteliğindedir.
 */

import { processHourlyRecord } from "@/lib/calculations/engine";
import { HourlyResult, ImbalancePricingProfile } from "@/lib/calculations/types";
import { calculateArbitrageOpportunity } from "@/lib/analysis/intraday-arbitrage";

export interface SimulatedImpact {
  /** Pozitif = maliyet azalır (tasarruf), negatif = maliyet artar */
  savingTl: number;
  /** savingTl / santralin toplam dengesizlik maliyeti (%) */
  percentOfCost: number;
  /** Simülasyonun ne yaptığı, tek cümle */
  method: string;
  /** Sonucu yorumlarken bilinmesi gereken sınırlama */
  caveat: string;
}

export const totalImbalanceCost = (hourly: HourlyResult[]) => hourly.reduce((s, h) => s + h.imbalanceCost, 0);

function toImpact(savingTl: number, hourly: HourlyResult[], method: string, caveat: string): SimulatedImpact {
  const base = totalImbalanceCost(hourly);
  return {
    savingTl: Number(savingTl.toFixed(2)),
    percentOfCost: base > 0 ? Number(((savingTl / base) * 100).toFixed(1)) : 0,
    method,
    caveat,
  };
}

/**
 * Seçilen saatlerde tahmin `multiplier` ile çarpılsaydı dengesizlik maliyeti ne kadar değişirdi?
 * Seçilmeyen saatler aynen kalır. Dönen değer tasarruftur (eski maliyet − yeni maliyet).
 */
export function simulateForecastMultiplier(
  hourly: HourlyResult[],
  select: (h: HourlyResult) => boolean,
  multiplier: number,
  profile: ImbalancePricingProfile
): number {
  let saving = 0;
  for (const h of hourly) {
    if (!select(h)) continue;
    const simulated = processHourlyRecord(
      { timestamp: h.timestamp, actualMwh: h.actualMwh, forecastMwh: h.forecastMwh * multiplier },
      { timestamp: h.timestamp, ptf: h.ptf, smf: h.smf, systemDirection: h.systemDirection },
      profile
    );
    saving += h.imbalanceCost - simulated.imbalanceCost;
  }
  return saving;
}

/**
 * Seçilen saatlerde dengesizliğin `share` kadarı GİP AOF'tan kapatılsaydı elde edilecek net tasarruf.
 * GİP'in dezavantajlı olduğu saatler de dahildir (fiyat önceden bilinmez). GİP verisi olmayan saatler atlanır.
 */
export function simulateIntradayShare(
  hourly: HourlyResult[],
  select: (h: HourlyResult) => boolean,
  share: number
): { savingTl: number; hoursWithGip: number } {
  let saving = 0;
  let hoursWithGip = 0;
  for (const h of hourly) {
    if (!select(h) || h.gipPrice === null || h.gipPrice === undefined || Number.isNaN(h.gipPrice)) continue;
    hoursWithGip++;
    saving += share * calculateArbitrageOpportunity(h.imbalanceMwh, h.gipPrice, h.positivePrice, h.negativePrice);
  }
  return { savingTl: saving, hoursWithGip };
}

/** Değerlerin p. yüzdelik dilimi (0–1), doğrusal enterpolasyonsuz: sıralı dizideki en yakın alt eleman */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

export const INTRADAY_SHARE = 0.25;

/** Belirli saatlerde hatanın %25'ini GİP'te kapatma önerisinin etkisi (GİP verisi yoksa null) */
export function intradayImpact(
  hourly: HourlyResult[],
  select: (h: HourlyResult) => boolean,
  scopeLabel: string
): SimulatedImpact | null {
  const { savingTl, hoursWithGip } = simulateIntradayShare(hourly, select, INTRADAY_SHARE);
  if (hoursWithGip === 0) return null;
  return toImpact(
    savingTl,
    hourly,
    `${scopeLabel} saatlerinde dengesizliğin %${INTRADAY_SHARE * 100} payı GİP ağırlıklı ortalama fiyatından kapatıldı (${hoursWithGip.toLocaleString("tr-TR")} saat).`,
    "Kapatılan payın gün içinde öngörülebildiği varsayılır; likidite ve AOF'tan sapma dikkate alınmaz."
  );
}

/** Seçilen saatlerde tahmini çarpanla değiştirme önerisinin etkisi */
export function multiplierImpact(
  hourly: HourlyResult[],
  select: (h: HourlyResult) => boolean,
  multiplier: number,
  profile: ImbalancePricingProfile,
  method: string,
  caveat: string
): SimulatedImpact {
  return toImpact(simulateForecastMultiplier(hourly, select, multiplier, profile), hourly, method, caveat);
}
