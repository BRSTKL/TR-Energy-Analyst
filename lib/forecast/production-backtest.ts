/**
 * TR-Energy Analyst - Üretim tahmini geriye dönük testi: hata ve maliyet (PLAN 15.5)
 *
 * Aynı saat kümesinde (eşleştirilmiş: bütün adayların tahmini, üretim ve piyasa fiyatı olan saatler) her aday tahmin
 * dönemin kendi kuralıyla fiyatlanır: `processHourlyRecord` varsayılan mevzuat profili (katsayılar saatin tarihine
 * göre; 2026 öncesi sabit %3) ve KÜPST (`kupstTotal`, rejim saatin tarihine göre). Her aday "gün içinde düzeltilmeyen
 * plan" olarak fiyatlanır (ilk = son plan = tahmin): yalnız tahmin kalitesi karşılaştırılır. Şirketin son KGÜP'ü gün
 * içi bilgiyle düzeltilmiştir; yalnız referanstır (ayrı satır, kendi saatleriyle).
 * Gün bazında maliyet saklanır (15.6 bootstrap: gün blokları).
 */

import { processHourlyRecord } from "@/lib/calculations/engine";
import { kupstForHour } from "@/lib/calculations/kupst";
import type { MarketPriceRecord } from "@/lib/calculations/types";

const DAY = 86_400_000;

export interface BacktestHour {
  t: number;
  uevm: number | null;
  ptf: number | null;
}

export interface CandidateResult {
  hours: number;
  uevmMwh: number;
  maeMwh: number;
  /** Ortalama mutlak hata ÷ ortalama üretim (%) */
  maePct: number;
  biasMwh: number;
  imbalanceCostTl: number;
  kupstTl: number;
  totalTl: number;
  /** Gün başı (duvar saati ms) → toplam maliyet (TL) */
  daily: Record<string, number>;
}

/**
 * `forecasts`: aday adı → saat için tahmin (null: yok). Saat yalnız bütün adayların tahmini, üretim ve piyasa fiyatı
 * varsa sayılır. `filter` ek koşul (ör. sıfır fiyatlı saatleri dışarıda bırakmak).
 */
export function evaluateForecasts<H extends BacktestHour>(
  hours: H[],
  forecasts: Record<string, (h: H) => number | null>,
  market: Map<number, MarketPriceRecord>,
  plantType: string,
  filter: (h: H) => boolean = () => true
): Record<string, CandidateResult> {
  const names = Object.keys(forecasts);
  const out: Record<string, CandidateResult> = Object.fromEntries(
    names.map((n) => [n, { hours: 0, uevmMwh: 0, maeMwh: 0, maePct: 0, biasMwh: 0, imbalanceCostTl: 0, kupstTl: 0, totalTl: 0, daily: {} }])
  );
  for (const h of hours) {
    if (h.uevm === null || !filter(h)) continue;
    const m = market.get(h.t);
    if (!m) continue;
    const values = names.map((n) => forecasts[n](h));
    if (values.some((v) => v === null)) continue;
    const day = String(Math.floor(h.t / DAY) * DAY);
    names.forEach((n, i) => {
      const f = values[i]!;
      const r = processHourlyRecord({ timestamp: new Date(h.t), actualMwh: h.uevm!, forecastMwh: f, forecastFinalMwh: f }, m);
      const kupst = kupstForHour(r, plantType);
      const o = out[n];
      o.hours++;
      o.uevmMwh += h.uevm!;
      o.maeMwh += Math.abs(f - h.uevm!);
      o.biasMwh += f - h.uevm!;
      o.imbalanceCostTl += r.imbalanceCost;
      o.kupstTl += kupst;
      o.daily[day] = (o.daily[day] ?? 0) + r.imbalanceCost + kupst;
    });
  }
  for (const o of Object.values(out)) {
    o.totalTl = o.imbalanceCostTl + o.kupstTl;
    if (o.hours) {
      o.maePct = o.uevmMwh > 0 ? (o.maeMwh / o.uevmMwh) * 100 : 0;
      o.maeMwh /= o.hours;
      o.biasMwh /= o.hours;
    }
  }
  return out;
}
