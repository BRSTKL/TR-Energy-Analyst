/**
 * Sektörde uyduyla kayıp üretim (PLAN 20.4): sektör karnelerinin (2025, 2026) konumu olan lisanslı güneş santralleri.
 * Santral başına lib/forecast/curtailment.ts (`detectLostHours` devreye alma süzgeciyle, `monthlyLoss`), sonra
 * lib/analysis/sector-loss.ts ile grup ve yıl özeti (aynı aylar: Ocak – sonAy). Uydu verisi önce
 * `scripts/satellite-sync.mts` ile çekilmiş olmalı. EPİAŞ'a gidilmez.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/sector-curtailment.mts [sonAy=8]
 * Çıktı: .cache/epias/sector-curtailment.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { detectLostHours, monthlyLoss } from "@/lib/forecast/curtailment";
import { LOSS_GROUP_LABEL, sectorLoss, type SectorLossPlant } from "@/lib/analysis/sector-loss";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { lossInputs } from "@/lib/services/production-loss";

const lastMonth = Number(process.argv[2] ?? 8);
const CACHE = path.join(process.cwd(), ".cache", "epias");
const YEARS = [2025, 2026];
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

const list = new Map<number, { name: string; organizationName: string | null }>();
for (const y of YEARS) {
  const f = path.join(CACHE, `sector-${y}.json`);
  if (!fs.existsSync(f)) continue;
  for (const p of JSON.parse(fs.readFileSync(f, "utf8")).plants as Array<{ epiasPlantId: number; name: string; type: string; organizationName?: string | null }>)
    if (p.type === "GES" && !isUnlicensedName(p.name)) list.set(p.epiasPlantId, { name: p.name, organizationName: p.organizationName ?? null });
}

const from = Date.UTC(2024, 2, 8);
const to = Date.UTC(YEARS[YEARS.length - 1], lastMonth, 1);
const ptf = new Map((await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(from), lt: new Date(to) } }, select: { timestamp: true, ptf: true } })).map((r) => [r.timestamp.getTime(), r.ptf]));

const plants: SectorLossPlant[] = [];
const bySource: Record<string, number> = {};
let noSat = 0;
for (const [id, p] of list) {
  const loc = (await readPoolPlantInfo(id))?.location;
  if (!loc) continue;
  const data = await lossInputs(id, from, to, ptf);
  if (!data || !data.hours.some((h) => h.satGhi !== null)) {
    noSat++;
    continue;
  }
  const r = detectLostHours(data.hours, data.site, { commissioning: true });
  plants.push({ epiasPlantId: id, name: p.name, organizationName: p.organizationName, locationSource: loc.locationSource, months: monthlyLoss(data.hours, r) });
  bySource[loc.locationSource] = (bySource[loc.locationSource] ?? 0) + 1;
}

const result = sectorLoss(plants, YEARS, lastMonth);
const out = {
  generatedAt: new Date().toISOString(),
  lastMonth,
  coverage: { licensedSolar: list.size, located: plants.length, bySource, withoutSatellite: noSat },
  ...result,
};
fs.writeFileSync(path.join(CACHE, "sector-curtailment.json"), JSON.stringify(out));

console.log(`Lisanslı güneş ${list.size}, konumlu ve uydulu ${plants.length} (${JSON.stringify(bySource)}), uydu verisi yok ${noSat}\n`);
for (const y of result.years) {
  console.log(`${y.year} Ocak–${lastMonth}. ay:`);
  for (const g of ["all", "yeka", "other"] as const) {
    const t = y.groups[g];
    console.log(`  ${LOSS_GROUP_LABEL[g].padEnd(18)} ${String(t.plants).padStart(2)} santral  kayıp %${nf(t.lossPct)} (planlı payı %${nf(t.plannedSharePct, 0)})  ${nf((t.plannedLossMwh + t.unplannedLossMwh) / 1000)} GWh  ${nf((t.plannedValueTl + t.unplannedValueTl) / 1e6)} M TL (plansız ${nf(t.unplannedValueTl / 1e6)})`);
  }
}
const top = result.plants
  .filter((p) => p.years[2026])
  .sort((a, b) => b.years[2026].lossPct - a.years[2026].lossPct)
  .slice(0, 10);
console.log(`\n2026'da en çok kaybeden 10 santral:`);
for (const p of top) console.log(`  ${p.name.slice(0, 30).padEnd(30)} %${nf(p.years[2026].lossPct)} (planlı %${nf(p.years[2026].plannedSharePct, 0)})${p.years[2025] ? `  · 2025 %${nf(p.years[2025].lossPct)}` : ""}  [${p.locationSource}]`);
await prisma.$disconnect();
