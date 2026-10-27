/**
 * TR-Energy Analyst - PTF motoru: ülke güneşi bölge hava verisini okur (hesap lib/ptf/solar.ts)
 *
 * data/pool/ptf/solar-regions.json (bölge noktaları ve ağırlıkları) ve data/pool/ptf/solar-weather/<nokta>/<yıl>.json.gz
 * (ECMWF "2 gün önceki" küresel ışınım; scripts/ptf/solar-regions.mts). Dosya yoksa boş liste: motor vekile düşer.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { RegionDayWeather } from "@/lib/ptf/solar";
import type { SolarRegion } from "@/lib/ptf/solar-regions";
import { poolDir } from "@/lib/pool/pool-store";
import {
  emptyWeatherYear,
  mergeWeather,
  type WeatherYear,
} from "@/lib/weather/weather-codec";
import { fetchPreviousRuns } from "@/lib/weather/open-meteo";

const HOUR = 3_600_000;

export async function loadRegionWeather(
  fromYear: number,
  toYear: number
): Promise<RegionDayWeather[]> {
  const dir = path.join(poolDir(), "ptf");
  let regions: SolarRegion[];
  try {
    regions = (
      JSON.parse(await fs.readFile(path.join(dir, "solar-regions.json"), "utf8")) as {
        regions: SolarRegion[];
      }
    ).regions;
  } catch {
    return [];
  }
  const out: RegionDayWeather[] = [];
  for (const r of regions) {
    const ghi = new Map<string, Array<number | null>>();
    for (let y = fromYear; y <= toYear; y++) {
      let doc: WeatherYear;
      try {
        doc = JSON.parse(
          gunzipSync(
            await fs.readFile(path.join(dir, "solar-weather", r.id, `${y}.json.gz`))
          ).toString("utf8")
        );
      } catch {
        continue;
      }
      const series = doc.series.d2.shortwave_radiation;
      const start = Date.parse(doc.start);
      for (let i = 0; i + 24 <= series.length; i += 24) {
        const day = new Date(start + i * HOUR).toISOString().slice(0, 10);
        const v = series.slice(i, i + 24);
        if (v.some((x) => x !== null)) ghi.set(day, v);
      }
    }
    out.push({ weight: r.weight, ghi });
  }
  return out;
}

/**
 * Canlı: bölge noktaları için `from`–`to` aralığının d2 ışınımı Open-Meteo'dan (yarın dahil; "2 gün önceki" sürüm yarının
 * saatleri için de kesimden önce yayımlıdır). Arşiv yazılmaz; yalnız bellekte. Bölge başına bir istek.
 */
export async function liveRegionWeather(
  from: string,
  to: string
): Promise<RegionDayWeather[]> {
  const dir = path.join(poolDir(), "ptf");
  let regions: SolarRegion[];
  try {
    regions = (
      JSON.parse(await fs.readFile(path.join(dir, "solar-regions.json"), "utf8")) as {
        regions: SolarRegion[];
      }
    ).regions;
  } catch {
    return [];
  }
  const out: RegionDayWeather[] = [];
  // Işınım bir saat geri kaydığından son günün son saati için ertesi günün ilk damgası da istenir
  const end = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  for (const r of regions) {
    const res = await fetchPreviousRuns(r.lat, r.lon, from, end);
    const ghi = new Map<string, Array<number | null>>();
    for (let y = Number(from.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
      const doc = mergeWeather(
        emptyWeatherYear(0, y, r.lat, r.lon),
        res,
        [],
        new Date().toISOString()
      );
      const series = doc.series.d2.shortwave_radiation;
      const start = Date.parse(doc.start);
      for (let i = 0; i + 24 <= series.length; i += 24) {
        const day = new Date(start + i * HOUR).toISOString().slice(0, 10);
        if (day < from || day > to) continue;
        const v = series.slice(i, i + 24);
        if (v.every((x) => x !== null)) ghi.set(day, v);
      }
    }
    out.push({ weight: r.weight, ghi });
  }
  return out;
}
