/**
 * TR-Energy Analyst - Rüzgârda ek hava modelleri: geçmiş tahmin arşivi (Aşama 23.4)
 *
 * Kaynak Open-Meteo Previous Runs API, yalnız `_previous_day2` (bilgi anı kuralı güneşteki ek modellerle aynı:
 * lib/weather/nwp-models.ts, lib/forecast/info-time.ts `WEATHER_RUN_RULES`). ECMWF IFS 0,25° rüzgârı ayrı arşivde
 * (wind-forecast-archive.ts). Değişkenler (PLAN 23.0, Open-Meteo kaynak kodundan doğrulandı 19.10.2026):
 *   - `icon_eu`: 80 ve 120 m hız / yön, 10 m hız, 10 m hamle (saklanan; Türkiye ızgara içinde).
 *   - `gfs_global`: 80 m hız / yön, 100 m hız (bileşenleri saklanıyor, adı belgede yok: boş dönebilir), 10 m hız ve hamle.
 * Değerler anlık (damga i); göbek yüksekliği rüzgârı (`hubWind`) üretim saati [i, i+1) için i ve i+1 ortalaması, 100 m'ye
 * taşınmış: ICON-EU'da 80 ve 120 m arasında kesme üssüyle, GFS'te 100 m varsa doğrudan, yoksa 10 → 80 m üssüyle 80 m'den.
 * Arşiv başlangıcı Mac'te ölçülecek (PLAN 23.0). Atıf "Weather data by Open-Meteo.com". SAF (fetch dışında I/O yok).
 */

import { hourMeanWind } from "@/lib/forecast/wind-loss";
import { extrapolateSpeed, shearExponent } from "@/lib/wind-engine/physics/air-density";

export const WIND_NWP_MODELS = ["icon_eu", "gfs_global"] as const;
export type WindNwpModel = (typeof WIND_NWP_MODELS)[number];

/** Model → saklanan değişkenler (Open-Meteo adı, `_previous_day2` eki olmadan) */
export const WIND_NWP_VARIABLES: Record<WindNwpModel, string[]> = {
  icon_eu: ["wind_speed_80m", "wind_direction_80m", "wind_speed_120m", "wind_direction_120m", "wind_speed_10m", "wind_gusts_10m"],
  gfs_global: ["wind_speed_80m", "wind_direction_80m", "wind_speed_100m", "wind_speed_10m", "wind_gusts_10m"],
};
/** Hedef yükseklik (m): ECMWF arşiviyle aynı */
export const HUB_M = 100;

export interface WindNwpYear {
  epiasPlantId: number;
  year: number;
  /** Yılın 1 Ocak 00:00'ı (duvar saati UTC alanında, ISO) */
  start: string;
  model: WindNwpModel;
  lead: "d2";
  latitude: number;
  longitude: number;
  /** Değişken → damga i'deki anlık değer */
  series: Record<string, Array<number | null>>;
  fetched: Record<string, string>;
}

const HOUR = 3_600_000;
const hoursInYear = (year: number) => (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / HOUR;

export function emptyWindNwpYear(epiasPlantId: number, year: number, model: WindNwpModel, latitude: number, longitude: number): WindNwpYear {
  const n = hoursInYear(year);
  return {
    epiasPlantId,
    year,
    start: new Date(Date.UTC(year, 0, 1)).toISOString(),
    model,
    lead: "d2",
    latitude,
    longitude,
    series: Object.fromEntries(WIND_NWP_VARIABLES[model].map((v) => [v, Array(n).fill(null)])),
    fetched: {},
  };
}

export function windNwpUrl(latitude: number, longitude: number, startDate: string, endDate: string, model: WindNwpModel): string {
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: WIND_NWP_VARIABLES[model].map((v) => `${v}_previous_day2`).join(","),
    start_date: startDate,
    end_date: endDate,
    timezone: "Europe/Istanbul",
    wind_speed_unit: "ms",
    models: model,
  });
  return `https://previous-runs-api.open-meteo.com/v1/forecast?${q}`;
}

