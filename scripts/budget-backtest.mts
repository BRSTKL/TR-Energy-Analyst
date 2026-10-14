/**
 * Bütçe yönteminin geçmişle sınaması (PLAN 17.2, kapı): 2026 bütçesi yalnız 2025 sonuna kadarki veriyle kurulur
 * (sapma ve fiyat 2025, 2026 kuralı, makas 2025 düzeyinde ve +%20) ve 2026 Ocak–<sonAy> gerçekleşenle karşılaştırılır.
 * Her proje için portföy, iki yılda da havuzda verisi olan santrallerdir. Gerçekleşen aynı fonksiyonla (formül fiyatı,
 * 2026 kuralı, ilk plan: havuzda 2025'in son planı yok, KÜPST) hesaplanır; birim reel TL (son ayın fiyat düzeyi). EPİAŞ'a gidilmez.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/budget-backtest.mts [sonAy=8]
 *
 * Üretim varsayımları (17.5): asIs = 2025 günlerinin üretimi (birim ayrımı yok); runRate = birim maliyet × 2025 üretimi,
 * yıl içinde devreye giren santraller tam yıl; oracle = birim maliyet × gerçekleşen 2026 üretimi (üretim doğru bilinseydi
 * ulaşılabilecek en iyi). Hidro üretimi (yağış) önceden bilinemez: runRate ile oracle arasındaki fark çoğunlukla odur.
 *
 * Çıktı: .cache/epias/budget-backtest-2026.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { REGULATORY_IMBALANCE_REGIMES } from "@/lib/calculations/types";
import { hourCost, imbalanceBudget, realSpreadByYear, runRateProduction, type BudgetScenario } from "@/lib/analysis/imbalance-budget";
import { loadBudgetHours, plantMonths } from "@/lib/services/imbalance-budget";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { readPoolYearCached } from "@/lib/pool/pool-store";
import { converterFor } from "@/lib/macro/series";

const lastMonth = Number(process.argv[2] ?? 8);
const RULE_2026 = REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].coefficients;
const priceScale = converterFor("REAL").factor as (t: number) => number;

interface ProjectRow {
  project: string;
  plants: number;
  scenarios: Record<string, { budget: number; p90: number; p95: number; actual: number; ratio: number; monthsWithinP90: number; monthsWithinP95: number; months: number }>;
  monthly: Array<{ month: string; actual: number; p50: number; p90: number; p95: number }>;
}

const rows: ProjectRow[] = [];
// Met Enerji Portföy ve Met Türkiye aynı portföy: özet bir kez sayar
const projects = await prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
for (const pr of projects) {
  const data = await loadProjectHourly(pr.id);
  if (!data) continue;
  const both = [];
  for (const p of data.plants)
    if (p.epiasPlantId !== null && (await readPoolYearCached(p.epiasPlantId, 2025)) && (await readPoolYearCached(p.epiasPlantId, 2026))) both.push(p);
  if (!both.length) continue;
  const aggregator = !!data.aggregator;
  const [h25, h26] = await Promise.all([
    loadBudgetHours(both, [2025], { aggregator }),
    loadBudgetHours(both, [2026], { aggregator, untilMonth: lastMonth }),
  ]);
  const spread25 = realSpreadByYear(h25.hours, priceScale)["2025"];
  const scenario: BudgetScenario = { key: "base", label: "2025 makası, 2026 kuralı", rule: RULE_2026, targetSpreadReal: null };
  const wide: BudgetScenario = { key: "wide", label: "makas %20 açılır", rule: RULE_2026, targetSpreadReal: spread25 * 1.2 };
  // Gerçekleşen 2026: aynı maliyet fonksiyonu, makas olduğu gibi
  const actualByMonth = new Map<string, number>();
  for (const h of h26.hours) {
    const m = new Date(h.t).toISOString().slice(5, 7);
    actualByMonth.set(m, (actualByMonth.get(m) ?? 0) + hourCost(h, scenario, 1, priceScale));
  }
  const toRecord = (xs: number[]) => Object.fromEntries(xs.map((v, m) => [String(m + 1).padStart(2, "0"), v]));
  const months26 = await plantMonths(both, 2026, lastMonth);
  const variants: Array<{ key: string; sc: BudgetScenario; production?: Record<string, number> }> = [
    { key: "asIs", sc: scenario },
    { key: "wide", sc: wide },
    { key: "runRate", sc: scenario, production: toRecord(runRateProduction(await plantMonths(both, 2025, lastMonth), lastMonth).total) },
    { key: "oracle", sc: scenario, production: toRecord(Array.from({ length: lastMonth }, (_, m) => months26.reduce((a, p) => a + (p.mwh[m] ?? 0), 0))) },
  ];
  const row: ProjectRow = { project: pr.name, plants: both.length, scenarios: {}, monthly: [] };
  for (const v of variants) {
    const b = imbalanceBudget(h25.hours, v.sc, { year: 2026, priceScale, seed: 1, production: v.production });
    const ms = b.months.filter((m) => actualByMonth.has(m.month) && Number(m.month) <= lastMonth);
    const actual = ms.reduce((a, m) => a + actualByMonth.get(m.month)!, 0);
    const budget = ms.reduce((a, m) => a + m.p50, 0);
    row.scenarios[v.key] = {
      budget,
      p90: ms.reduce((a, m) => a + m.p90, 0),
      p95: ms.reduce((a, m) => a + m.p95, 0),
      actual,
      ratio: budget > 0 ? actual / budget : NaN,
      monthsWithinP90: ms.filter((m) => actualByMonth.get(m.month)! <= m.p90).length,
      monthsWithinP95: ms.filter((m) => actualByMonth.get(m.month)! <= m.p95).length,
      months: ms.length,
    };
    if (v.key === "runRate") row.monthly = ms.map((m) => ({ month: m.month, actual: actualByMonth.get(m.month)!, p50: m.p50, p90: m.p90, p95: m.p95 }));
  }
  rows.push(row);
  const f = (k: string) => `${row.scenarios[k].ratio.toFixed(2)} (P90 ${row.scenarios[k].monthsWithinP90}/${row.scenarios[k].months})`;
  console.log(`${pr.name.slice(0, 34).padEnd(34)} ${String(both.length).padStart(3)} santral  oran: olduğu gibi ${f("asIs")}  yeni santral tam yıl ${f("runRate")}  üretim bilinseydi ${f("oracle")}`);
}

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const unique = rows.filter((r) => !/^Met Türkiye/.test(r.project));
const summary = Object.fromEntries(
  ["asIs", "wide", "runRate", "oracle"].map((k) => {
    const xs = unique.map((r) => r.scenarios[k]);
    const months = xs.reduce((a, s) => a + s.months, 0);
    return [
      k,
      {
        projects: xs.length,
        ratioMedian: med(xs.map((s) => s.ratio)),
        ratioRange: [Math.min(...xs.map((s) => s.ratio)), Math.max(...xs.map((s) => s.ratio))],
        monthsWithinP90Pct: (xs.reduce((a, s) => a + s.monthsWithinP90, 0) / months) * 100,
        monthsWithinP95Pct: (xs.reduce((a, s) => a + s.monthsWithinP95, 0) / months) * 100,
        months,
      },
    ];
  })
);
// Aylık oranların dağılımı (gerçek / medyan bütçe; yeni santral tam yıl varsayımı), bandın ayarı için
const monthRatios = unique.flatMap((r) => r.monthly.filter((m) => m.p50 > 0).map((m) => m.actual / m.p50)).sort((a, b) => a - b);
const q = (p: number) => monthRatios[Math.min(monthRatios.length - 1, Math.floor(p * monthRatios.length))];
const out = { generatedAt: new Date().toISOString(), lastMonth, summary, monthRatio: { n: monthRatios.length, p50: q(0.5), p90: q(0.9), p95: q(0.95) }, rows };
fs.writeFileSync(path.join(process.cwd(), ".cache", "epias", "budget-backtest-2026.json"), JSON.stringify(out, null, 1));
console.log("\nÖzet:", JSON.stringify(summary, null, 1));
console.log("Aylık gerçek / medyan bütçe:", JSON.stringify(out.monthRatio));
await prisma.$disconnect();
