/**
 * TR-Energy Analyst - Uydu ışınımı (gerçekleşen; PLAN 15.5 kısıntı tespiti)
 *
 * Kaynak: Open-Meteo Satellite Radiation API, EUMETSAT CM SAF SARAH3 (`eumetsat_sarah3`; 1983'ten, ≈ 2 gün gecikme;
 * Türkiye kapsamda, 30 dk'dan saatliğe). GERÇEKLEŞEN ışınımdır: tahmin girdisi OLAMAZ, yalnız etiket (kısıntı / arıza
 * tespiti, eğitim temizliği, değerlendirme maskesi) olarak kullanılır. Hizalama hava verisiyle aynı: değer damgadan
 * önceki saatin ortalaması, üretim saati i ← damga i+1 (weather-codec.ts). Saf biçim + istemci; dosya işleri
 * weather-store.ts.
 */

const HOUR = 3_600_000;
export const SATELLITE_MODEL = "eumetsat_sarah3";
/** Arşivin yayım gecikmesi (gün): etiket ancak bu kadar sonra elde */
export const SATELLITE_DELAY_DAYS = 2;

export interface SatelliteYear {
  epiasPlantId: number;
  year: number;
  /** İlk saat (duvar saati UTC alanında, ISO) */
  start: string;
  model: string;
  latitude: number;
  longitude: number;
  ghi: Array<number | null>;
  direct: Array<number | null>;
  diffuse: Array<number | null>;
  /** Ay ("01".."12") → çekilme anı */
  fetched: Record<string, string>;
}

export function emptySatelliteYear(epiasPlantId: number, year: number, latitude: number, longitude: number): SatelliteYear {
  const n = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / HOUR;
  return { epiasPlantId, year, start: new Date(Date.UTC(year, 0, 1)).toISOString(), model: SATELLITE_MODEL, latitude, longitude, ghi: Array(n).fill(null), direct: Array(n).fill(null), diffuse: Array(n).fill(null), fetched: {} };
}

/** Yanıtı belgeye yazar: damga bir saat geri (önceki saatin ortalaması → üretim saati) */
export function mergeSatellite(doc: SatelliteYear, res: { hourly: { time: string[]; shortwave_radiation: Array<number | null>; direct_radiation: Array<number | null>; diffuse_radiation: Array<number | null> } }, months: string[], fetchedAt: string): SatelliteYear {
  const start = Date.parse(doc.start);
  const n = doc.ghi.length;
  const h = res.hourly;
  for (let k = 0; k < h.time.length; k++) {
    const i = (Date.parse(`${h.time[k]}:00Z`) - start) / HOUR - 1;
    if (i < 0 || i >= n) continue;
    if (h.shortwave_radiation[k] !== null) doc.ghi[i] = h.shortwave_radiation[k];
    if (h.direct_radiation[k] !== null) doc.direct[i] = h.direct_radiation[k];
    if (h.diffuse_radiation[k] !== null) doc.diffuse[i] = h.diffuse_radiation[k];
  }
  for (const m of months) doc.fetched[m] = fetchedAt;
  return doc;
}

export async function fetchSatellite(latitude: number, longitude: number, startDate: string, endDate: string) {
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: "shortwave_radiation,direct_radiation,diffuse_radiation",
    models: SATELLITE_MODEL,
    start_date: startDate,
    end_date: endDate,
    timezone: "Europe/Istanbul",
  });
  let last = "";
  for (const wait of [0, 5_000, 20_000, 60_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch(`https://satellite-api.open-meteo.com/v1/archive?${q}`, { cache: "no-store", headers: { "User-Agent": "TR-Energy-Analyst/1.0 (non-commercial research)" } });
      const body = await res.json();
      if (res.ok && body?.hourly?.time) return body;
      last = `${res.status} ${body?.reason ?? ""}`;
      if (res.status === 400) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Open-Meteo uydu: ${last}`);
}