export interface WindNwpResponse {
  hourly: Record<string, Array<number | null> | string[]> & { time: string[] };
}

/** Yanıtı belgeye yazar (null mevcut değeri silmez; tek model istendiği için sütun adında model eki yok) */
export function mergeWindNwp(doc: WindNwpYear, res: WindNwpResponse, months: string[], fetchedAt: string): WindNwpYear {
  const start = Date.parse(doc.start);
  const n = hoursInYear(doc.year);
  for (const v of WIND_NWP_VARIABLES[doc.model]) {
    const values = res.hourly[`${v}_previous_day2`] as Array<number | null> | undefined;
    if (!values) continue;
    const target = (doc.series[v] ??= Array(n).fill(null));
    for (let k = 0; k < res.hourly.time.length; k++) {
      const value = values[k];
      if (value === null || value === undefined) continue;
      const i = (Date.parse(`${res.hourly.time[k]}:00Z`) - start) / HOUR;
      if (i >= 0 && i < n) target[i] = value;
    }
  }
  for (const m of months) doc.fetched[m] = fetchedAt;
  return doc;
}

/** Yanıt hatalıysa üç kez dener (5, 20, 60 sn); 400 yeniden denenmez */
export async function fetchWindNwp(latitude: number, longitude: number, startDate: string, endDate: string, model: WindNwpModel): Promise<WindNwpResponse> {
  const url = windNwpUrl(latitude, longitude, startDate, endDate, model);
  let last = "";
  for (const wait of [0, 5_000, 20_000, 60_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch(url, { headers: { "User-Agent": "TR-Energy-Analyst/1.0 (non-commercial research)" } });
      const body = await res.json();
      if (res.ok && body?.hourly?.time) return body as WindNwpResponse;
      last = `${res.status} ${body?.reason ?? ""}`;
      if (res.status === 400) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Open-Meteo rüzgâr ek model: ${last}`);
}

const at = (doc: WindNwpYear, v: string, stamp: number): number | null => doc.series[v]?.[Math.round((stamp - Date.parse(doc.start)) / HOUR)] ?? null;

/** Damga anında 100 m hız ve yön; hesaplanamazsa null */
export function hubWindAt(doc: WindNwpYear, stamp: number): { ws: number | null; dir: number | null } {
  const dir = at(doc, "wind_direction_80m", stamp);
  const w80 = at(doc, "wind_speed_80m", stamp);
  if (doc.model === "icon_eu") {
    const w120 = at(doc, "wind_speed_120m", stamp);
    if (w80 === null || w120 === null || dir === null) return { ws: null, dir: null };
    const a = shearExponent(w80, 80, w120, 120);
    // Zayıf rüzgârda üs anlamsız: doğrusal ara değer
    return { ws: a === null ? w80 + ((w120 - w80) * (HUB_M - 80)) / 40 : extrapolateSpeed(w80, 80, HUB_M, a), dir };
  }
  const w100 = at(doc, "wind_speed_100m", stamp);
  if (dir === null) return { ws: null, dir: null };
  if (w100 !== null) return { ws: w100, dir };
  if (w80 === null) return { ws: null, dir: null };
  const a = shearExponent(at(doc, "wind_speed_10m", stamp), 10, w80, 80);
  return { ws: a === null ? w80 : extrapolateSpeed(w80, 80, HUB_M, a), dir };
}

/** Üretim saati [t, t+1) için 100 m rüzgâr (damga t ve t+1 ortalaması; belge yılı dışındaki damga için `next` belgesi) */
export function hubWind(doc: WindNwpYear, t: number, next?: WindNwpYear | null): { ws: number | null; dir: number | null } {
  const a = hubWindAt(doc, t);
  const nextStamp = t + HOUR;
  const b = nextStamp >= Date.parse(doc.start) + hoursInYear(doc.year) * HOUR ? (next ? hubWindAt(next, nextStamp) : { ws: null, dir: null }) : hubWindAt(doc, nextStamp);
  return hourMeanWind(a.ws, b.ws, a.dir, b.dir);
}
