/**
 * Rüzgârda ek hava modellerinin geçmiş tahminleri (Aşama 23.4; lib/weather/wind-nwp-archive.ts): konumu olan proje rüzgâr
 * santralleri için ICON-EU ve GFS `d2` rüzgârı (80 / 100 / 120 m, 10 m, hamle), 2025-01-01'den dünkü güne. Aynı 0,1°
 * hücreye düşen santraller tek istek; ay sonundan 3 gün sonra çekilmiş ay kesin sayılır. ECMWF rüzgârı ayrı:
 * scripts/wind-forecast-sync.mts.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-models-sync.mts [epiasPlantId ...]
 * Çıktı: data/pool/weather/<id>/windnwp-<model>-<yıl>.json.gz
 */

import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { emptyWindNwpYear, fetchWindNwp, mergeWindNwp, WIND_NWP_MODELS, type WindNwpResponse } from "@/lib/weather/wind-nwp-archive";
import { readWindNwpYear, writeWindNwpYear } from "@/lib/weather/weather-store";

const DAY = 86_400_000;
const FIRST_YEAR = 2025;
const yesterday = new Date(Date.now() + 3 * 3_600_000 - DAY).toISOString().slice(0, 10);
const final = (year: number, m: string, at: string | undefined) => !!at && Date.parse(at) >= Date.UTC(year, Number(m), 1) + 3 * DAY;
const args = process.argv.slice(2).map(Number).filter(Boolean);
const ids = args.length
  ? args
  : Array.from(new Set((await prisma.powerPlant.findMany({ where: { type: "RES", projectId: { not: null }, epiasPlantId: { not: null }, latitude: { not: null } }, select: { epiasPlantId: true } })).map((r) => r.epiasPlantId!))).sort((a, b) => a - b);
const cache = new Map<string, WindNwpResponse>();
let requests = 0;
let failed = 0;

for (const id of ids) {
  const loc = (await readPoolPlantInfo(id))?.location;
  if (!loc) continue;
  const parts: string[] = [];
  for (const model of WIND_NWP_MODELS)
    for (let year = FIRST_YEAR; year <= Number(yesterday.slice(0, 4)); year++) {
      const end = year === Number(yesterday.slice(0, 4)) ? yesterday : `${year}-12-31`;
      const months = Array.from({ length: Number(end.slice(5, 7)) }, (_, k) => String(k + 1).padStart(2, "0"));
      const doc0 = await readWindNwpYear(id, model, year);
      const same = doc0 && doc0.latitude === loc.latitude && doc0.longitude === loc.longitude;
      const stale = months.filter((m) => !same || !final(year, m, doc0!.fetched[m]));
      if (!stale.length) continue;
      const from = `${year}-${stale[0]}-01`;
      const key = `${model}|${Math.round(loc.latitude * 10) / 10},${Math.round(loc.longitude * 10) / 10}|${from}|${end}`;
      if (!cache.has(key)) {
        try {
          cache.set(key, await fetchWindNwp(loc.latitude, loc.longitude, from, end, model));
        } catch (e) {
          failed++;
          parts.push(`${model} ${year} HATA ${(e as Error).message}`);
          continue;
        }
        requests++;
      }
      const doc = same ? doc0! : emptyWindNwpYear(id, year, model, loc.latitude, loc.longitude);
      mergeWindNwp(doc, cache.get(key)!, stale, new Date().toISOString());
      await writeWindNwpYear(doc);
      parts.push(`${model} ${year} ${stale.length} ay`);
    }
  console.log(`#${String(id).padEnd(8)} ${parts.join(" · ") || "güncel"}`);
}
console.log(`\n${requests} istek, ${failed} hata. Geçmiş tahminler: Open-Meteo.com Previous Runs (DWD ICON-EU, NOAA GFS).`);
await prisma.$disconnect();
