/**
 * TR-Energy Analyst - Geçmiş rüzgâr TAHMİNLERİ (rüzgâr üretim tahmini geriye dönük testi; kullanıcı 18.10.2026)
 *
 * Kaynak: Open-Meteo Previous Runs API, ECMWF IFS 0,25° (`ecmwf_ifs025`; canlı tahmin sayfasıyla aynı model), 100 m rüzgâr
 * hızı ve yönü, iki sürüm: `d2` (geçerlilik saatinden 2 gün önceki çalışma; GÖP kesiminden önce elde → temiz, ana sonuç)
 * ve `d1` (1 gün önceki; çoğu saatte kesimden sonra → sızıntılı, yalnız iyimser üst sınır). Bilgi zamanı kuralı
 * lib/forecast/info-time.ts (güneşle aynı; 15.10.2026 teyidi). Değerler anlık; üretim saati [i, i+1) için i ve i+1
 * damgalarının ortalaması (`hourMeanWind`). Arşiv 2024-03'ten. Saf biçim + istemci; dosya işleri weather-store.ts.
 * Rüzgâr motoru alanları (Aşama 23.2–23.3; isteğe bağlı, eski dosyalarda yok): aynı sürümlerin 2 m sıcaklığı, deniz
 * seviyesi ve yüzey basıncı (hava yoğunluğu) ve 10 m hızı (kesme üssü), ayrıca Open-Meteo'nun nokta rakımı. Yüzey
 * basıncı Open-Meteo'da saklanmıyor, sorguda türetiliyor olabilir (PLAN 23.0): boşsa deniz seviyesi basıncı ve rakım.
 * Bu alanları taşımayan yıl dosyası `hasEngineFields` false döner; senkron onu bir kez baştan çeker.
 * Atıf: "Weather data by Open-Meteo.com" (CC BY 4.0), ECMWF.
 */

const HOUR = 3_600_000;
export const WIND_FC_MODEL = "ecmwf_ifs025";
export const WIND_FC_LEADS = ["d1", "d2"] as const;
export type WindFcLead = (typeof WIND_FC_LEADS)[number];
const SUFFIX: Record<WindFcLead, string> = { d1: "_previous_day1", d2: "_previous_day2" };

export interface WindForecastYear {
  epiasPlantId: number;
  year: number;
  start: string;
  model: string;
  latitude: number;
  longitude: number;
  gridLatitude: number | null;
  gridLongitude: number | null;
  /** Sürüm → damga i'deki anlık 100 m hız (m/s) ve yön (derece) */
  ws: Record<WindFcLead, Array<number | null>>;
  dir: Record<WindFcLead, Array<number | null>>;
  fetched: Record<string, string>;
  /** Rüzgâr motoru alanları (isteğe bağlı): sürüm → damga i'deki 2 m sıcaklık (°C), basınç (hPa), 10 m hız (m/s) */
  temp?: Record<WindFcLead, Array<number | null>>;
  msl?: Record<WindFcLead, Array<number | null>>;
  sp?: Record<WindFcLead, Array<number | null>>;
  ws10?: Record<WindFcLead, Array<number | null>>;
  /** Open-Meteo'nun noktaya uyguladığı rakım (m) */
  elevation?: number | null;
}

/** Rüzgâr motoru alanları bu dosyada var mı */
export const hasEngineFields = (doc: WindForecastYear) => !!doc.temp && !!doc.msl && !!doc.ws10;

const ENGINE_FIELDS = [
  ["temp", "temperature_2m"],
  ["msl", "pressure_msl"],
  ["sp", "surface_pressure"],
  ["ws10", "wind_speed_10m"],
] as const;

export function emptyWindForecastYear(epiasPlantId: number, year: number, latitude: number, longitude: number): WindForecastYear {
  const n = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / HOUR;
  const arr = () => Array(n).fill(null);
  return { epiasPlantId, year, start: new Date(Date.UTC(year, 0, 1)).toISOString(), model: WIND_FC_MODEL, latitude, longitude, gridLatitude: null, gridLongitude: null, ws: { d1: arr(), d2: arr() }, dir: { d1: arr(), d2: arr() }, fetched: {} };
}

