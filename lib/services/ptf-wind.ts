/**
 * TR-Energy Analyst - PTF motoru: ülke rüzgârı bölge hava verisini okur (hesap lib/ptf/wind.ts)
 *
 * data/pool/ptf/wind-regions.json ve data/pool/ptf/wind-weather/<nokta>/<yıl>.json.gz (ECMWF 100 m, d2;
 * scripts/ptf/wind-regions.mts). Canlı: hedef gün ve ölçek günleri Open-Meteo'dan anlık. Dosya yoksa boş liste.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { hourMeanWind } from "@/lib/forecast/wind-loss";
import type { RegionWind } from "@/lib/ptf/wind";
import type { SolarRegion } from "@/lib/ptf/solar-regions";
import { poolDir } from "@/lib/pool/pool-store";
import {
  emptyWindForecastYear,
  fetchWindForecastArchive,
  mergeWindForecast,
  type WindForecastYear,
} from "@/lib/weather/wind-forecast-archive";

const HOUR = 3_600_000;

async function readRegions(): Promise<SolarRegion[]> {
  try {
    return (
      JSON.parse(
        await fs.readFile(path.join(poolDir(), "ptf", "wind-regions.json"), "utf8")
      ) as { regions: SolarRegion[] }
    ).regions;
  } catch {
    return [];
  }
}

/** Belgenin d2 serisinden üretim saati ortalamaları (gün → 24) */
function daysOf(
  doc: WindForecastYear,
  into: Map<string, Array<number | null>>,
  from?: string,
  to?: string
) {
  const start = Date.parse(doc.start);
  const ws = doc.ws.d2;
  const dir = doc.dir.d2;
  for (let i = 0; i + 24 <= ws.length; i += 24) {
    const day = new Date(start + i * HOUR).toISOString().slice(0, 10);
    if ((from && day < from) || (to && day > to)) continue;
    const v = Array.from(
      { length: 24 },
      (_, h) =>
        hourMeanWind(
          ws[i + h] ?? null,
          ws[i + h + 1] ?? null,
          dir[i + h] ?? null,
          dir[i + h + 1] ?? null
        ).ws
    );
    if (v.some((x) => x !== null)) into.set(day, v);
  }
}

export async function loadRegionWind(
  fromYear: number,
  toYear: number
): Promise<RegionWind[]> {
  const regions = await readRegions();
  const out: RegionWind[] = [];
  for (const r of regions) {
    const ws = new Map<string, Array<number | null>>();
    for (let y = fromYear; y <= toYear; y++) {
      try {
        daysOf(
          JSON.parse(
            gunzipSync(
              await fs.readFile(
                path.join(poolDir(), "ptf", "wind-weather", r.id, `${y}.json.gz`)
              )
            ).toString("utf8")
          ),
          ws
        );
      } catch {
        /* yıl yok */
      }
    }
    out.push({ weight: r.weight, ws });
  }
  return out;
}

/** Canlı: `from`–`to` (yarın dahil) d2 100 m rüzgâr; arşiv yazılmaz */
export async function liveRegionWind(from: string, to: string): Promise<RegionWind[]> {
  const regions = await readRegions();
  const end = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const out: RegionWind[] = [];
  for (const r of regions) {
    const res = await fetchWindForecastArchive(r.lat, r.lon, from, end, false);
    const ws = new Map<string, Array<number | null>>();
    for (let y = Number(from.slice(0, 4)); y <= Number(end.slice(0, 4)); y++)
      daysOf(
        mergeWindForecast(
          emptyWindForecastYear(0, y, r.lat, r.lon),
          res,
          [],
          new Date().toISOString()
        ),
        ws,
        from,
        to
      );
    out.push({ weight: r.weight, ws });
  }
  return out;
}
