/** Canlı ICON-EU/GFS rüzgârı; yalnız rüzgâr günlük gölge kaydı ister.
 * Arşivle aynı göbek yüksekliği dönüşümü ve saat ortalaması, birim m/s.
 * Kaynak: Open-Meteo Forecast, CC BY 4.0. Ek model hatası temel tahmini iptal etmez.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  WIND_NWP_VARIABLES,
  hubWindAt,
  type WindNwpModel,
  type WindNwpYear,
} from "@/lib/weather/wind-nwp-archive";
import { hourMeanWind } from "@/lib/forecast/wind-loss";
const H = 3600000;
export async function liveWindNwp(
  model: WindNwpModel,
  lat: number,
  lon: number,
  from: number,
  count: number,
  now: number,
  fresh = false
) {
  const file = path.join(
    process.cwd(),
    ".cache",
    "forecast",
    "wind-live",
    `${model}_${lat.toFixed(4)}_${lon.toFixed(4)}.json`
  );
  let saved: {
    at: number;
    body: { hourly: { time: string[]; [key: string]: any } };
  } | null = null;
  try {
    const v = JSON.parse(await fs.readFile(file, "utf8"));
    if (!fresh && v.at <= now && now - v.at < 3 * H && v.body?.hourly?.time) saved = v;
  } catch {
    /* yok */
  }
  if (!saved) {
    const q = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      models: model,
      hourly: WIND_NWP_VARIABLES[model].join(","),
      wind_speed_unit: "ms",
      timezone: "Europe/Istanbul",
      forecast_days: "4",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`${model}: Open-Meteo HTTP ${res.status}`);
    const body = await res.json();
    if (!body.hourly?.time?.length) throw new Error(`${model}: boş hava yanıtı`);
    saved = { at: now, body };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(saved));
  }
  const hourly = saved.body.hourly;
  const doc: WindNwpYear = {
    epiasPlantId: 0,
    year: new Date(from).getUTCFullYear(),
    start: new Date(Date.parse(`${hourly.time[0]}:00Z`)).toISOString(),
    model,
    lead: "d2",
    latitude: lat,
    longitude: lon,
    fetched: {},
    series: Object.fromEntries(
      WIND_NWP_VARIABLES[model].map((v) => [
        v,
        hourly[v] ?? Array(hourly.time.length).fill(null),
      ])
    ),
  };
  const hours = Array.from({ length: count }, (_, i) => {
    const t = from + i * H,
      a = hubWindAt(doc, t),
      b = hubWindAt(doc, t + H);
    return hourMeanWind(a.ws, b.ws, a.dir, b.dir);
  });
  return { hours, fetchedAt: new Date(saved.at).toISOString() };
}
