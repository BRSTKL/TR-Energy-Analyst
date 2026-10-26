/**
 * Değişim algılama taraması (Aşama 22.7): proje güneş santrallerinde bağlanan uyarılar (kapasite değişimi, son / süren uzun
 * arıza; lib/services/plant-change-warnings.ts) ve bağlanmayan konum tutarsızlığı. Varsayılan yalnız okur; `--write`
 * bağlanan uyarıları Üretim tahmini sayfasının okuduğu dosyaya yazar (günlük akış bunu her kayıttan sonra kendisi yapar).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/change-detection-scan.mts [--write]
 */

import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { loadSolarHours } from "@/lib/solar-engine/data/production-data";
import { locationShift } from "@/lib/forecast/change-detection";
import { solarChangeWarnings, writeChangeWarnings, type PlantChangeWarnings } from "@/lib/services/plant-change-warnings";

const DAY = 86_400_000;
const write = process.argv.includes("--write");
const rows = await prisma.powerPlant.findMany({
  where: { projectId: { not: null }, type: "GES", epiasPlantId: { not: null } },
  select: { epiasPlantId: true, name: true, capacityMw: true, capacitySource: true, locationSource: true },
});
await prisma.$disconnect();
const plants = new Map<number, (typeof rows)[number]>();
for (const r of rows) if (!isUnlicensedName(r.name)) plants.set(r.epiasPlantId!, r);

const to = Math.floor((Date.now() + 3 * 3_600_000) / DAY) * DAY;
const list: PlantChangeWarnings[] = [];
for (const [id, p] of [...plants].sort((a, b) => a[0] - b[0])) {
  const w = await solarChangeWarnings({ epiasPlantId: id, capacityMw: p.capacityMw, capacitySource: p.capacitySource });
  list.push(w);
  // Bağlanmayan konum denetimi (yalnız bilgi): son 60 günün açık gök günleri
  const data = await loadSolarHours(id, to - 70 * DAY, to, { provisional: true });
  const loc = data ? locationShift(data.hours.filter((h) => h.t >= to - 62 * DAY).map((h) => ({ t: h.t, uevm: h.uevm, ghi: h.satGhi ?? null })), data.site) : null;
  console.log(`#${String(id).padEnd(8)} ${p.name.slice(0, 26).padEnd(26)} veri sonu ${w.dataThrough ?? "-"} · kurulu ${p.capacityMw} (${p.capacitySource}) · konum ${p.locationSource ?? "-"}${w.warnings.length || loc ? "" : " · uyarı yok"}`);
  for (const x of w.warnings) console.log(`    ${x.kind}: ${x.message}`);
  if (loc) console.log(`    (bağlı değil) ${loc.kind}: ${loc.message}`);
}
console.log(`${list.length} santral tarandı; bağlanan uyarı ${list.filter((p) => p.warnings.length).length} santralde`);
if (write) {
  writeChangeWarnings(list);
  console.log("Yazıldı: .cache/forecast/change-warnings.json");
}
