/**
 * TR-Energy Analyst - Gerçekleşen rüzgâr (rüzgâr kayıp tespiti; lib/forecast/wind-loss.ts)
 *
 * Kaynak: Open-Meteo Historical Weather API (archive-api.open-meteo.com), 100 m rüzgâr hızı ve yönü, iki model:
 *   - `era5`: ECMWF ERA5 yeniden analizi, 0,25° (≈ 25 km), ≈ 5 gün gecikme; 100 m u/v ERA5'in kendi alanı.
 *   - `ecmwf_ifs`: ECMWF IFS 9 km; 00 / 12 UTC çalışmalarının 1–12 saatlik adımları uç uca (analiz değil), ≈ 2 gün gecikme.
 * Değerler ANLIKTIR (damga saatindeki değer); üretim saati [i, i+1) için i ve i+1 damgalarının ortalaması alınır
 * (`hourMeanWind`). ERA5-Land rüzgâr vermez (ERA5'ten ara değerleme). Son WIND_FREEZE_DAYS gün sonradan değişebilir: o
 * aylar her eşitlemede yeniden istenir. GERÇEKLEŞEN veridir: tahmin girdisi olamaz, yalnız etiket.
 * Atıf: "Weather data by Open-Meteo.com" (CC BY 4.0); ERA5: Hersbach et al., Copernicus Climate Change Service.
 * Doğrulama: veri-kaynagi-arastirmaci, 17.10.2026. Saf biçim + istemci; dosya işleri weather-store.ts.
 */

const HOUR = 3_600_000;
export const WIND_MODELS = ["era5", "ecmwf_ifs"] as const;
export type WindModel = (typeof WIND_MODELS)[number];
export const WIND_MODEL_LABEL: Record<WindModel, string> = { era5: "ERA5 (0,25°)", ecmwf_ifs: "ECMWF IFS (9 km)" };
/** Bu kadar günden yeni veri kesin sayılmaz (ERA5T / gecikme) */
export const WIND_FREEZE_DAYS = 7;
/** Rüzgâr verisinin başladığı yıl */
export const WIND_FIRST_YEAR = 2025;

export interface WindYear {
  epiasPlantId: number;
  year: number;
  /** İlk damga (duvar saati UTC alanında, ISO) */
  start: string;
  model: WindModel;
  /** İstenen koordinat (santral konumu) ve modelin döndürdüğü ızgara noktası */
  latitude: number;
  longitude: number;
  gridLatitude: number | null;
  gridLongitude: number | null;
  /** Damga i'deki anlık 100 m hız (m/s) ve yön (derece) */
  ws: Array<number | null>;
  dir: Array<number | null>;
  /** Ay ("01".."12") → çekilme anı */
  fetched: Record<string, string>;
}

export function emptyWindYear(epiasPlantId: number, year: number, model: WindModel, latitude: number, longitude: number): WindYear {
  const n = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / HOUR;
  return { epiasPlantId, year, start: new Date(Date.UTC(year, 0, 1)).toISOString(), model, latitude, longitude, gridLatitude: null, gridLongitude: null, ws: Array(n).fill(null), dir: Array(n).fill(null), fetched: {} };
}

export interface WindResponse {
  latitude: number;
  longitude: number;
  hourly: { time: string[]; wind_speed_100m: Array<number | null>; wind_direction_100m: Array<number | null> };
}

/** Yanıtı belgeye yazar (damga aynı saate; ortalama okuma tarafında) */
export function mergeWind(doc: WindYear, res: WindResponse, months: string[], fetchedAt: string): WindYear {
  const start = Date.parse(doc.start);
  const n = doc.ws.length;
  const h = res.hourly;
  for (let k = 0; k < h.time.length; k++) {
    const i = (Date.parse(`${h.time[k]}:00Z`) - start) / HOUR;
    if (i < 0 || i >= n) continue;
    if (h.wind_speed_100m[k] !== null) doc.ws[i] = h.wind_speed_100m[k];
    if (h.wind_direction_100m[k] !== null) doc.dir[i] = h.wind_direction_100m[k];
  }
  doc.gridLatitude = res.latitude;
  doc.gridLongitude = res.longitude;
  for (const m of months) doc.fetched[m] = fetchedAt;
  return doc;
}

/** Ay kesinleşmiş mi: ay sonundan en az WIND_FREEZE_DAYS gün sonra çekilmişse */
export function monthFinal(year: number, month: string, fetchedAt: string | undefined): boolean {
  return !!fetchedAt && Date.parse(fetchedAt) >= Date.UTC(year, Number(month), 1) + WIND_FREEZE_DAYS * 86_400_000;
}

/** Aynı veriyi döndüren istekleri birleştirmek için anahtar: ERA5'te 0,25° ızgara noktası, IFS'te koordinat */
export function windRequestKey(model: WindModel, latitude: number, longitude: number): string {
  return model === "era5" ? `${Math.round(latitude * 4) / 4},${Math.round(longitude * 4) / 4}` : `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

export class OpenMeteoLimitError extends Error {}

export async function fetchWind(model: WindModel, latitude: number, longitude: number, startDate: string, endDate: string): Promise<WindResponse> {
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: "wind_speed_100m,wind_direction_100m",
    models: model,
    start_date: startDate,
    end_date: endDate,
    timezone: "Europe/Istanbul",
    wind_speed_unit: "ms",
  });
  let last = "";
  const waits = [0, 5_000, 20_000, 60_000];
  for (let attempt = 0, minutely = 0; attempt < waits.length; attempt++) {
    if (waits[attempt]) await new Promise((r) => setTimeout(r, waits[attempt]));
    try {
      const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${q}`, { headers: { "User-Agent": "TR-Energy-Analyst/1.0 (non-commercial research)" } });
      const body = await res.json();
      if (res.ok && body?.hourly?.time) return body as WindResponse;
      last = `${res.status} ${body?.reason ?? ""}`;
      // Dakika sınırı (yıllık istek ≈ 26 çağrı sayılır): bir dakika bekleyip yeniden; saatlik / günlük sınırda eşitleme
      // durur ve sonra kaldığı yerden sürer
      if (res.status === 429 && /minutely/i.test(String(body?.reason ?? "")) && minutely++ < 10) {
        await new Promise((r) => setTimeout(r, 65_000));
        attempt--;
        continue;
      }
      if (res.status === 429) throw new OpenMeteoLimitError(last);
      if (res.status === 400) break;
    } catch (e) {
      if (e instanceof OpenMeteoLimitError) throw e;
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Open-Meteo rüzgâr (${model}): ${last}`);
}
