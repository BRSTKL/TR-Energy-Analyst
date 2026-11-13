/**
 * TR-Energy Analyst - Dengeden sorumlu grupta (DSG) netleşme sınırı (DUY md. 111/3–5)
 *
 * 1/1/2025'ten beri grup üyesi her piyasa katılımcısının saatlik bireysel dengesizliğinin tamamı grupta netleşmez:
 *
 *   PH = max(NAM, NSM),  DO = |BEDM| / PH
 *   DO ≤ oran ise dengesizliğin tamamı grupta; büyükse PH × oran kadarı grupta, kalanı katılımcının kendi dengesizlik
 *   fiyatıyla (md. 110/1) ayrıca yansıtılır.
 *
 * Saf üretici için (alış yok): TAM = 0, TSM = satış (≈ plan), NAM = UEVM, NSM = satış → PH = max(gerçekleşen, plan),
 * BEDM = gerçekleşen − plan. Uygulamada katılımcının satışları görünmediğinden plan (KGÜP / son plan) satış kabul edilir.
 *
 * Oran: 2025'te %10 (DUY md. 111/5, RG 17/12/2024, 32755, yürürlük 1/1/2025); 1/1/2026'dan itibaren %5 (EPDK 16/10/2025
 * tarihli ve 13869 sayılı kurul kararı, RG 18/10/2025, 33051). Oran her yıl 1 Aralık'a kadar kurul kararıyla belirlenir;
 * 2027 kararı yayımlanınca buraya eklenir. Metinler 13.11.2026'da Resmî Gazete ve mevzuat.gov.tr'den okundu.
 * Dağıtım şirketi + görevli tedarik şirketi gruplarına 1/1/2027'ye kadar %100 uygulanır (geçici md. 39); bu uygulamanın
 * kapsamı dışındadır.
 *
 * Aynı katılımcının (şirketin) kendi santralleri ve bir toplayıcı portföyü tek katılımcıdır: kendi içlerinde sınırsız
 * netleşir. Sınır yalnız farklı katılımcıların bir DSG'de birleşmesine uygulanır.
 *
 * SAF fonksiyonlar: I/O yok.
 */

import { processHourlyRecord, type PricedMarket } from "./engine";
import type { ImbalancePricingProfile } from "./types";

export const DSG_RATIO_REGIMES: { from: string; ratio: number; source: string }[] = [
  { from: "0000-01-01", ratio: Infinity, source: "2025 öncesi: sınır yok" },
  { from: "2025-01-01", ratio: 0.1, source: "DUY md. 111/5 (RG 17/12/2024)" },
  { from: "2026-01-01", ratio: 0.05, source: "EPDK 13869 (RG 18/10/2025)" },
];
const STARTS = DSG_RATIO_REGIMES.map((r) => Date.parse(`${r.from}T00:00:00Z`));

/** Saatin tarihindeki dengesizlik oranı sınırı (Infinity: sınır yok) */
export function dsgRatioAt(timestamp: Date | string | number): number {
  const t = new Date(timestamp).getTime();
  let r = DSG_RATIO_REGIMES[0].ratio;
  for (let i = 0; i < STARTS.length; i++) if (t >= STARTS[i]) r = DSG_RATIO_REGIMES[i].ratio;
  return r;
}

/** Bir katılımcının saatlik dengesizliğini (gerçekleşen − plan) grupta netleşen ve kendisine kalan kısma ayırır */
export function splitMemberImbalance(forecastMwh: number, actualMwh: number, ratio: number): { inGroup: number; excess: number } {
  const b = actualMwh - forecastMwh;
  if (!Number.isFinite(ratio)) return { inGroup: b, excess: 0 };
  const cap = ratio * Math.max(actualMwh, forecastMwh, 0);
  const inGroup = Math.max(-cap, Math.min(cap, b));
  return { inGroup, excess: b - inGroup };
}

export interface DsgMemberHour {
  forecastMwh: number;
  actualMwh: number;
}

/**
 * Bir saatte DSG'nin toplam dengesizlik maliyeti (TL): grupta netleşen kısımların toplamı grup olarak, sınırı aşan
 * kısımlar her katılımcıya ayrı fiyatlanır. Tek üyeli grupta sonuç üyenin kendi maliyetine eşittir (maliyet her yönde
 * doğrusal olduğundan ayırma maliyeti değiştirmez).
 */
export function dsgHourCost(members: DsgMemberHour[], market: PricedMarket, profile: ImbalancePricingProfile): number {
  if (members.length === 0) return 0;
  const ratio = dsgRatioAt(market.timestamp);
  const cost = (forecastMwh: number, actualMwh: number) =>
    processHourlyRecord({ timestamp: market.timestamp, forecastMwh, actualMwh }, market, profile).imbalanceCost;
  let f = 0;
  let g = 0;
  let excessCost = 0;
  for (const m of members) {
    const { inGroup, excess } = splitMemberImbalance(m.forecastMwh, m.actualMwh, ratio);
    f += m.forecastMwh;
    g += inGroup;
    if (excess !== 0) excessCost += cost(m.forecastMwh, m.forecastMwh + excess);
  }
  return cost(f, f + g) + excessCost;
}
