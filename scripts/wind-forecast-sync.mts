/**
 * Geçmiş rüzgâr tahminleri (rüzgâr üretim tahmini geriye dönük testi; lib/weather/wind-forecast-archive.ts): konumu olan
 * proje rüzgâr santralleri için ECMWF IFS 0,25° 100 m hız / yön, `d1` ve `d2` sürümleri, 2025-01-01'den dünkü güne.
 * Aynı 0,25° hücreye düşen santraller tek istek; ay sonundan 3 gün sonra çekilmiş ay kesin sayılır. Open-Meteo saatlik /
 * günlük sınırında durur, yeniden çalıştırınca sürer. Rüzgâr motoru alanlarını (sıcaklık, basınç, 10 m; Aşama 23.2) taşımayan
 * yıl dosyası bir kez baştan çekilir.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-forecast-sync.mts [epiasPlantId ...]
 * Çıktı: data/pool/weather/<id>/windfc-<yıl>.json.gz
 */

import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { emptyWindForecastYear, fetchWindForecastArchive, hasEngineFields, mergeWindForecast, WindForecastLimitError, type WindForecastResponse } from "@/lib/weather/wind-forecast-archive";
import { readWindForecastYear, writeWindForecastYear } from "@/lib/weather/weather-store";

const DAY = 86_400_000;
const FIRST_YEAR = 2025;
const yesterday = new Date(Date.now() + 3 * 3_600_000 - DAY).toISOString().slice(0, 10);
const final = (year: number, m: string, at: string | undefined) => !!at && Date.parse(at) >= Date.UTC(year, Number(m), 1) + 3 * DAY;
const args = process.argv.slice(2).map(Number).filter(Boolean);
const ids = args.length
  ? args
  : Array.from(new Set((await prisma.powerPlant.findMany({ where: { type: "RES", projectId: { not: null }, epiasPlantId: { not: null }, latitude: { not: null } }, select: { epiasPlantId: true } })).map((r) => r.epiasPlantId!))).sort((a, b) => a - b);
const cache = new Map<string, WindForecastResponse>();
let requests = 0;
let stopped = false;

outer: for (const id of ids) {
  const loc = (await readPoolPlantInfo(id))?.location;
  if (!loc) continue;
  const parts: string[] = [];
  for (let year = FIRST_YEAR; year <= Number(yesterday.slice(0, 4)); year++) {
    const end = year === Number(yesterday.slice(0, 4)) ? yesterday : `${year}-12-31`;
    const months = Array.from({ length: Number(end.slice(5, 7)) }, (_, k) => String(k + 1).padStart(2, "0"));
    const doc0 = await readWindForecastYear(id, year);
    const same = doc0 && doc0.latitude === loc.latitude && doc0.longitude === loc.longitude && hasEngineFields(doc0);
    const stale = months.filter((m) => !same || !final(year, m, doc0!.fetched[m]));
    if (!stale.length) continue;
    const from = `${year}-${stale[0]}-01`;
    const key = `${Math.round(loc.latitude * 4) / 4},${Math.round(loc.longitude * 4) / 4}|${from}|${end}`;
    if (!cache.has(key)) {
      try {
        cache.set(key, await fetchWindForecastArchive(loc.latitude, loc.longitude, from, end));
      } catch (e) {
        if (e instanceof WindForecastLimitError) {
          console.log(`\nOpen-Meteo sınırı (${e.message}): durdu; yeniden çalıştırınca sürer.`);
          stopped = true;
          break outer;
        }
        throw e;
      }
      requests++;
    }
    const doc = same ? doc0! : emptyWindForecastYear(id, year, loc.latitude, loc.longitude);
    mergeWindForecast(doc, cache.get(key)!, stale, new Date().toISOString());
    await writeWindForecastYear(doc);
    parts.push(`${year} ${stale.length} ay`);
  }
  console.log(`#${String(id).padEnd(8)} ${parts.join(" · ") || "güncel"}`);
}
console.log(`\n${requests} istek${stopped ? " (sınırda durdu)" : ""}. Geçmiş tahminler: Open-Meteo.com Previous Runs, ECMWF IFS 0,25°.`);
await prisma.$disconnect();
