/**
 * Bütçe yönteminin geçmişle sınaması (PLAN 17.2, kapı): 2026 bütçesi yalnız 2025 sonuna kadarki veriyle kurulur
 * (sapma ve fiyat 2025, 2026 kuralı, makas 2025 düzeyinde ve +%20) ve 2026 Ocak–<sonAy> gerçekleşenle karşılaştırılır.
 * Her proje için portföy, iki yılda da havuzda verisi olan santrallerdir. Gerçekleşen aynı fonksiyonla (formül fiyatı,
 * 2026 kuralı, ilk plan: havuzda 2025'in son planı yok, KÜPST) hesaplanır; birim reel TL (son ayın fiyat düzeyi). EPİAŞ'a gidilmez.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/budget-backtest.mts [sonAy=8]
 *
 * Çıktı: .cache/epias/budget-backtest-2026.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { REGULATORY_IMBALANCE_REGIMES } from "@/lib/calculations/types";
import { hourCost, imbalanceBudget, realSpreadByYear, type BudgetScenario } from "@/lib/analysis/imbalance-budget";
import { loadBudgetHours } from "@/lib/services/imbalance-budget";
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
  const scenarios: BudgetScenario[] = [
    { key: "base", label: "2025 makası, 2026 kuralı", rule: RULE_2026, targetSpreadReal: null },
    { key: "wide", label: "makas %20 açılır", rule: RULE_2026, targetSpreadReal: spread25 * 1.2 },
  ];
  // Gerçekleşen 2026: aynı maliyet fonksiyonu, makas olduğu gibi
  const actualByMonth = new Map<string, number>();
  for (const h of h26.hours) {
    const m = new Date(h.t).toISOString().slice(5, 7);
    actualByMonth.set(m, (actualByMonth.get(m) ?? 0) + hourCost(h, scenarios[0], 1, priceScale));
  }
  const row: ProjectRow = { project: pr.name, plants: both.length, scenarios: {}, monthly: [] };
  for (const sc of scenarios) {
    const b = imbalanceBudget(h25.hours, sc, { year: 2026, priceScale, seed: 1 });
    const ms = b.months.filter((m) => actualByMonth.has(m.month) && Number(m.month) <= lastMonth);
    const actual = ms.reduce((a, m) => a + actualByMonth.get(m.month)!, 0);
    const budget = ms.reduce((a, m) => a + m.p50, 0);
    row.scenarios[sc.key] = {
      budget,
      p90: ms.reduce((a, m) => a + m.p90, 0),
      p95: ms.reduce((a, m) => a + m.p95, 0),
      actual,
      ratio: budget > 0 ? actual / budget : NaN,
      monthsWithinP90: ms.filter((m) => actualByMonth.get(m.month)! <= m.p90).length,
      monthsWithinP95: ms.filter((m) => actualByMonth.get(m.month)! <= m.p95).length,
      months: ms.length,
    };
    if (sc.key === "base") row.monthly = ms.map((m) => ({ month: m.month, actual: actualByMonth.get(m.month)!, p50: m.p50, p90: m.p90, p95: m.p95 }));
  }
  rows.push(row);
  const s = row.scenarios.base;
  console.log(
    `${pr.name.slice(0, 44).padEnd(44)} ${String(both.length).padStart(3)} santral  bütçe ${(s.budget / 1e6).toFixed(1).padStart(6)} M  gerçek ${(s.actual / 1e6).toFixed(1).padStart(6)} M  oran ${s.ratio.toFixed(2)}  P90 içinde ${s.monthsWithinP90}/${s.months}  P95 içinde ${s.monthsWithinP95}/${s.months}  (+%20 makas: oran ${row.scenarios.wide.ratio.toFixed(2)}, P90 ${row.scenarios.wide.monthsWithinP90}/${s.months})`
  );
}

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const summary = Object.fromEntries(
  ["base", "wide"].map((k) => {
    const xs = rows.map((r) => r.scenarios[k]);
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
// Aylık oranların dağılımı (gerçek / medyan bütçe), bandın ayarı için
const monthRatios = rows.flatMap((r) => r.monthly.filter((m) => m.p50 > 0).map((m) => m.actual / m.p50)).sort((a, b) => a - b);
const q = (p: number) => monthRatios[Math.min(monthRatios.length - 1, Math.floor(p * monthRatios.length))];
const out = { generatedAt: new Date().toISOString(), lastMonth, summary, monthRatio: { n: monthRatios.length, p50: q(0.5), p90: q(0.9), p95: q(0.95) }, rows };
fs.writeFileSync(path.join(process.cwd(), ".cache", "epias", "budget-backtest-2026.json"), JSON.stringify(out, null, 1));
console.log("\nÖzet:", JSON.stringify(summary, null, 1));
console.log("Aylık gerçek / medyan bütçe:", JSON.stringify(out.monthRatio));
await prisma.$disconnect();
