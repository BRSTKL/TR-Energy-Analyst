/**
 * TR-Energy Analyst - Sektör karnesi verisi (diskten)
 *
 * Sektör karnesi scripts/sector-collect.mts ile toplanır ve .cache/epias/sector-<yıl>.json'a yazılır; bu modül onu
 * okur ve santralleri şirket dizinindeki (plant-owners-<yıl>.json) şirket kimliğiyle zenginleştirir. Santrallerin
 * saatlik serisi .cache/epias/sector-<yıl>-hourly/<kimlik>.json.gz dosyalarındadır. EPİAŞ'a bağlanmaz.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { percentileRank, type SectorBenchmark, type SectorPlantMetrics } from "@/lib/sector/benchmark";
import type { SectorHourlySeries } from "@/lib/sector/hourly-store";

const cacheDir = () => path.join(process.cwd(), ".cache", "epias");

export type SectorPlant = SectorPlantMetrics & {
  organizationId: number | null;
  /** MWh başına dengesizliğin aynı teknolojideki yüzdelik sırası (düşük = daha iyi) */
  rankPct: number;
};

/** Sektör karnesi toplanmış yıllar (yeniden eskiye) */
export async function availableSectorYears(): Promise<number[]> {
  try {
    const files = await fs.readdir(cacheDir());
    return files
      .map((f) => /^sector-(\d{4})\.json$/.exec(f)?.[1])
      .filter((y): y is string => !!y)
      .map(Number)
      .sort((a, b) => b - a);
  } catch {
    return [];
  }
}

/** Yılın sektör karnesi; toplanmamışsa null */
export async function loadSectorBenchmark(year: number): Promise<SectorBenchmark | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(cacheDir(), `sector-${year}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** Santraller şirket kimliği ve sektördeki sırasıyla */
export async function loadSectorPlants(bench: SectorBenchmark): Promise<SectorPlant[]> {
  const owners = new Map<number, number>();
  try {
    const saved: { entries: Array<[number, { organizationId: number }]> } = JSON.parse(
      await fs.readFile(path.join(cacheDir(), `plant-owners-${bench.year}.json`), "utf8")
    );
    for (const [plantId, o] of saved.entries) owners.set(plantId, o.organizationId);
  } catch {
    // dizin yoksa şirketler adla gruplanır
  }
  const values: Record<string, number[]> = {};
  for (const p of bench.plants) (values[p.type] ??= []).push(p.unitImbalanceTl);
  return bench.plants.map((p) => ({
    ...p,
    organizationId: owners.get(p.epiasPlantId) ?? null,
    rankPct: percentileRank(values[p.type], p.unitImbalanceTl),
  }));
}

const hourlyDir = (year: number) => path.join(cacheDir(), `sector-${year}-hourly`);

/** Santralin saatlik serisini sıkıştırıp yazar */
export async function saveSectorHourly(year: number, series: SectorHourlySeries): Promise<void> {
  await fs.mkdir(hourlyDir(year), { recursive: true });
  await fs.writeFile(path.join(hourlyDir(year), `${series.epiasPlantId}.json.gz`), gzipSync(JSON.stringify(series)));
}

/** Santralin saatlik serisi; toplanmamışsa null */
export async function loadSectorHourly(year: number, epiasPlantId: number): Promise<SectorHourlySeries | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(path.join(hourlyDir(year), `${epiasPlantId}.json.gz`))).toString("utf8"));
  } catch {
    return null;
  }
}

/** Saatlik serisi toplanmış santral kimlikleri */
export async function listSectorHourlyIds(year: number): Promise<number[]> {
  try {
    return (await fs.readdir(hourlyDir(year)))
      .map((f) => /^(\d+)\.json\.gz$/.exec(f)?.[1])
      .filter((id): id is string => !!id)
      .map(Number);
  } catch {
    return [];
  }
}
