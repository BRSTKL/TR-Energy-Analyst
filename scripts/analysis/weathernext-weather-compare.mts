/**
 * Hava seviyesinde kıyas (17.11.2026): WeatherNext 3'ün tahmini, kullandığımız ECMWF tahmininden gerçekleşen havaya daha mı
 * yakın? Üretim modeli yok; yalnız hava. Proje santralleri, yalnız 01.09.2026 sonrası (WN3 canlı yayım dönemi).
 *   - Rüzgâr (RES): damga başına 100 m hız. Gerçekleşen = ECMWF IFS analizi (lib/weather/reanalysis-wind.ts; ECMWF'e hafif
 *     avantaj). Adaylar: WN3 (D-1 00 UTC çalışması), ECMWF d2 (bugün kullanılan, 2 gün önceki çalışma), ECMWF d1 (aynı
 *     tazelikte, 1 gün önceki; bir kısmı kesimden sonra: yalnız "model mi tazelik mi" sorusu için).
 *   - Güneş (GES): üretim saati başına küresel ışınım (W/m²), gündüz (uydu > 20 W/m²). Gerçekleşen = uydu (SARAH3; bağımsız).
 *     Adaylar: WN3, ECMWF d2, ECMWF d1. Uydu gök durumuna göre açık / parçalı / kapalı ayrıca.
 * Yalnız eşleşmiş saatler (bütün adayların ve gerçekleşenin olduğu). Okur, yazmaz.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/weathernext-weather-compare.mts [başlangıç=2026-09-01] [bitiş=2026-10-31]
 */
import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { readSatelliteYear, readWeatherYear, readWindForecastYear, readWindYear } from "@/lib/weather/weather-store";
import { decisionCutoff, WEATHER_RUN_RULES } from "@/lib/forecast/info-time";
import { nearestCell } from "@/lib/weather/weathernext";
import { wn3Stamps, wn3UsableFor } from "@/lib/weather/weathernext-store";

const HOUR = 3_600_000;
const days = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const from = Date.parse(`${days[0] ?? "2026-09-01"}T00:00:00Z`);
const to = Date.parse(`${days[1] ?? "2026-10-31"}T00:00:00Z`) + 24 * HOUR;
const DELAY = WEATHER_RUN_RULES.weathernext3.publishDelayMs;
const year = new Date(from).getUTCFullYear();

const plants = await prisma.powerPlant.findMany({ where: { projectId: { not: null }, type: { in: ["RES", "GES"] }, epiasPlantId: { not: null } }, select: { epiasPlantId: true, type: true } });
await prisma.$disconnect();
const uniq = new Map(plants.map((p) => [p.epiasPlantId!, p.type]));

type Acc = { n: number; abs: Record<string, number>; bias: Record<string, number>; actual: number };
const acc = () => ({ n: 0, abs: {}, bias: {}, actual: 0 }) as Acc;
const add = (a: Acc, actual: number, preds: Record<string, number>) => {
  a.n++;
  a.actual += actual;
  for (const [k, v] of Object.entries(preds)) {
    a.abs[k] = (a.abs[k] ?? 0) + Math.abs(v - actual);
    a.bias[k] = (a.bias[k] ?? 0) + (v - actual);
  }
};
const wind = acc();
const solar: Record<string, Acc> = { tümü: acc(), açık: acc(), parçalı: acc(), kapalı: acc() };
let windPlants = 0, solarPlants = 0;

for (const [id, type] of uniq) {
  const loc = (await readPoolPlantInfo(id))?.location;
  if (!loc) continue;
  const c = nearestCell(loc.latitude, loc.longitude);
  const wn = await wn3Stamps(c.latitude, c.longitude, from, to + HOUR, DELAY, decisionCutoff);
  if (!wn.size) continue;
  if (type === "RES") {
    const [fc, re] = await Promise.all([readWindForecastYear(id, year), readWindYear(id, "ecmwf_ifs", year)]);
    if (!fc || !re) continue;
    const fi = (t: number) => (t - Date.parse(fc.start)) / HOUR;
    const ri = (t: number) => (t - Date.parse(re.start)) / HOUR;
    let used = false;
    for (let t = from; t < to; t += HOUR) {
      const w = wn3UsableFor(wn.get(t), t, DELAY, decisionCutoff)?.values.ws100;
      const d2 = fc.ws.d2[fi(t)], d1 = fc.ws.d1[fi(t)], a = re.ws[ri(t)];
      if (w == null || d2 == null || d1 == null || a == null) continue;
      add(wind, a, { WN3: w, "ECMWF d2": d2, "ECMWF d1": d1 });
      used = true;
    }
    if (used) windPlants++;
  } else {
    const [wx, sat] = await Promise.all([readWeatherYear(id, year), readSatelliteYear(id, year)]);
    if (!wx || !sat) continue;
    const xi = (t: number) => (t - Date.parse(wx.start)) / HOUR;
    const si = (t: number) => (t - Date.parse(sat.start)) / HOUR;
    let used = false;
    for (let t = from; t < to; t += HOUR) {
      // Üretim saati t: WN3 ışınımı t+1 damgası (önceki saatin birikimi); pool hava ve uydu dizileri zaten saat t'ye hizalı
      const w = wn3UsableFor(wn.get(t + HOUR), t, DELAY, decisionCutoff)?.values.ghi;
      const d2 = wx.series.d2?.shortwave_radiation[xi(t)], d1 = wx.series.d1?.shortwave_radiation[xi(t)];
      const a = sat.ghi[si(t)];
      if (w == null || d2 == null || d1 == null || a == null || a <= 20) continue;
      // Gök durumu: uydu / üç adayın en yükseği (açık gök vekili; yalnız sınıflama için)
      const clear = Math.max(a, w, d2, d1);
      const k = a / clear;
      const sky = k > 0.8 ? "açık" : k > 0.4 ? "parçalı" : "kapalı";
      add(solar.tümü, a, { WN3: w, "ECMWF d2": d2, "ECMWF d1": d1 });
      add(solar[sky], a, { WN3: w, "ECMWF d2": d2, "ECMWF d1": d1 });
      used = true;
    }
    if (used) solarPlants++;
  }
}

const line = (label: string, a: Acc, unit: string) => {
  if (!a.n) return `${label}: veri yok`;
  const mean = a.actual / a.n;
  const parts = Object.keys(a.abs).map((k) => `${k} ${(a.abs[k] / a.n).toFixed(unit === "m/s" ? 2 : 0)} ${unit} (%${((100 * a.abs[k]) / a.n / mean).toFixed(0)}, sapma ${(a.bias[k] / a.n).toFixed(unit === "m/s" ? 2 : 0)})`);
  return `${label} [${a.n} saat, ortalama ${mean.toFixed(unit === "m/s" ? 1 : 0)} ${unit}]: ${parts.join(" · ")}`;
};
console.log(`Dönem ${new Date(from).toISOString().slice(0, 10)} – ${new Date(to - HOUR).toISOString().slice(0, 10)}; ortalama mutlak hata (gerçekleşenin ortalamasına oranı, ortalama sapma)`);
console.log(line(`Rüzgâr 100 m, ${windPlants} santral`, wind, "m/s"));
for (const [k, a] of Object.entries(solar)) console.log(line(`Güneş ışınımı ${k}, ${solarPlants} santral`, a, "W/m²"));
