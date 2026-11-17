/**
 * WeatherNext 3 → havuz (data/pool/weather/wn3; lib/weather/weathernext-store.ts). Hedef gün başına kesimden önce elde olan
 * çalışma (D-1 00 UTC, yoksa D-2 18 UTC), bütün konumlu havuz santrallerinin hücreleri + Türkiye'yi 0,5°'de kaplayan ağ
 * (PTF bölge noktaları için; okunan bayt hücre sayısına bağlı değil, Türkiye kutusuna bağlı).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/weathernext-sync.mts [başlangıç=YYYY-MM-DD] [bitiş=YYYY-MM-DD] [--max-gb 900] [--dry] [--force]
 *
 * Varsayılan: son 3 gün ile yarın arası. Her bölüm (UTC günü) için tek sorgu: o günün 00 ve 18 UTC çalışmaları, 21–50.
 * öncü saatler (Türkiye günü D için 00 UTC'nin 21–44, 18 UTC'nin 27–50. saatleri). Sorgu başına kota tavanı 4 GB
 * (BigQuery aşacak sorguyu çalıştırmaz); toplam `--max-gb` aşılınca durur. Dolu günler atlanır (`--force` yeniden yazar).
 * `--dry` yalnız tahmini taramayı yazar (kota harcamaz). Yayımlanmamış çalışmanın günü yazılmaz (sonraki çalışmada dolar).
 * Lisans ve atıf: lib/weather/weathernext.ts.
 */
import { readPoolPlantInfo, listPoolPlants } from "@/lib/pool/pool-store";
import { WEATHER_RUN_RULES } from "@/lib/forecast/info-time";
import { nearestCell, turkeyBoxWkt, TURKEY_BOX, weathernextQuery, weathernextRunsForTargetDay, WEATHERNEXT_TABLE } from "@/lib/weather/weathernext";
import { assembleDay, cellKey, convertRow, dayAdd, emptyCellYear, putDay, readCellYear, writeCellYear, type Wn3CellYear, type Wn3Row } from "@/lib/weather/weathernext-store";

const HOUR = 3_600_000;
const args = process.argv.slice(2);
const days = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const today = new Date(Date.now() + 3 * HOUR).toISOString().slice(0, 10);
const from = days[0] ?? dayAdd(today, -3);
const to = days[1] ?? dayAdd(today, 1);
const dry = args.includes("--dry");
const force = args.includes("--force");
const maxGb = Number(args[args.indexOf("--max-gb") + 1]) || 900;
const DELAY = WEATHER_RUN_RULES.weathernext3.publishDelayMs;
const PER_QUERY_MAX = 4e9;

// Hücreler: havuz santralleri + 0,5° ağ
const cells = new Map<string, { latitude: number; longitude: number }>();
for (const id of await listPoolPlants()) {
  const loc = (await readPoolPlantInfo(id))?.location;
  if (!loc) continue;
  const c = nearestCell(loc.latitude, loc.longitude);
  cells.set(cellKey(c.latitude, c.longitude), c);
}
const plantCells = cells.size;
for (let lat = Math.ceil(TURKEY_BOX.south * 2) / 2; lat <= TURKEY_BOX.north; lat += 0.5)
  for (let lon = Math.ceil(TURKEY_BOX.west * 2) / 2; lon <= TURKEY_BOX.east; lon += 0.5) cells.set(cellKey(lat, lon), { latitude: Math.round(lat * 10) / 10, longitude: Math.round(lon * 10) / 10 });
console.log(`hücre ${cells.size} (santral ${plantCells}, ağ ${cells.size - plantCells}); hedef günler ${from} – ${to}`);

const keys = [...cells.keys()];
const sqlFor = (partition: string) => `
SELECT FORMAT('%.1f_%.1f', ROUND(ST_Y(t.geography), 1), ROUND(ST_X(t.geography), 1)) AS cell, UNIX_SECONDS(t.init_time) AS run, f.hours AS lead,
  f.u_component_of_wind_100m_mean AS u, f.v_component_of_wind_100m_mean AS v, f.wind_speed_100m_mean AS ws,
  f.wind_speed_100m_p10 AS p10, f.wind_speed_100m_p90 AS p90, f.wind_speed_10m_mean AS ws10, f.temperature_2m_mean AS t2m,
  f.surface_solar_radiation_downwards_1hr_mean AS ghi, f.total_sky_direct_solar_radiation_at_surface_1hr_mean AS direct,
  f.total_cloud_cover_mean AS cloud
FROM \`${WEATHERNEXT_TABLE}\` AS t, t.forecast AS f
WHERE t.init_time IN (TIMESTAMP('${partition} 00:00:00 UTC'), TIMESTAMP('${partition} 18:00:00 UTC'))
  AND ST_INTERSECTS(t.geography, ST_GEOGFROMTEXT('${turkeyBoxWkt()}'))
  AND f.hours BETWEEN 21 AND 50
  AND FORMAT('%.1f_%.1f', ROUND(ST_Y(t.geography), 1), ROUND(ST_X(t.geography), 1)) IN UNNEST(@cells)`;

