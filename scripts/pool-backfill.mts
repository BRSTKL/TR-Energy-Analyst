/**
 * Bütün projelerin eksik EPİAŞ verisini tamamlar (PLAN 10.1): piyasa verisi, resmi dengesizlik fiyatları, santrallerin
 * ilk ve son KGÜP ile UEVM serileri. Yalnız eksik olan çekilir; tekrar çalıştırılabilir. VPN gerekir.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/pool-backfill.mts [projeId]
 */
import { prisma } from "@/lib/prisma";
import { syncProjectData } from "@/lib/services/project-data-sync";

const only = process.argv[2];
const projects = await prisma.project.findMany({ where: only ? { id: only } : {}, select: { id: true, name: true } });
let failed = 0;
for (const p of projects) {
  console.log(`== ${p.name}`);
  const r = await syncProjectData(p.id, { onProgress: (m) => console.log(`   ${m}`) });
  const fetched = r.plants.reduce((s, x) => s + x.fromEpias, 0);
  console.log(
    `   dönem ${r.period?.start}–${r.period?.end} · piyasa ayı ${r.marketMonthsSynced.length} · resmi fiyat ayı ${r.officialPriceMonthsSynced.length} · santral ${r.plants.length} · EPİAŞ'tan santral-ay ${fetched}` +
      (r.errors.length ? ` · HATA: ${r.errors[0]}` : " · tamam")
  );
  if (r.errors.length) failed++;
}
console.log(`bitti · hatalı proje ${failed}`);
await prisma.$disconnect();
