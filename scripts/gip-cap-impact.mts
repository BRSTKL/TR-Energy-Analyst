/**
 * GİP işlem sınırının etkisi (PLAN 18.3): geriye dönük testin gün içi stratejileri sınırsız, %13 ve %10 sınırla.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/gip-cap-impact.mts
 *
 * Kurgu /api/projects/[id]/backtest ile aynı: portföy = uzlaştırma birimleri (netleşmiş saatlik seri), eğitim önceki 4 ay,
 * örneklem dışı tasarruf. Stratejiler: gün içi kalıcılık (2 saat), yön tahminiyle gün içi (H-2) plan ayarı ve ikisinin
 * birleşimi (yön modeli H-2 kapısını geçtiyse). Projenin fiyat profiliyle. Çıktı: .cache/epias/gip-cap-impact.json.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { combineBacktests, MIN_FEASIBLE_LAG_HOURS, persistenceStrategy, runBacktest, type Strategy } from "@/lib/analysis/backtest";
import { directionBiasStrategy, directionPersistenceStrategy, kupstDeltaFor } from "@/lib/analysis/direction-strategy";
import { loadDirectionForecasts } from "@/lib/services/direction-forecast";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { settleByCompanyGroups } from "@/lib/report/plant-report";

const TRAIN_MONTHS = 4;
const CAPS: Array<{ key: string; pct: number }> = [
  { key: "none", pct: Infinity },
  { key: "13", pct: 13 },
  { key: "10", pct: 10 },
];
const LABEL: Record<string, string> = { persistence: "Kalıcılık (2 sa)", bias: "Yön ile gün içi ayar", combo: "Kalıcılık + yön" };

const forecasts = await loadDirectionForecasts();
const h2 = forecasts["H-2"];
const rows = [];
for (const pr of await prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })) {
  if (/^Met Türkiye/.test(pr.name)) continue; // Met Enerji ile aynı portföy
  const data = await loadProjectHourly(pr.id);
  if (!data) continue;
  const unitKey = (p: (typeof data.plants)[number]) => (p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`);
  const groups = settleByCompanyGroups(data.plants, data.profile);
  const result: Record<string, Record<string, number | null>> = {};
  for (const cap of CAPS) {
    const strategiesFor = (key: string): Strategy[] => [
      { ...persistenceStrategy(MIN_FEASIBLE_LAG_HOURS, cap.pct), id: "persistence" },
      ...(h2.gate.passed
        ? [
            { ...directionBiasStrategy(h2.probabilities, "H-2", kupstDeltaFor(data.plants.filter((p) => unitKey(p) === key)), cap.pct), id: "bias" },
            { ...directionPersistenceStrategy(h2.probabilities, MIN_FEASIBLE_LAG_HOURS, cap.pct), id: "combo" },
          ]
        : []),
    ];
    const combined = combineBacktests(groups.map((g) => runBacktest(g.hourly, data.profile, { trainMonths: TRAIN_MONTHS, strategies: strategiesFor(g.key) })));
    result[cap.key] = Object.fromEntries((combined?.strategies ?? []).map((s) => [s.id, s.outOfSampleSavingTl]));
    result[cap.key].baseline = combined?.baselineCostTl ?? null;
  }
  rows.push({ project: pr.name, result });
  const m = (v: number | null | undefined) => (v === null || v === undefined ? "    –" : `${(v / 1e6).toFixed(2).padStart(6)}`);
  const line = (id: string) => `${LABEL[id]}: ${m(result.none[id])} / ${m(result["13"][id])} / ${m(result["10"][id])}`;
  console.log(`${pr.name.slice(0, 34).padEnd(34)} ${["persistence", "bias", "combo"].filter((id) => result.none[id] !== undefined).map(line).join("  |  ")}`);
}
fs.writeFileSync(path.join(process.cwd(), ".cache", "epias", "gip-cap-impact.json"), JSON.stringify({ generatedAt: new Date().toISOString(), caps: CAPS.map((c) => c.key), rows }, null, 1));
console.log("\nÖrneklem dışı tasarruf, milyon TL: sınırsız / %13 / %10");
await prisma.$disconnect();
