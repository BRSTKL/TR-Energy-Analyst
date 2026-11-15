/**
 * Proje dönemlerini veride bulunan son tam aya uzatır ("her zaman en güncel veri"). Proje oluşturulurken dönem o günün son
 * ayına sabitlenir; sonradan gelen aylar (havuzda ve piyasa verisinde hazır olsa da) raporlara girmez.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/project-period-extend.mts            # yalnız gösterir
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/project-period-extend.mts --write    # yazar
 *
 * Bir ay ancak şunların hepsi varsa eklenir:
 *   - ayın bütün saatlerinde EPİAŞ piyasa verisi ve resmî dengesizlik fiyatı (2026'da resmî fiyatsız saat formülle %3–6
 *     düşük fiyatlanır; o yüzden resmî fiyat gelmeden ay eklenmez),
 *   - havuzdan okunan santrallerin en az %90'ında ayın son gününün üretimi (UEVM) ve planı (KGÜP).
 * Dönem yalnız ileri uzatılır; başlangıç ve dosyadan yüklenen (havuzsuz) projeler değişmez. Dönem başlangıcıyla aynı yıl
 * içinde kalır (proje adları yıllıktır: "… 2026").
 */

import { prisma } from "@/lib/prisma";
import { poolPlantRows } from "@/lib/pool/pool-hours";

const write = process.argv.includes("--write");
const MIN_PLANT_SHARE = 0.9;

const lastDay = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
const nextMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1)).toISOString().slice(0, 7);

/** Ayın bütün saatlerinde piyasa verisi ve resmî dengesizlik fiyatı var mı */
const marketReady = new Map<string, boolean>();
async function marketComplete(ym: string): Promise<boolean> {
  if (!marketReady.has(ym)) {
    const from = new Date(`${ym}-01T00:00:00Z`);
    const to = new Date(`${lastDay(ym)}T23:00:00Z`);
    const expected = Math.round((to.getTime() - from.getTime()) / 3_600_000) + 1;
    const range = { gte: from, lte: to };
    const [all, official] = await Promise.all([
      prisma.marketData.count({ where: { timestamp: range, source: { in: ["EPIAS", "FILE"] } } }),
      prisma.marketData.count({ where: { timestamp: range, imbalancePosPrice: { not: null }, imbalanceNegPrice: { not: null } } }),
    ]);
    marketReady.set(ym, all >= expected && official >= expected);
  }
  return marketReady.get(ym)!;
}

const projects = await prisma.project.findMany({
  where: { periodStart: { not: null }, periodEnd: { not: null } },
  select: { id: true, name: true, periodStart: true, periodEnd: true, plants: { select: { name: true, epiasPlantId: true, kgupVersion: true, poolBacked: true } } },
  orderBy: { name: "asc" },
});

let changed = 0;
for (const p of projects) {
  const pool = p.plants.filter((pl) => pl.poolBacked && pl.epiasPlantId !== null);
  if (!pool.length) continue;
  const year = p.periodStart!.slice(0, 4);
  let end = p.periodEnd!;
  let ym = nextMonth(end.slice(0, 7));
  const added: string[] = [];
  while (ym.slice(0, 4) === year && (await marketComplete(ym))) {
    const day = lastDay(ym);
    let ready = 0;
    for (const pl of pool) if ((await poolPlantRows(pl, day, day)).length > 0) ready++;
    if (ready < MIN_PLANT_SHARE * pool.length) {
      console.log(`  ${p.name}: ${ym} eklenmedi (son gün verisi ${ready}/${pool.length} santralde)`);
      break;
    }
    end = day;
    added.push(ym);
    ym = nextMonth(ym);
  }
  if (!added.length) {
    console.log(`${p.name}: ${p.periodStart} – ${p.periodEnd} (değişmedi)`);
    continue;
  }
  changed++;
  console.log(`${p.name}: ${p.periodStart} – ${p.periodEnd} → ${end} (+${added.join(", ")})${write ? "" : "  [deneme]"}`);
  if (write) await prisma.project.update({ where: { id: p.id }, data: { periodEnd: end } });
}
console.log(`\n${changed} proje ${write ? "uzatıldı" : "uzatılabilir (yazmak için --write)"}.`);
await prisma.$disconnect();
