/**
 * TR-Energy Analyst - Santral konumunda kar derinliği (güneş kayıp üretiminde "kar olası" ayrımı; 20.10.2026)
 *
 * Kaynak: Open-Meteo Historical Weather API (archive-api.open-meteo.com), ERA5 saatlik `snow_depth` (yerdeki kar, m; 0,25°
 * ızgara). Rüzgârda kullanılan kaynakla aynı (lib/weather/reanalysis-wind.ts). Gecikme ≈ 5–6 gün.
 * Uydu yöntemi (lib/forecast/curtailment.ts) güneş varken üretmeyen saati kayıp sayar; panel karla örtülüyse de öyle. Yerde en
 * az SNOW_DEPTH_MIN kar olan saatlerdeki plansız kayıp "kar olası" diye ayrılır: kısıntı değil, gerçek üretim eksiği. Izgara
 * kaba (dağ ile ova aynı hücrede olabilir) ve panel yerden hızlı temizlenir: ayrım bir işarettir, ölçüm değil.
 *
 * Dosya: `<havuz>/weather/<santral>/snow-<yıl>.json.gz`. Zaman damgaları duvar saati (Türkiye; UTC alanlarında).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { weatherDir } from "./weather-store";

export const SNOW_DEPTH_MIN = 0.01;
const HOUR = 3_600_000;

export interface SnowYear {
  epiasPlantId: number;
  year: number;
  latitude: number;
  longitude: number;
  /** Yılın ilk saati (duvar saati UTC alanında, ISO) */
  start: string;
  /** Saat sırasıyla yerdeki kar, m; verisi olmayan saat null */
  depth: Array<number | null>;
  fetchedAt: string;
}

const file = (id: number, year: number) => path.join(weatherDir(), String(id), `snow-${year}.json.gz`);

export async function readSnowYear(id: number, year: number): Promise<SnowYear | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(file(id, year))).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeSnowYear(doc: SnowYear): Promise<void> {
  const f = file(doc.epiasPlantId, doc.year);
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, f);
}

/** Open-Meteo cevabı (hourly.time Türkiye saati "YYYY-AA-GGTSS:00") → yıl belgeleri */
export function snowYearsFromResponse(
  id: number,
  latitude: number,
  longitude: number,
  res: { hourly: { time: string[]; snow_depth: Array<number | null> } },
  fetchedAt: string
): SnowYear[] {
  const docs = new Map<number, SnowYear>();
  res.hourly.time.forEach((time, k) => {
    const t = Date.parse(`${time}:00Z`);
    if (!Number.isFinite(t)) return;
    const y = new Date(t).getUTCFullYear();
    let d = docs.get(y);
    if (!d) {
      const n = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / HOUR;
      d = { epiasPlantId: id, year: y, latitude, longitude, start: new Date(Date.UTC(y, 0, 1)).toISOString(), depth: Array(n).fill(null), fetchedAt };
      docs.set(y, d);
    }
    const v = res.hourly.snow_depth[k];
    d.depth[(t - Date.UTC(y, 0, 1)) / HOUR] = typeof v === "number" && Number.isFinite(v) ? v : null;
  });
  return Array.from(docs.values());
}

/** Kar olası saatler (duvar saati ms): yerde en az SNOW_DEPTH_MIN kar */
export function snowHours(docs: Array<SnowYear | null>): Set<number> {
  const out = new Set<number>();
  for (const d of docs) {
    if (!d) continue;
    const t0 = Date.parse(d.start);
    d.depth.forEach((v, i) => {
      if (v !== null && v >= SNOW_DEPTH_MIN) out.add(t0 + i * HOUR);
    });
  }
  return out;
}

export async function fetchSnow(latitude: number, longitude: number, startDate: string, endDate: string): Promise<{ hourly: { time: string[]; snow_depth: Array<number | null> } }> {
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: "snow_depth",
    models: "era5",
    start_date: startDate,
    end_date: endDate,
    timezone: "Europe/Istanbul",
  });
  let last = "";
  for (const wait of [0, 5_000, 20_000, 65_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${q}`, { headers: { "User-Agent": "TR-Energy-Analyst/1.0 (non-commercial research)" } });
      const body = await res.json();
      if (res.ok && body?.hourly?.time) return body;
      last = `${res.status} ${body?.reason ?? ""}`;
      if (res.status === 400) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Open-Meteo kar derinliği: ${last}`);
}
