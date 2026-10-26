/**
 * TR-Energy Analyst - Open-Meteo Previous Runs istemcisi (PLAN 15.2)
 *
 * Ücretsiz API: yalnız ticari olmayan kullanım, CC-BY 4.0 atıf ("Weather data by Open-Meteo.com"); sınır günde 10.000,
 * saatte 5.000, dakikada 600 çağrı (10'dan fazla değişken ya da 2 haftadan uzun dönem birden çok çağrı sayılır).
 * Zaman Türkiye duvar saatiyle istenir (Europe/Istanbul, 2016'dan beri sabit UTC+3): havuzla aynı düzen.
 */

import { apiVariableNames, WEATHER_MODEL, type OpenMeteoHourly } from "./weather-codec";

const BASE = "https://previous-runs-api.open-meteo.com/v1/forecast";
/** Çoğu modelde arşivin ilk tam günü (ECMWF IFS 0,25°: previous_day2 2024-03-07 17:00 UTC'den dolu) */
export const WEATHER_ARCHIVE_START = "2024-03-08";

export function previousRunsUrl(latitude: number, longitude: number, startDate: string, endDate: string): string {
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: apiVariableNames().join(","),
    start_date: startDate,
    end_date: endDate,
    timezone: "Europe/Istanbul",
    models: WEATHER_MODEL,
  });
  return `${BASE}?${q}`;
}

/** Yanıt hatalıysa üç kez dener (5, 20, 60 sn bekleyerek); API hata nedenini iletir */
export async function fetchPreviousRuns(latitude: number, longitude: number, startDate: string, endDate: string): Promise<OpenMeteoHourly> {
  const url = previousRunsUrl(latitude, longitude, startDate, endDate);
  let last = "";
  for (const wait of [0, 5_000, 20_000, 60_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "TR-Energy-Analyst/1.0 (non-commercial research)" } });
      const body = await res.json();
      if (res.ok && body?.hourly?.time) return body as OpenMeteoHourly;
      last = `${res.status} ${body?.reason ?? ""}`;
      if (res.status === 400) break; // istek hatası: yeniden denemek işe yaramaz
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Open-Meteo: ${last}`);
}
