/**
 * TR-Energy Analyst - Canlı hava tahmini (ileriye dönük üretim tahmini sayfası; kullanıcı kararı 16.10.2026)
 *
 * Open-Meteo Forecast API, aynı model (ECMWF IFS 0,25°, `WEATHER_MODEL`) ve geçmiş arşivle aynı değişkenler; değer
 * isteğin yapıldığı andaki EN YENİ çalışmadandır (geçmiş arşivdeki `d2` değil: yarın için ≈ 1 gün, öbür gün için ≈ 2 gün
 * önceki tahmin). Hizalama weather-codec.ts ile aynı: ışınım damgadan önceki saatin ortalaması (bir saat geri alınır),
 * anlık değişkenler saat başı. SAF: I/O yok (istek open-meteo.ts, önbellek lib/solar-engine/forecast.ts).
 */

import { WEATHER_MODEL, WEATHER_VARIABLES, type OpenMeteoHourly } from "./weather-codec";

const HOUR = 3_600_000;

/** Güneş modelinin kullandığı değişkenler (production-model-v2.ts `features`) */
export const LIVE_VARIABLES = ["shortwave_radiation", "direct_radiation", "diffuse_radiation", "temperature_2m", "cloud_cover"] as const;
export type LiveVariable = (typeof LIVE_VARIABLES)[number];

export interface LiveWeatherHour {
  /** Üretim saatinin başı (duvar saati ms, UTC alanında; havuzla aynı) */
  t: number;
  ghi: number | null;
  direct: number | null;
  diffuse: number | null;
  temp: number | null;
  cloud: number | null;
}

/** `models`: varsayılan ECMWF; birden çok model istenince Open-Meteo sütun adına `_<model>` ekler (liveWeatherHours `suffix`).
 * Ek modeller (lib/weather/nwp-models.ts, Aşama 22.3) aynı değişkenlerle */
export function liveForecastUrl(latitude: number, longitude: number, days: number, models: readonly string[] = [WEATHER_MODEL]): string {
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: LIVE_VARIABLES.join(","),
    forecast_days: String(days),
    timezone: "Europe/Istanbul",
    models: models.join(","),
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

/** İstenecek gün sayısı: bugün + `days` gün + bir gün daha (ışınım damgadan önceki saatin ortalaması; son üretim saati
 * 23:00–24:00 ertesi günün 00:00 damgasında). 26.10.2026'ya kadar bir eksik isteniyordu: öbür günün son saati boş kalıyordu. */
export const liveFetchDays = (days: number) => days + 2;

const wallMs = (t: string) => Date.parse(`${t}:00Z`);

/**
 * Canlı yanıtın kullanılamama sebebi; sağlamsa null. Yarının (Türkiye saati, UTC+3) 24 saati zaman ekseninde olmalı ve
 * `columns` sütunlarından en az biri o saatlerde değer taşımalı. 26.10.2026: Next.js sunucusunun fetch önbelleği 22 Ekim
 * yanıtını döndürüyordu (tarih ekseni geride); boş değerli yanıt da aynı şekilde yakalanır.
 */
export function liveResponseProblem(hourly: { time: string[]; [column: string]: unknown }, now: number, columns: readonly string[]): string | null {
  const wall = new Date(now + 3 * HOUR);
  const day = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1)).toISOString().slice(0, 10);
  const first = hourly.time.indexOf(`${day}T00:00`);
  const last = hourly.time.indexOf(`${day}T23:00`);
  if (first < 0 || last < first) return `yanıt ${day} gününü kapsamıyor (${hourly.time[0] ?? "?"} – ${hourly.time[hourly.time.length - 1] ?? "?"})`;
  const filled = columns.some((c) => {
    const v = hourly[c];
    return Array.isArray(v) && v.slice(first, last + 1).some((x) => x !== null && x !== undefined);
  });
  return filled ? null : `${day} saatlerinde değer yok`;
}

/** Yanıtı üretim saatlerine çevirir: [from, to) aralığındaki saatler, sırayla; değeri olmayan alan null. `suffix`: çok modelli
 * yanıtta modelin sütun soneki (ör. "_icon_eu") */
export function liveWeatherHours(res: OpenMeteoHourly, from: number, to: number, suffix = ""): LiveWeatherHour[] {
  const byHour = new Map<number, LiveWeatherHour>();
  const get = (t: number) => {
    if (!byHour.has(t)) byHour.set(t, { t, ghi: null, direct: null, diffuse: null, temp: null, cloud: null });
    return byHour.get(t)!;
  };
  const field: Record<LiveVariable, keyof Omit<LiveWeatherHour, "t">> = {
    shortwave_radiation: "ghi",
    direct_radiation: "direct",
    diffuse_radiation: "diffuse",
    temperature_2m: "temp",
    cloud_cover: "cloud",
  };
  const time = res.hourly.time;
  for (const v of LIVE_VARIABLES) {
    const values = res.hourly[v + suffix] as Array<number | null> | undefined;
    if (!values) continue;
    const shift = WEATHER_VARIABLES[v] === "mean" ? 1 : 0;
    for (let k = 0; k < time.length; k++) {
      const value = values[k];
      if (value === null || value === undefined) continue;
      const t = wallMs(time[k]) - shift * HOUR;
      if (t >= from && t < to) get(t)[field[v]] = value;
    }
  }
  const out: LiveWeatherHour[] = [];
  for (let t = from; t < to; t += HOUR) out.push(byHour.get(t) ?? { t, ghi: null, direct: null, diffuse: null, temp: null, cloud: null });
  return out;
}
