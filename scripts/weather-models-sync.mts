/**
 * Ek hava modelleri arşivi (Aşama 22.3): konumlu güneş santralleri için ICON-EU ve GFS'in 2 gün önceki tahmini
 * (lib/weather/nwp-models.ts). scripts/weather-sync.mts ile aynı düzen: dönem 2024-03-08 → dün, takvim yılı başına bir
 * belge, ay bitişinden 3 gün sonra çekildiyse tamam; iki model tek istekte; aynı koordinat için tek istek.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/weather-models-sync.mts [epiasPlantId ...]
 *
 * Çağrı sınırı (ücretsiz katman: dakikada 600, saatte 5.000, günde 10.000; 2 haftadan uzun dönem birden çok çağrı
 * sayılır): bir yıllık istek ≈ 26 çağrı, istekler arası 4 sn bekleme (≈ dakikada 390). Çıktı:
 * data/pool/weather/<id>/nwp-<model>-<yıl>.json.gz
 */

import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { WEATHER_ARCHIVE_START } from "@/lib/weather/open-meteo";
import { emptyNwpYear, fetchNwp, mergeNwp, NWP_MODEL_LABEL, NWP_MODELS, type NwpResponse } from "@/lib/weather/nwp-models";
import { readNwpYear, writeNwpYear } from "@/lib/weather/weather-store";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const yesterday = iso(Date.now() - DAY);
const settledAfter = (year: number, month: number) => Date.UTC(year, month, 1) + 3 * DAY;

const ids = process.argv.slice(2).map(Number).filter(Boolean);
const plants: Array<{ id: number; name: string; lat: number; lon: number }> = [];
for (const id of ids.length ? ids : await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (info?.location && info.type === "GES") plants.push({ id, name: info.name ?? String(id), lat: info.location.latitude, lon: info.location.longitude });
}
console.log(`${plants.length} güneş santrali, ${WEATHER_ARCHIVE_START} → ${yesterday}, modeller: ${NWP_MODELS.join(", ")}\n`);

const responses = new Map<string, NwpResponse>();
const firstYear = Number(WEATHER_ARCHIVE_START.slice(0, 4));
const lastYear = Number(yesterday.slice(0, 4));
let requests = 0;
let failed = 0;

for (const p of plants) {
  const parts: string[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const from = year === firstYear ? WEATHER_ARCHIVE_START : `${year}-01-01`;
    const to = year === lastYear ? yesterday : `${year + 1}-01-01`;
    const firstMonth = Number(from.slice(5, 7));
    const lastMonth = year === lastYear ? Number(yesterday.slice(5, 7)) : 12;
    const months = Array.from({ length: lastMonth - firstMonth + 1 }, (_, k) => String(firstMonth + k).padStart(2, "0"));
    const docs = await Promise.all(NWP_MODELS.map((m) => readNwpYear(p.id, m, year)));
    const fresh = (d: (typeof docs)[number]) => d && d.latitude === p.lat && d.longitude === p.lon;
    const stale = months.filter((mo) => docs.some((d) => !fresh(d) || !d!.fetched[mo] || Date.parse(d!.fetched[mo]) < settledAfter(year, Number(mo))));
    if (!stale.length) {
      parts.push(`${year} güncel`);
      continue;
    }
    const key = `${p.lat},${p.lon},${year}`;
    let res = responses.get(key);
    if (!res) {
      try {
        if (requests) await new Promise((r) => setTimeout(r, 4_000));
        res = await fetchNwp(p.lat, p.lon, from, to, NWP_MODELS);
        responses.set(key, res);
        requests++;
      } catch (e) {
        failed++;
        parts.push(`${year} HATA ${(e as Error).message}`);
        continue;
      }
    }
    const filled: string[] = [];
    for (const [k, m] of NWP_MODELS.entries()) {
      const doc = fresh(docs[k]) ? docs[k]! : emptyNwpYear(p.id, year, m, p.lat, p.lon);
      mergeNwp(doc, res, NWP_MODELS.length > 1, months, new Date().toISOString());
      await writeNwpYear(doc);
      filled.push(`${m} ${doc.series.ghi.filter((v) => v !== null).length}`);
    }
    parts.push(`${year} ${filled.join(" / ")} saat`);
  }
  console.log(`#${String(p.id).padEnd(8)} ${p.name.slice(0, 26).padEnd(26)} ${parts.join(" · ")}`);
}
console.log(`\n${requests} istek, ${failed} hata. Hava verisi: Open-Meteo.com (CC-BY 4.0): ${NWP_MODELS.map((m) => NWP_MODEL_LABEL[m]).join(", ")}.`);