let billed = 0;
const partitions = new Map<string, Wn3Row[]>();
async function partition(p: string): Promise<Wn3Row[]> {
  const hit = partitions.get(p);
  if (hit) return hit;
  // Sorgu parametresi yerine dizi sabit olarak gömülür (REST parametre biçimi uzun; değerler yalnız hücre anahtarı)
  const sql = sqlFor(p).replace("@cells", `[${keys.map((k) => `'${k}'`).join(",")}]`);
  if (dry) {
    const r = await weathernextQuery(sql, { dryRun: true });
    console.log(`  ${p}: tahmini tarama ${(r.bytesBilled / 1e9).toFixed(2)} GB (üst sınır; kümeleme gerçek tüketimi düşürür)`);
    partitions.set(p, []);
    return [];
  }
  const r = await weathernextQuery(sql, { maxBytesBilled: PER_QUERY_MAX });
  billed += r.bytesBilled;
  const col = (n: string) => r.fields.indexOf(n);
  const num = (v: string | null) => (v === null ? null : Number(v));
  const rows: Wn3Row[] = r.rows.map((x) => ({
    cell: x[col("cell")]!,
    run: Number(x[col("run")]) * 1000,
    lead: Number(x[col("lead")]),
    values: convertRow({ u: num(x[col("u")]), v: num(x[col("v")]), ws: num(x[col("ws")]), p10: num(x[col("p10")]), p90: num(x[col("p90")]), ws10: num(x[col("ws10")]), t2m: num(x[col("t2m")]), ghi: num(x[col("ghi")]), direct: num(x[col("direct")]), cloud: num(x[col("cloud")]) }),
  }));
  console.log(`  bölüm ${p}: ${rows.length} satır, ${(r.bytesBilled / 1e9).toFixed(2)} GB (toplam ${(billed / 1e9).toFixed(1)} GB)`);
  partitions.set(p, rows);
  return rows;
}

// Ay ay: o ayın hücre dosyalarını açar, günleri doldurur, yazar
let written = 0;
let day = from;
outer: while (day <= to) {
  const month = day.slice(0, 7);
  const year = Number(day.slice(0, 4));
  const docs = new Map<string, Wn3CellYear>();
  for (const [k, c] of cells) docs.set(k, (await readCellYear(c.latitude, c.longitude, year)) ?? emptyCellYear(c.latitude, c.longitude, year));
  let changed = false;
  for (; day <= to && day.slice(0, 7) === month; day = dayAdd(day, 1)) {
    const runs = weathernextRunsForTargetDay(day, DELAY);
    if (Date.now() < runs[0] + DELAY) {
      console.log(`${day}: çalışma ${new Date(runs[0]).toISOString()} henüz yayımlanmadı (kural); duruldu`);
      break outer;
    }
    if (!force && [...docs.values()].every((d) => d.runs[day])) continue;
    if (billed / 1e9 > maxGb) {
      console.log(`kota sınırı (${maxGb} GB) aşıldı; ${day} ve sonrası yazılmadı`);
      break outer;
    }
    const parts = [...new Set(runs.map((r) => new Date(r).toISOString().slice(0, 10)))];
    const rows = (await Promise.all(parts.map(partition))).flat();
    if (dry) continue;
    const got = assembleDay(rows, day, runs);
    for (const [k, v] of got) {
      const d = docs.get(k);
      if (d) putDay(d, day, v.run, v.values);
    }
    const fallback = [...got.values()].filter((v) => v.run !== runs[0]).length;
    console.log(`${day}: ${got.size}/${cells.size} hücre${fallback ? ` (${fallback} hücre yedek çalışmadan)` : ""}`);
    if (got.size) changed = true;
    // Eski bölümleri bellekten at (D-2'den eski gerekmez)
    for (const p of partitions.keys()) if (p < dayAdd(day, -2)) partitions.delete(p);
  }
  if (changed && !dry) {
    for (const d of docs.values()) await writeCellYear(d);
    written += docs.size;
  }
}
console.log(dry ? "kuru deneme: yazılmadı" : `bitti: ${written} hücre dosyası yazıldı, faturalanan toplam ${(billed / 1e9).toFixed(2)} GB`);
