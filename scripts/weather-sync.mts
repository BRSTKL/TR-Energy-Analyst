/**
 * Hava verisi havuzu (PLAN 15.2): konumu olan santraller için Open-Meteo Previous Runs (ECMWF IFS 0,25°) saatlik verisi.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/weather-sync.mts [epiasPlantId ...]
 *
 * Santral verilmezse havuz tanımında konumu olan bütün santraller. Dönem arşivin ilk tam gününden (2024-03-08) dünkü
 * güne kadar, takvim yılı başına bir belge. Bir ay, bitişinden 3 gün sonra çekildiyse tamam sayılır; eksik ya da
 * tamamlanmamış ay varsa yılın tamamı yeniden istenir (tek istek). Aynı koordinattaki santraller için tek istek.
 * Çıktı: data/pool/weather/<id>/<yıl>.json.gz
 */

import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { emptyWeatherYear, filledHours, mergeWeather, type OpenMeteoHourly } from "@/lib/weather/weather-codec";
import { fetchPreviousRuns, WEATHER_ARCHIVE_START } from "@/lib/weather/open-meteo";
import { readWeatherYear, writeWeatherYear } from "@/lib/weather/weather-store";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const yesterday = iso(Date.now() - DAY);
const settledAfter = (year: number, month: number) => Date.UTC(year, month, 1) + 3 * DAY; // ayın bitişi + 3 gün

const ids = process.argv.slice(2).map(Number).filter(Boolean);
const plants: Array<{ id: number; name: string; lat: number; lon: number }> = [];
for (const id of ids.length ? ids : await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (info?.location) plants.push({ id, name: info.name ?? String(id), lat: info.location.latitude, lon: info.location.longitude });
  else if (ids.length) console.log(`#${id}: konum yok, atlandı`);
}
console.log(`${plants.length} santral, ${WEATHER_ARCHIVE_START} → ${yesterday}\n`);

const responses = new Map<string, OpenMeteoHourly>();
const firstYear = Number(WEATHER_ARCHIVE_START.slice(0, 4));
const lastYear = Number(yesterday.slice(0, 4));
let requests = 0;

for (const p of plants) {
  const parts: string[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const from = year === firstYear ? WEATHER_ARCHIVE_START : `${year}-01-01`;
    // Işınım bir saat geri kaydığından yılın son saati için ertesi günün ilk damgası da istenir
    const to = year === lastYear ? yesterday : `${year + 1}-01-01`;
    const firstMonth = Number(from.slice(5, 7));
    const lastMonth = year === lastYear ? Number(yesterday.slice(5, 7)) : 12;
    const months = Array.from({ length: lastMonth - firstMonth + 1 }, (_, k) => String(firstMonth + k).padStart(2, "0"));

    const existing = await readWeatherYear(p.id, year);
    const sameLocation = existing && existing.latitude === p.lat && existing.longitude === p.lon;
    const stale = months.filter((m) => !sameLocation || !existing!.fetched[m] || Date.parse(existing!.fetched[m]) < settledAfter(year, Number(m)));
    if (!stale.length) {
      parts.push(`${year} güncel`);
      continue;
    }
    const key = `${p.lat},${p.lon},${year}`;
    let res = responses.get(key);
    if (!res) {
      res = await fetchPreviousRuns(p.lat, p.lon, from, to);
      responses.set(key, res);
      requests++;
    }
    const doc = sameLocation ? existing! : emptyWeatherYear(p.id, year, p.lat, p.lon);
    mergeWeather(doc, res, months, new Date().toISOString());
    await writeWeatherYear(doc);
    parts.push(`${year} ${filledHours(doc, "d2", "shortwave_radiation")} saat (d2 GHI)`);
  }
  console.log(`#${String(p.id).padEnd(8)} ${p.name.slice(0, 28).padEnd(28)} ${parts.join(" · ")}`);
}
console.log(`\n${requests} istek. Hava verisi: Open-Meteo.com (CC-BY 4.0), ECMWF IFS 0,25°.`);
