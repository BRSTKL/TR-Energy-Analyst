/**
 * TR-Energy Analyst - Hava verisi havuzu: dosya okuma/yazma (PLAN 15.2)
 *
 * `data/pool/weather/<epiasPlantId>/<yıl>.json.gz` (git dışı; EPİAŞ havuzunun yanında, aynı yazma deseni: önce geçici
 * dosya, sonra yeniden adlandırma). Biçim weather-codec.ts'te.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { poolDir } from "@/lib/pool/pool-store";
import type { WeatherYear } from "./weather-codec";
import type { SatelliteYear } from "./satellite";

export const weatherDir = (): string => path.join(poolDir(), "weather");
const yearFile = (epiasPlantId: number, year: number) => path.join(weatherDir(), String(epiasPlantId), `${year}.json.gz`);

export async function readWeatherYear(epiasPlantId: number, year: number): Promise<WeatherYear | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(yearFile(epiasPlantId, year))).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeWeatherYear(doc: WeatherYear): Promise<void> {
  const file = yearFile(doc.epiasPlantId, doc.year);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, file);
}

const satFile = (epiasPlantId: number, year: number) => path.join(weatherDir(), String(epiasPlantId), `sat-${year}.json.gz`);

/** Uydu ışınımı (satellite.ts): aynı klasörde `sat-<yıl>.json.gz` */
export async function readSatelliteYear(epiasPlantId: number, year: number): Promise<SatelliteYear | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(satFile(epiasPlantId, year))).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeSatelliteYear(doc: SatelliteYear): Promise<void> {
  const file = satFile(doc.epiasPlantId, doc.year);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, file);
}
