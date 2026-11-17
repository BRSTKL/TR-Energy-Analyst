/**
 * WeatherNext 3 → havuz (data/pool/weather/wn3; lib/weather/weathernext-store.ts). Hedef gün başına kesimden önce elde olan
 * çalışma (D-1 00 UTC, yoksa D-2 18 UTC), bütün konumlu havuz santrallerinin hücreleri + Türkiye'yi 0,5°'de kaplayan ağ
 * (PTF bölge noktaları için; okunan bayt hücre sayısına bağlı değil, Türkiye kutusuna bağlı).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/weathernext-sync.mts [başlangıç=YYYY-MM-DD] [bitiş=YYYY-MM-DD] [--max-gb 900] [--dry] [--force]
 *
 * Varsayılan: son 3 gün ile yarın arası. Her bölüm (UTC günü) için o günün 00 ve 18 UTC çalışmaları, 21–50. öncü saatler
 * (Türkiye günü D için 00 UTC'nin 21–44, 18 UTC'nin 27–50. saatleri). Her değişken AYRI sorguyla: BigQuery tahmini taramayı
 * kümelemeyi hesaba katmadan seçilen sütun sayısıyla büyütür (≈ 110 GB / sütun / gün; 13 sütun 1,4 TB) ve hem
 * `maximumBytesBilled` hem Sandbox kotası bu tahmine bakar (17.11.2026: 4 GB tavanlı sorgu reddedildi). Gerçek tüketim
 * küçüktür; gruplar (GROUPS) bu yüzden küçük tutulur ve tüketim sorgudan SONRA denetlenir: tek sorgu `PER_QUERY_MAX`'ı ya da toplam `--max-gb`'yi aşarsa durur.
 * Dolu günler atlanır (`--force` yeniden yazar).
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
/** Tek değişken sorgusunun gerçek tüketimi bundan büyükse kümeleme çalışmıyor demektir: dur */
const PER_QUERY_MAX = 3e9;
/**
 * Sorgu grupları: her sorgu konum ve zaman sütunlarını yeniden okur (≈ 0,5 GB / gün), tek sütunlu sorgular pahalı
 * (17.11.2026: 10 sorgu 6 GB / gün; tek sorguda 10 sütun 1,4 GB). Temel grup arşivde de çekilir; ek grup (`--full`,
 * canlı günlük çekimde) bant ve yardımcı değişkenler.
 */
const GROUPS: string[][] = [["u", "v", "ws", "t2m", "ghi", "direct"], ["p10", "p90", "ws10", "cloud"]];
const full = args.includes("--full");
const COLUMNS: Record<string, string> = {
  u: "u_component_of_wind_100m_mean",
  v: "v_component_of_wind_100m_mean",
  ws: "wind_speed_100m_mean",
  p10: "wind_speed_100m_p10",
  p90: "wind_speed_100m_p90",
  ws10: "wind_speed_10m_mean",
  t2m: "temperature_2m_mean",
  ghi: "surface_solar_radiation_downwards_1hr_mean",
  direct: "total_sky_direct_solar_radiation_at_surface_1hr_mean",
  cloud: "total_cloud_cover_mean",
};

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
const sqlFor = (partition: string, names: string[]) => `
SELECT FORMAT('%.1f_%.1f', ROUND(ST_Y(t.geography), 1), ROUND(ST_X(t.geography), 1)) AS cell, UNIX_SECONDS(t.init_time) AS run, f.hours AS lead,
  ${names.map((n) => `f.${COLUMNS[n]} AS ${n}`).join(", ")}
FROM \`${WEATHERNEXT_TABLE}\` AS t, t.forecast AS f
WHERE t.init_time IN (TIMESTAMP('${partition} 00:00:00 UTC'), TIMESTAMP('${partition} 18:00:00 UTC'))
  AND ST_INTERSECTS(t.geography, ST_GEOGFROMTEXT('${turkeyBoxWkt()}'))
  AND f.hours BETWEEN 21 AND 50
  AND FORMAT('%.1f_%.1f', ROUND(ST_Y(t.geography), 1), ROUND(ST_X(t.geography), 1)) IN UNNEST([${keys.map((k) => `'${k}'`).join(",")}])`;

let billed = 0;
const partitions = new Map<string, Wn3Row[]>();
async function partition(p: string): Promise<Wn3Row[]> {
  const hit = partitions.get(p);
  if (hit) return hit;
  const raw = new Map<string, Record<string, number | null> & { cell: string; run: number; lead: number }>();
  let partBilled = 0;
  for (const names of full ? GROUPS : GROUPS.slice(0, 1)) {
    const name = names.join("+");
    const sql = sqlFor(p, names);
    if (dry) {
      const r = await weathernextQuery(sql, { dryRun: true });
      console.log(`  ${p} ${name}: tahmini tarama ${(r.bytesBilled / 1e9).toFixed(0)} GB (üst sınır)`);
      continue;
    }
    const r = await weathernextQuery(sql);
    billed += r.bytesBilled;
    partBilled += r.bytesBilled;
    if (r.bytesBilled > PER_QUERY_MAX) throw new Error(`${p} ${name}: tek sorgu ${(r.bytesBilled / 1e9).toFixed(1)} GB tüketti (sınır ${PER_QUERY_MAX / 1e9} GB); kümeleme beklenen gibi çalışmıyor, duruldu`);
    const [ci, ri, li] = ["cell", "run", "lead"].map((n) => r.fields.indexOf(n));
    const vi = names.map((n) => r.fields.indexOf(n));
    for (const x of r.rows) {
      const key = `${x[ci]}|${x[ri]}|${x[li]}`;
      const row = raw.get(key) ?? { cell: x[ci]!, run: Number(x[ri]) * 1000, lead: Number(x[li]) };
      names.forEach((n, j) => (row[n] = x[vi[j]] === null ? null : Number(x[vi[j]])));
      raw.set(key, row);
    }
  }
  if (dry) {
    partitions.set(p, []);
    return [];
  }
  const g = (r: Record<string, number | null>, n: string) => (r[n] === undefined ? null : r[n]);
  const rows: Wn3Row[] = [...raw.values()].map((r) => ({
    cell: r.cell,
    run: r.run,
    lead: r.lead,
    values: convertRow({ u: g(r, "u"), v: g(r, "v"), ws: g(r, "ws"), p10: g(r, "p10"), p90: g(r, "p90"), ws10: g(r, "ws10"), t2m: g(r, "t2m"), ghi: g(r, "ghi"), direct: g(r, "direct"), cloud: g(r, "cloud") }),
  }));
  console.log(`  bölüm ${p}: ${rows.length} satır, ${(partBilled / 1e9).toFixed(2)} GB (toplam ${(billed / 1e9).toFixed(1)} GB)`);
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
