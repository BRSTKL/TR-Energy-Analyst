/**
 * Mevcut projeleri veri havuzuna taşır (PLAN 7.7). Kayıt silmez.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/pool-migrate-projects.mts [--dry]
 *
 * Her proje için: EPİAŞ santralleri (epiasPlantId dolu) havuzdan okunacak şekilde işaretlenir ve proje dönemi
 * kayıtların ilk/son gününden yazılır. Önce ve sonra aynı yükleyiciyle santral başına saat sayısı, plan, gerçekleşen
 * ve dengesizlik maliyeti karşılaştırılır; herhangi bir fark (saat sayısı ya da 0,01 TL üstü) varsa o projenin
 * işaretleri geri alınır. Kopyalar (GenerationRecord) ayrı bir adımda, kullanıcı onayıyla silinir.
 */

import { prisma } from "@/lib/prisma";
import { loadProjectHourly } from "@/lib/services/project-hourly";

const dry = process.argv.includes("--dry");
const day = (d: Date) => d.toISOString().slice(0, 10);

type Snap = Map<string, { hours: number; f: number; a: number; cost: number }>;
async function snapshot(projectId: string): Promise<Snap> {
  const data = await loadProjectHourly(projectId);
  const out: Snap = new Map();
  for (const p of data?.plants ?? []) {
    let f = 0;
    let a = 0;
    let cost = 0;
    for (const h of p.hourly) {
      f += h.forecastMwh;
      a += h.actualMwh;
      cost += h.imbalanceCost;
    }
    out.set(p.plantId, { hours: p.hourly.length, f, a, cost });
  }
  return out;
}

const projects = await prisma.project.findMany({ include: { plants: true } });
for (const project of projects) {
  const epias = project.plants.filter((p) => p.epiasPlantId !== null && !p.poolBacked);
  if (epias.length === 0) {
    console.log(`${project.name}: taşınacak EPİAŞ santrali yok`);
    continue;
  }
  const range = await prisma.generationRecord.aggregate({
    where: { plant: { projectId: project.id } },
    _min: { timestamp: true },
    _max: { timestamp: true },
  });
  if (!range._min.timestamp || !range._max.timestamp) {
    console.log(`${project.name}: kayıt yok, atlandı`);
    continue;
  }
  const period = { periodStart: project.periodStart ?? day(range._min.timestamp), periodEnd: project.periodEnd ?? day(range._max.timestamp) };

  const before = await snapshot(project.id);
  await prisma.project.update({ where: { id: project.id }, data: period });
  await prisma.powerPlant.updateMany({ where: { id: { in: epias.map((p) => p.id) } }, data: { poolBacked: true } });
  const after = await snapshot(project.id);

  const diffs: string[] = [];
  for (const p of project.plants) {
    const b = before.get(p.id);
    const x = after.get(p.id);
    if (!b || !x) continue;
    if (b.hours !== x.hours || Math.abs(b.f - x.f) > 0.01 || Math.abs(b.a - x.a) > 0.01 || Math.abs(b.cost - x.cost) > 0.01)
      diffs.push(`${p.name}: saat ${b.hours}→${x.hours}, maliyet ${b.cost.toFixed(2)}→${x.cost.toFixed(2)}`);
  }
  const total = (s: Snap) => Array.from(s.values()).reduce((t, v) => t + v.cost, 0);
  if (diffs.length || dry) {
    await prisma.powerPlant.updateMany({ where: { id: { in: epias.map((p) => p.id) } }, data: { poolBacked: false } });
    await prisma.project.update({ where: { id: project.id }, data: { periodStart: project.periodStart, periodEnd: project.periodEnd } });
  }
  console.log(
    `${project.name}: ${epias.length} santral, dönem ${period.periodStart}–${period.periodEnd}, maliyet ${total(before).toFixed(2)} → ${total(after).toFixed(2)} ` +
      (diffs.length ? `FARK VAR, geri alındı:\n  ${diffs.join("\n  ")}` : dry ? "(deneme, geri alındı)" : "taşındı")
  );
}
await prisma.$disconnect();
