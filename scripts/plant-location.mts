/**
 * Santral konumu (PLAN 15.1). Kural: lib/epias-plant/location.ts (CLAUDE.md "Santral konumu").
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/plant-location.mts pilot [adet=20]
 *       Güneş pilotu: sektör karnesinin (son yıl) en çok üreten lisanslı güneş santralleri ve konum durumu. Lisanssız
 *       toplamlar (K3_, LÜM_, LÜY: bir dağıtım bölgesindeki binlerce küçük tesis) tek koordinatla temsil edilemez: dışarıda.
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/plant-location.mts set <epiasPlantId> <enlem> <boylam> <kaynak> "<not>"
 *       Elle giriş (kaynak USER, GEM_TRACKER, OSM ya da DISTRICT_CENTER); havuz tanımına ve proje santrallerine yazar.
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/plant-location.mts sync
 *       Havuzdaki konumları proje santrallerine kopyalar (USER'a dokunmaz).
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { formatLocation, LOCATION_SOURCE_LABEL, isLocationSource } from "@/lib/epias-plant/location";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { setPlantLocation, syncProjectLocations } from "@/lib/services/plant-location";

const [cmd, ...args] = process.argv.slice(2);
const CACHE = path.join(process.cwd(), ".cache", "epias");

try {
  if (cmd === "set") {
    const [id, lat, lon, source, ref] = args;
    if (!isLocationSource(source)) throw new Error(`Kaynak geçersiz: ${source}`);
    const r = await setPlantLocation(Number(id), { latitude: Number(lat), longitude: Number(lon), locationSource: source, locationRef: ref ?? "" }, { manual: true });
    console.log(`#${r.epiasPlantId}: havuz ${r.pool ? "yazıldı" : "korundu"}, proje santrali ${r.projectPlants} güncellendi${r.skippedProjectPlants ? `, ${r.skippedProjectPlants} korundu` : ""}`);
  } else if (cmd === "sync") {
    const r = await syncProjectLocations();
    console.log(`${r.updated} proje santrali güncellendi; ${r.withoutLocation} santralin konumu yok.`);
  } else if (cmd === "pilot") {
    const n = Number(args[0] ?? 20);
    const year = Math.max(...fs.readdirSync(CACHE).map((f) => Number(/^sector-(\d{4})\.json$/.exec(f)?.[1] ?? 0)));
    const sector = JSON.parse(fs.readFileSync(path.join(CACHE, `sector-${year}.json`), "utf8")) as {
      plants: Array<{ epiasPlantId: number; name: string; type: string; organizationName?: string; actualMwh: number; peakMw: number }>;
    };
    const all = sector.plants.filter((p) => p.type === "GES");
    const ges = all.filter((p) => !isUnlicensedName(p.name)).sort((a, b) => b.actualMwh - a.actualMwh).slice(0, n);
    const agg = all.filter((p) => isUnlicensedName(p.name));
    const gwh = (xs: typeof all) => xs.reduce((a, p) => a + p.actualMwh, 0) / 1000;
    console.log(`Güneş pilotu: sektör karnesi ${year}, en çok üreten ${ges.length} lisanslı santral`);
    console.log(`(Dışarıda: ${agg.length} lisanssız toplam, ${gwh(agg).toFixed(0)} GWh; sektör güneş üretimi ${gwh(all).toFixed(0)} GWh, pilot ${gwh(ges).toFixed(0)} GWh)\n`);
    let located = 0;
    for (const [i, p] of ges.entries()) {
      const loc = (await readPoolPlantInfo(p.epiasPlantId))?.location;
      if (loc) located++;
      console.log(
        `${String(i + 1).padStart(2)}. #${String(p.epiasPlantId).padEnd(6)} ${p.name.slice(0, 34).padEnd(34)} ${(p.actualMwh / 1000).toFixed(0).padStart(4)} GWh  tepe ${p.peakMw.toFixed(0).padStart(4)} MW  ` +
          (loc ? `${formatLocation(loc)} (${LOCATION_SOURCE_LABEL[loc.locationSource]})` : "konum yok") +
          `  · ${(p.organizationName ?? "").slice(0, 40)}`
      );
    }
    console.log(`\nKonumu olan: ${located} / ${ges.length}`);
  } else {
    console.log("Kullanım: pilot [adet] | set <epiasPlantId> <enlem> <boylam> <kaynak> \"<not>\" | sync");
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
