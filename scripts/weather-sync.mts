/**
 * Hava verisi havuzu (PLAN 15.2): konumu olan santraller için Open-Meteo Previous Runs (ECMWF IFS 0,25°) saatlik verisi.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/weather-sync.mts [epiasPlantId ...]
 *
 * Santral verilmezse havuz tanımında konumu olan güneş santralleri (tür RES / HES olanlar atlanır: bu arşivi yalnız güneş
 * motoru, güneş karnesi ve kayıp üretim sekmesi okur; rüzgârın kendi arşivi var). Dönem arşivin ilk tam gününden
 * (2024-03-08) dünkü güne kadar, takvim yılı başına bir belge. Bir ay, bitişinden 3 gün sonra çekildiyse tamam sayılır;
 * yalnız ilk eksik ya da tamamlanmamış aydan itibaren istenir (önceden bütün yıl her gün yeniden isteniyordu). Aynı
 * koordinattaki santraller için tek istek. Önce arşivi olan santraller (ucuz güncelleme), sonra yeni santraller.
 *
 * GÜNLÜK PAY (18.11.2026): Open-Meteo ücretsiz sınırı günde 10.000 çağrı, aynı IP'deki canlı tahmin işleriyle ortak. Bu
 * arşiv günde en çok `--budget` (öntanım 4.000) ağırlıklı çağrı harcar (`openMeteoCallWeight`; defter
 * .cache/weather/open-meteo-archive-budget.json, UTC günü). Pay dolarsa ya da Open-Meteo günlük sınır (429) verirse
 * yazılan santraller kalır, çıkış kodu 75: aylık eşitleme bunu hata saymaz, ertesi gün sürdürür. 942 santrallik ilk
 * doldurma böylece birkaç güne yayılır ve canlı tahminin havasını yemez (18.11.2026'da yemişti).
 * Çıktı: data/pool/weather/<id>/<yıl>.json.gz
 */

import fs from "node:fs";
import path from "node:path";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { apiVariableNames, emptyWeatherYear, filledHours, mergeWeather, type OpenMeteoHourly } from "@/lib/weather/weather-codec";
import { fetchPreviousRuns, isOpenMeteoDailyLimit, OPEN_METEO_QUOTA_EXIT, openMeteoCallWeight, WEATHER_ARCHIVE_START } from "@/lib/weather/open-meteo";
import { readWeatherYear, writeWeatherYear } from "@/lib/weather/weather-store";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const yesterday = iso(Date.now() - DAY);
const settledAfter = (year: number, month: number) => Date.UTC(year, month, 1) + 3 * DAY; // ayın bitişi + 3 gün

const args = process.argv.slice(2);
const budgetArg = args.indexOf("--budget");
const BUDGET = budgetArg >= 0 ? Number(args[budgetArg + 1]) : 4000;
const ids = args.filter((_, i) => budgetArg < 0 || i !== budgetArg + 1).map(Number).filter(Boolean);
const plants: Array<{ id: number; name: string; lat: number; lon: number; known: boolean }> = [];
for (const id of ids.length ? ids : await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!ids.length && (info?.type === "RES" || info?.type === "HES")) continue;
  if (info?.location) plants.push({ id, name: info.name ?? String(id), lat: info.location.latitude, lon: info.location.longitude, known: false });
  else if (ids.length) console.log(`#${id}: konum yok, atlandı`);
}
// Arşivi olan santraller önce: günlük güncellemeleri birkaç çağrı, yeni santralin bütün geçmişi yüzlerce
const lastYearOf = Number(yesterday.slice(0, 4));
for (const p of plants) p.known = (await readWeatherYear(p.id, lastYearOf - 1)) !== null;
plants.sort((a, b) => Number(b.known) - Number(a.known));
console.log(`${plants.length} santral (${plants.filter((p) => !p.known).length} yeni), ${WEATHER_ARCHIVE_START} → ${yesterday}\n`);

// Günlük pay defteri (UTC günü; Open-Meteo sayacı günlük)
const LEDGER = path.join(process.cwd(), ".cache", "weather", "open-meteo-archive-budget.json");
const utcDay = new Date().toISOString().slice(0, 10);
let used = 0;
try {
  const l = JSON.parse(fs.readFileSync(LEDGER, "utf8")) as { day: string; used: number };
  if (l.day === utcDay) used = l.used;
} catch {}
const saveLedger = () => {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify({ day: utcDay, used: Math.round(used * 10) / 10 }));
};
const nVars = apiVariableNames().length;
const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY + 1;
let stopped: string | null = null;

const responses = new Map<string, OpenMeteoHourly>();
const firstYear = Number(WEATHER_ARCHIVE_START.slice(0, 4));
const lastYear = Number(yesterday.slice(0, 4));
let requests = 0;

for (const p of plants) {
  if (stopped) break;
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
    // Yalnız ilk bayat aydan itibaren (ilk yılın ilk ayı arşiv başlangıcından)
    const fromStale = stale[0] === months[0] ? from : `${year}-${stale[0]}-01`;
    const key = `${p.lat},${p.lon},${fromStale},${to}`;
    let res = responses.get(key);
    if (!res) {
      const weight = openMeteoCallWeight(nVars, days(fromStale, to));
      if (used + weight > BUDGET) {
        stopped = `günlük pay doldu (${Math.round(used)} / ${BUDGET} çağrı)`;
        parts.push(`${year} sonraki güne kaldı`);
        break;
      }
      try {
        res = await fetchPreviousRuns(p.lat, p.lon, fromStale, to);
      } catch (e) {
        if (!isOpenMeteoDailyLimit(e)) throw e;
        stopped = "Open-Meteo günlük sınırı (429)";
        parts.push(`${year} sonraki güne kaldı`);
        break;
      }
      used += weight;
      saveLedger();
      responses.set(key, res);
      requests++;
    }
    const doc = sameLocation ? existing! : emptyWeatherYear(p.id, year, p.lat, p.lon);
    mergeWeather(doc, res, stale, new Date().toISOString());
    await writeWeatherYear(doc);
    parts.push(`${year} ${filledHours(doc, "d2", "shortwave_radiation")} saat (d2 GHI)`);
  }
  console.log(`#${String(p.id).padEnd(8)} ${p.name.slice(0, 28).padEnd(28)} ${parts.join(" · ")}`);
}
console.log(`\n${requests} istek, bugün ${Math.round(used)} / ${BUDGET} ağırlıklı çağrı. Hava verisi: Open-Meteo.com (CC-BY 4.0), ECMWF IFS 0,25°.`);
if (stopped) {
  console.log(`DURDU: ${stopped}; kalan santraller ertesi gün sürer.`);
  process.exit(OPEN_METEO_QUOTA_EXIT);
}
