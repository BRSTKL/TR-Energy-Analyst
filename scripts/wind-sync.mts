/**
 * Gerçekleşen rüzgâr (rüzgâr kayıp tespiti; lib/weather/reanalysis-wind.ts): konumu olan proje rüzgâr santralleri için
 * ERA5 (0,25°) ve ECMWF IFS (9 km) saatlik 100 m hız / yön, 2025-01-01'den dünkü güne. Takvim yılı başına bir belge;
 * aynı veriyi döndüren istekler birleşir (ERA5'te aynı 0,25° hücre); kesinleşmiş ay (ay sonundan 7 gün sonra çekilmiş)
 * yeniden istenmez, yalnız kesinleşmemiş aylardan başlayan aralık istenir. Open-Meteo günlük sınırına takılırsa durur;
 * yeniden çalıştırınca kaldığı yerden sürer. Yalnız etiket içindir (tahmin girdisi değil).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-sync.mts [epiasPlantId ...]
 * Çıktı: data/pool/weather/<id>/wind-<model>-<yıl>.json.gz
 */

import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { emptyWindYear, fetchWind, mergeWind, monthFinal, OpenMeteoLimitError, WIND_FIRST_YEAR, WIND_MODELS, windRequestKey, type WindResponse } from "@/lib/weather/reanalysis-wind";
import { readWindYear, writeWindYear } from "@/lib/weather/weather-store";

const DAY = 86_400_000;
const yesterday = new Date(Date.now() + 3 * 3_600_000 - DAY).toISOString().slice(0, 10);
const args = process.argv.slice(2).map(Number).filter(Boolean);
const ids = args.length
  ? args
  : Array.from(new Set((await prisma.powerPlant.findMany({ where: { type: "RES", projectId: { not: null }, epiasPlantId: { not: null }, latitude: { not: null } }, select: { epiasPlantId: true } })).map((r) => r.epiasPlantId!))).sort((a, b) => a - b);
const cache = new Map<string, WindResponse>();
let requests = 0;
let stopped = false;

outer: for (const id of ids) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location) continue;
  const { latitude: lat, longitude: lon } = info.location;
  const parts: string[] = [];
  for (const model of WIND_MODELS) {
    for (let year = WIND_FIRST_YEAR; year <= Number(yesterday.slice(0, 4)); year++) {
      const end = year === Number(yesterday.slice(0, 4)) ? yesterday : `${year}-12-31`;
      const lastMonth = Number(end.slice(5, 7));
      const months = Array.from({ length: lastMonth }, (_, k) => String(k + 1).padStart(2, "0"));
      const doc0 = await readWindYear(id, model, year);
      const same = doc0 && doc0.latitude === lat && doc0.longitude === lon;
      const stale = months.filter((m) => !same || !monthFinal(year, m, doc0!.fetched[m]));
      if (!stale.length) continue;
      const from = `${year}-${stale[0]}-01`;
      const key = `${model}|${windRequestKey(model, lat, lon)}|${from}|${end}`;
      if (!cache.has(key)) {
        try {
          cache.set(key, await fetchWind(model, lat, lon, from, end));
        } catch (e) {
          if (e instanceof OpenMeteoLimitError) {
            console.log(`\nOpen-Meteo sınırı (${e.message}): durdu. Yeniden çalıştırınca kaldığı yerden sürer.`);
            stopped = true;
            break outer;
          }
          throw e;
        }
        requests++;
      }
      const doc = same ? doc0! : emptyWindYear(id, year, model, lat, lon);
      mergeWind(doc, cache.get(key)!, stale, new Date().toISOString());
      await writeWindYear(doc);
      parts.push(`${model} ${year} ${stale.length} ay`);
    }
  }
  console.log(`#${String(id).padEnd(8)} ${(info.name ?? "").slice(0, 26).padEnd(26)} ${parts.join(" · ") || "güncel"}`);
}
console.log(`\n${requests} istek${stopped ? " (sınırda durdu)" : ""}. Rüzgâr: Open-Meteo.com (ERA5: Copernicus Climate Change Service; ECMWF IFS).`);
await prisma.$disconnect();