export const windForecastVariables = (engine = true): string[] =>
  WIND_FC_LEADS.flatMap((l) => [`wind_speed_100m${SUFFIX[l]}`, `wind_direction_100m${SUFFIX[l]}`, ...(engine ? ENGINE_FIELDS.map(([, v]) => `${v}${SUFFIX[l]}`) : [])]);

export interface WindForecastResponse {
  latitude: number;
  longitude: number;
  elevation?: number;
  hourly: Record<string, Array<number | null> | string[]> & { time: string[] };
}

export function mergeWindForecast(doc: WindForecastYear, res: WindForecastResponse, months: string[], fetchedAt: string): WindForecastYear {
  const start = Date.parse(doc.start);
  const n = doc.ws.d2.length;
  const h = res.hourly;
  for (const [f] of ENGINE_FIELDS) if (!doc[f]) doc[f] = { d1: Array(n).fill(null), d2: Array(n).fill(null) };
  if (typeof res.elevation === "number") doc.elevation = res.elevation;
  for (let k = 0; k < h.time.length; k++) {
    const i = (Date.parse(`${h.time[k]}:00Z`) - start) / HOUR;
    if (i < 0 || i >= n) continue;
    for (const l of WIND_FC_LEADS) {
      const w = (h[`wind_speed_100m${SUFFIX[l]}`] as Array<number | null> | undefined)?.[k] ?? null;
      const d = (h[`wind_direction_100m${SUFFIX[l]}`] as Array<number | null> | undefined)?.[k] ?? null;
      if (w !== null) doc.ws[l][i] = w;
      if (d !== null) doc.dir[l][i] = d;
      for (const [f, v] of ENGINE_FIELDS) {
        const x = (h[`${v}${SUFFIX[l]}`] as Array<number | null> | undefined)?.[k] ?? null;
        if (x !== null) doc[f]![l][i] = x;
      }
    }
  }
  doc.gridLatitude = res.latitude;
  doc.gridLongitude = res.longitude;
  for (const m of months) doc.fetched[m] = fetchedAt;
  return doc;
}

export class WindForecastLimitError extends Error {}

/** `engine`: rüzgâr motoru alanlarıyla; Open-Meteo bunlardan birini reddederse (400) yalnız 100 m hız / yönle yeniden
 * denenir: rüzgâr çekimi yeni alanlar yüzünden durmasın (alanlar boş kalır, yoğunluk ρ₀ varsayılır) */
export async function fetchWindForecastArchive(latitude: number, longitude: number, startDate: string, endDate: string, engine = true): Promise<WindForecastResponse> {
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: windForecastVariables(engine).join(","),
    models: WIND_FC_MODEL,
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
      const res = await fetch(`https://previous-runs-api.open-meteo.com/v1/forecast?${q}`, { headers: { "User-Agent": "TR-Energy-Analyst/1.0 (non-commercial research)" } });
      const body = await res.json();
      if (res.ok && body?.hourly?.time) return body as WindForecastResponse;
      last = `${res.status} ${body?.reason ?? ""}`;
      if (res.status === 429 && /minutely/i.test(String(body?.reason ?? "")) && minutely++ < 10) {
        await new Promise((r) => setTimeout(r, 65_000));
        attempt--;
        continue;
      }
      if (res.status === 429) throw new WindForecastLimitError(last);
      if (res.status === 400) {
        if (engine) {
          console.warn(`Open-Meteo rüzgâr motoru alanlarını reddetti (${last}); yalnız 100 m rüzgârla yeniden deneniyor.`);
          return fetchWindForecastArchive(latitude, longitude, startDate, endDate, false);
        }
        break;
      }
    } catch (e) {
      if (e instanceof WindForecastLimitError) throw e;
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Open-Meteo geçmiş rüzgâr tahmini: ${last}`);
}
