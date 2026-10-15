/**
 * Uydu ışınımı (gerçekleşen; PLAN 15.5 kısıntı tespiti): konumu olan güneş santralleri için SARAH3 saatlik GHI /
 * doğrudan / dağınık, 2024-01-01'den (SARAH3 gecikmesi + 1) gün öncesine kadar. Takvim yılı başına bir belge; aynı
 * koordinata tek istek; tamamlanmış ay yeniden istenmez. Yalnız etiket içindir (tahmin girdisi değil).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/satellite-sync.mts [epiasPlantId ...]
 * Çıktı: data/pool/weather/<id>/sat-<yıl>.json.gz
 */

import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { emptySatelliteYear, fetchSatellite, mergeSatellite, SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import { readSatelliteYear, writeSatelliteYear } from "@/lib/weather/weather-store";

const DAY = 86_400_000;
const last = new Date(Date.now() - (SATELLITE_DELAY_DAYS + 1) * DAY).toISOString().slice(0, 10);
const ids = process.argv.slice(2).map(Number).filter(Boolean);
const cache = new Map<string, any>();
let requests = 0;

for (const id of ids.length ? ids : await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location || (info.type && info.type !== "GES")) continue;
  const { latitude: lat, longitude: lon } = info.location;
  const parts: string[] = [];
  for (let year = 2024; year <= Number(last.slice(0, 4)); year++) {
    const to = year === Number(last.slice(0, 4)) ? last : `${year + 1}-01-01`;
    const lastMonth = year === Number(last.slice(0, 4)) ? Number(last.slice(5, 7)) : 12;
    const months = Array.from({ length: lastMonth }, (_, k) => String(k + 1).padStart(2, "0"));
    const doc0 = await readSatelliteYear(id, year);
    const same = doc0 && doc0.latitude === lat && doc0.longitude === lon;
    const stale = months.filter((m) => !same || !doc0!.fetched[m] || Date.parse(doc0!.fetched[m]) < Date.UTC(year, Number(m), 1) + (SATELLITE_DELAY_DAYS + 1) * DAY);
    if (!stale.length) {
      parts.push(`${year} güncel`);
      continue;
    }
    const key = `${lat},${lon},${year}`;
    if (!cache.has(key)) {
      cache.set(key, await fetchSatellite(lat, lon, `${year}-01-01`, to));
      requests++;
    }
    const doc = same ? doc0! : emptySatelliteYear(id, year, lat, lon);
    mergeSatellite(doc, cache.get(key), months, new Date().toISOString());
    await writeSatelliteYear(doc);
    parts.push(`${year} ${doc.ghi.filter((x) => x !== null).length} saat`);
  }
  console.log(`#${String(id).padEnd(8)} ${(info.name ?? "").slice(0, 26).padEnd(26)} ${parts.join(" · ")}`);
}
console.log(`\n${requests} istek. Uydu ışınımı: Open-Meteo.com, EUMETSAT CM SAF SARAH3.`);
