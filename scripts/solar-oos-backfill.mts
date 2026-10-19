/**
 * Öğrenen düzeltme katmanının örneklem dışı tahmin serisi önbelleğini doldurur (Aşama 22.4; lib/solar-engine/learning/oos-series.ts).
 * Proje güneş santralleri için son 13 ayın tamamlanmış ayları `.cache/forecast/oos/` altına yazılır; günlük akış böylece
 * yalnız içinde bulunulan ayı hesaplar. Yeni santral eklenince ya da önbellek silinince bir kez çalıştırılır (günlük akış
 * eksik ayı kendisi de hesaplar, yalnız daha yavaş).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/solar-oos-backfill.mts [epiasPlantId ...]
 */

import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { forecastSolarEnsemble } from "@/lib/solar-engine/forecast";

const ids = process.argv.slice(2).map(Number).filter(Boolean);
const rows = await prisma.powerPlant.findMany({ where: { projectId: { not: null }, type: "GES", epiasPlantId: { not: null } }, select: { epiasPlantId: true, name: true } });
await prisma.$disconnect();
const plants = new Map<number, string>();
for (const r of rows) if (!isUnlicensedName(r.name) && (!ids.length || ids.includes(r.epiasPlantId!))) plants.set(r.epiasPlantId!, r.name);
const wall = Date.now() + 3 * 3_600_000;
const tomorrow = Date.UTC(new Date(wall).getUTCFullYear(), new Date(wall).getUTCMonth(), new Date(wall).getUTCDate() + 1);
for (const [id, name] of plants) {
  const t0 = Date.now();
  const f = await forecastSolarEnsemble(id, tomorrow, 24);
  const c = f["weighted-corr"];
  console.log(`#${String(id).padEnd(8)} ${name.slice(0, 28).padEnd(28)} ${c.status}${c.message ? ` (${c.message})` : ""} ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
}
