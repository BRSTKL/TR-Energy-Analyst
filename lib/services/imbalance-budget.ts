/**
 * TR-Energy Analyst - Dengesizlik bütçesi için veri (PLAN 17)
 *
 * Projenin bugünkü santralleri için geçmiş yılların saatleri havuzdan (UEVM ve KGÜP) ve piyasa verisinden (PTF, SMF,
 * sistem yönü) bütçe saatlerine çevrilir (lib/analysis/imbalance-budget.ts). Plan varsayılan olarak ilk KGÜP'tür: havuzda
 * 2025'in son planı yok (2026'da var), yıllar arası tutarlılık için sapma ve KÜPST ilk plana göre hesaplanır (sonuç
 * sayfasının ana rakamıyla aynı taban; gün içi düzeltmeden önceki maruziyet, üst sınır). "final" seçilirse son KGÜP,
 * yoksa ilk KGÜP. Uzlaştırma birimi sonuç sayfasıyla aynı (şirket; toplayıcıda
 * toplayıcı). KÜPST miktarı mevzuat fonksiyonlarıyla, en güncel oranlarla: toplayıcıda topluluk, şirkette santral bazında.
 * Havuzda olmayan santraller (dosyadan yüklenen) atlanır ve sayılır.
 */

import { prisma } from "@/lib/prisma";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, type HourlyResult, type MarketPriceRecord, type SystemDirection } from "@/lib/calculations/types";
import { KUPST_REGIMES, kupstCommunityHours, kupstForHour } from "@/lib/calculations/kupst";
import { AGGREGATOR_ORG_ID } from "@/lib/projects/aggregator";
import { readPoolYearCached } from "@/lib/pool/pool-store";
import type { BudgetHour } from "@/lib/analysis/imbalance-budget";
import type { ProjectHourly } from "@/lib/services/project-hourly";

const HOUR = 3_600_000;
const latestKupst = KUPST_REGIMES[KUPST_REGIMES.length - 1];

export interface BudgetHoursResult {
  hours: BudgetHour[];
  /** Havuzda verisi olan / olmayan santraller */
  plantsUsed: number;
  plantsSkipped: string[];
  /** Yıl → saat sayısı */
  hoursByYear: Record<string, number>;
}

async function marketYear(year: number, untilMonth = 12): Promise<Map<number, MarketPriceRecord>> {
  const rows = await prisma.marketData.findMany({
    where: { timestamp: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year, untilMonth, 1)) } },
  });
  return new Map(
    rows.map((m) => [
      m.timestamp.getTime(),
      { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: null, imbalanceNegPrice: null },
    ])
  );
}

/**
 * Bütçe saatleri: verilen yılların (ör. 2025, 2026) her saati için birimlerin net sapması ve KÜPST miktarı.
 * untilMonth: son yılda kaç ay (ör. 2026 Ocak–Ağustos için 8); önceki yıllar tam.
 */
export async function loadBudgetHours(
  plants: ProjectHourly["plants"],
  years: number[],
  { aggregator, untilMonth = 12, plan: planBasis = "first" }: { aggregator: boolean; untilMonth?: number; plan?: "first" | "final" }
): Promise<BudgetHoursResult> {
  const skipped: string[] = [];
  const out: BudgetHour[] = [];
  const hoursByYear: Record<string, number> = {};
  let used = 0;
  const usedIds = new Set<string>();
  for (const [yi, year] of years.entries()) {
    const months = yi === years.length - 1 ? untilMonth : 12;
    const market = await marketYear(year, months);
    // Santral → saatlik sonuç (sapma seçilen plana göre)
    const series: Array<{ plant: ProjectHourly["plants"][number]; unit: string; hourly: HourlyResult[] }> = [];
    for (const p of plants) {
      const doc = p.epiasPlantId !== null ? await readPoolYearCached(p.epiasPlantId, year) : null;
      if (!doc) {
        if (!skipped.includes(p.plantName)) skipped.push(p.plantName);
        continue;
      }
      usedIds.add(p.plantId);
      const start = Date.parse(doc.start);
      const hourly: HourlyResult[] = [];
      for (let i = 0; i < doc.uevm.length; i++) {
        const t = start + i * HOUR;
        const m = market.get(t);
        const actual = doc.uevm[i];
        const plan = planBasis === "final" ? doc.kgupFinal[i] ?? doc.kgupFirst[i] : doc.kgupFirst[i];
        if (!m || actual === null || plan === null) continue;
        hourly.push(processHourlyRecord({ timestamp: m.timestamp, forecastMwh: plan, actualMwh: actual }, m, DEFAULT_IMBALANCE_PROFILE));
      }
      const unit = aggregator ? `org:${AGGREGATOR_ORG_ID}` : p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`;
      series.push({ plant: p, unit, hourly });
    }
    // KÜPST (TL, saatin kendi fiyatıyla) → miktar
    const kupstTl = new Map<number, number>();
    if (aggregator) {
      for (const [t, v] of Array.from(kupstCommunityHours(series.map((s) => ({ hourly: s.hourly, plantType: s.plant.plantType, capacityMw: s.plant.capacityMw })), latestKupst).entries()))
        kupstTl.set(t, v);
    } else {
      for (const s of series)
        for (const h of s.hourly) {
          const t = new Date(h.timestamp).getTime();
          kupstTl.set(t, (kupstTl.get(t) ?? 0) + kupstForHour(h, s.plant.plantType, latestKupst));
        }
    }
    // Saat → birim sapmaları
    const units = Array.from(new Set(series.map((s) => s.unit)));
    const byHour = new Map<number, BudgetHour>();
    for (const s of series) {
      const u = units.indexOf(s.unit);
      for (const h of s.hourly) {
        const t = new Date(h.timestamp).getTime();
        let b = byHour.get(t);
        if (!b) {
          b = { t, ptf: h.ptf, smf: h.smf, systemDirection: h.systemDirection, unitDeviations: new Array(units.length).fill(0), kupstQty: 0, actualMwh: 0 };
          byHour.set(t, b);
        }
        b.unitDeviations[u] += h.actualMwh - h.forecastMwh;
        b.actualMwh += h.actualMwh;
      }
    }
    for (const b of Array.from(byHour.values())) {
      const top = Math.max(b.ptf, b.smf);
      b.kupstQty = top > 0 ? (kupstTl.get(b.t) ?? 0) / top : 0;
      out.push(b);
    }
    hoursByYear[String(year)] = byHour.size;
  }
  used = usedIds.size;
  out.sort((a, b) => a.t - b.t);
  return { hours: out, plantsUsed: used, plantsSkipped: skipped, hoursByYear };
}
