/**
 * TR-Energy Analyst - Ek hava modelleri: geçmiş tahmin arşivi (Aşama 22.3)
 *
 * Kaynak Open-Meteo Previous Runs API, yalnız `_previous_day2` (2 gün önceki tahmin; bilgi anı kuralı weather-codec.ts
 * ile aynı: geçerlilik saati H için 48 saat önceki, H'yi çalışma aralığına aşağı yuvarlayan çalışma; en geç çalışma
 * D-2 18Z / 21Z, yayımı en geç D-1 ≈ 01:00 UTC, GÖP kesimi D-1 09:30 UTC'den önce → temiz). Bilgi zamanı denetimi model
 * başına (lib/forecast/info-time.ts `WEATHER_RUN_RULES`: ICON-EU 3 saatlik çalışma, kötümser 6 saat yayım; GFS 6 saatlik,
 * 9 saat; ölçülen ICON-EU ≈ 3, GFS ≈ 6–7 saat).
 * Kaynak doğrulaması
 * veri-kaynagi-arastirmaci 19.10.2026, yerinde sınama Konya:
 *   - `icon_eu`: DWD ICON-EU 7 km, Türkiye içinde (29,5–70,5°K, −23,5–62,5°D); 3 saatte bir çalışma, 78 saate kadar
 *     saatlik; doğrudan ve dağınık ışınım modelden. Lisans DWD, CC-BY 4.0.
 *   - `gfs_global`: NOAA GFS 0,11–0,25°; 6 saatte bir, 120 saate kadar saatlik; GHI ve dağınık modelden. Kamu verisi.
 * Elenenler: ARPEGE World (d2 ışınımı fiziksel olarak imkânsız), ARPEGE Europe (42°D doğusu dışarıda), UKMO (d2 yok),
 * AIFS ve GEM (6 / 3 saatlik, yalnız GHI).
 * Hizalama weather-codec.ts ile aynı: ışınım damgadan önceki saatin ortalaması (bir saat geri), anlık değişkenler saat başı.
 * Ücretsiz katman yalnız ticari olmayan kullanım, atıf "Weather data by Open-Meteo.com". SAF (fetch dışında I/O yok).
 */

export const NWP_MODELS = ["icon_eu", "gfs_global"] as const;
export type NwpModel = (typeof NWP_MODELS)[number];
export const NWP_MODEL_LABEL: Record<NwpModel, string> = { icon_eu: "DWD ICON-EU (7 km)", gfs_global: "NOAA GFS" };

/** Open-Meteo değişkeni → belgedeki alan; ışınım saat ortalaması, sıcaklık ve bulut anlık */
const VARS = {
  shortwave_radiation: { key: "ghi", mean: true },
  direct_radiation: { key: "direct", mean: true },
  diffuse_radiation: { key: "diffuse", mean: true },
  temperature_2m: { key: "temp", mean: false },
  cloud_cover: { key: "cloud", mean: false },
} as const;
export type NwpVariable = (typeof VARS)[keyof typeof VARS]["key"];
export const NWP_VARIABLES: NwpVariable[] = Object.values(VARS).map((v) => v.key);

export interface NwpYear {
  epiasPlantId: number;
  year: number;
  /** Yılın 1 Ocak 00:00'ı (duvar saati UTC alanında, ISO) */
  start: string;
  model: NwpModel;
  lead: "d2";
  latitude: number;
  longitude: number;
  /** Değişken → üretim saatine hizalı dizi (yok: null) */
  series: Record<NwpVariable, Array<number | null>>;
  /** Ay ("01".."12") → çekilme anı (ISO) */
  fetched: Record<string, string>;
}

const HOUR = 3_600_000;
const hoursInYear = (year: number) => (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / HOUR;
const wallMs = (t: string) => Date.parse(`${t}:00Z`);

export function emptyNwpYear(epiasPlantId: number, year: number, model: NwpModel, latitude: number, longitude: number): NwpYear {
  const n = hoursInYear(year);
  return {
    epiasPlantId,
    year,
    start: new Date(Date.UTC(year, 0, 1)).toISOString(),
    model,
    lead: "d2",
    latitude,
    longitude,
    series: Object.fromEntries(NWP_VARIABLES.map((k) => [k, Array(n).fill(null)])) as NwpYear["series"],
    fetched: {},
  };
}

export function nwpUrl(latitude: number, longitude: number, startDate: string, endDate: string, models: readonly NwpModel[]): string {
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: Object.keys(VARS).map((v) => `${v}_previous_day2`).join(","),
    start_date: startDate,
    end_date: endDate,
    timezone: "Europe/Istanbul",
    models: models.join(","),
  });
  return `https://previous-runs-api.open-meteo.com/v1/forecast?${q}`;
}

export interface NwpResponse {
  hourly: Record<string, Array<number | null> | string[]> & { time: string[] };
}

/** Yanıtın bir modele düşen kısmını belgeye yazar (null mevcut değeri silmez). Birden çok model istenince Open-Meteo
 * sütun adına `_<model>` ekler; tek modelde eklemez */
export function mergeNwp(doc: NwpYear, res: NwpResponse, multi: boolean, months: string[], fetchedAt: string): NwpYear {
  const start = Date.parse(doc.start);
  const n = hoursInYear(doc.year);
  const time = res.hourly.time;
  for (const [v, spec] of Object.entries(VARS)) {
    const values = res.hourly[`${v}_previous_day2${multi ? `_${doc.model}` : ""}`] as Array<number | null> | undefined;
    if (!values) continue;
    const target = doc.series[spec.key];
    const shift = spec.mean ? 1 : 0;
    for (let k = 0; k < time.length; k++) {
      const value = values[k];
      if (value === null || value === undefined) continue;
      const i = (wallMs(time[k]) - start) / HOUR - shift;
      if (i >= 0 && i < n) target[i] = value;
    }
  }
  for (const m of months) doc.fetched[m] = fetchedAt;
  return doc;
}

/** Yanıt hatalıysa üç kez dener (5, 20, 60 sn); 400 yeniden denenmez */
export async function fetchNwp(latitude: number, longitude: number, startDate: string, endDate: string, models: readonly NwpModel[]): Promise<NwpResponse> {
  const url = nwpUrl(latitude, longitude, startDate, endDate, models);
  let last = "";
  for (const wait of [0, 5_000, 20_000, 60_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch(url, { headers: { "User-Agent": "TR-Energy-Analyst/1.0 (non-commercial research)" } });
      const body = await res.json();
      if (res.ok && body?.hourly?.time) return body as NwpResponse;
      last = `${res.status} ${body?.reason ?? ""}`;
      if (res.status === 400) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Open-Meteo: ${last}`);
}

/** Üretim saati için değer; yoksa null */
export function nwpAt(doc: NwpYear, v: NwpVariable, t: number): number | null {
  return doc.series[v][Math.round((t - Date.parse(doc.start)) / HOUR)] ?? null;
}
