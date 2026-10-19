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
import type { WindModel, WindYear } from "./reanalysis-wind";
import type { WindForecastYear } from "./wind-forecast-archive";
import type { NwpModel, NwpYear } from "./nwp-models";

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

const windFile = (epiasPlantId: number, model: WindModel, year: number) => path.join(weatherDir(), String(epiasPlantId), `wind-${model}-${year}.json.gz`);

/** Gerçekleşen rüzgâr (reanalysis-wind.ts): aynı klasörde `wind-<model>-<yıl>.json.gz` */
export async function readWindYear(epiasPlantId: number, model: WindModel, year: number): Promise<WindYear | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(windFile(epiasPlantId, model, year))).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeWindYear(doc: WindYear): Promise<void> {
  const file = windFile(doc.epiasPlantId, doc.model, doc.year);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, file);
}

const windFcFile = (epiasPlantId: number, year: number) => path.join(weatherDir(), String(epiasPlantId), `windfc-${year}.json.gz`);

/** Geçmiş rüzgâr tahminleri (wind-forecast-archive.ts): aynı klasörde `windfc-<yıl>.json.gz` */
export async function readWindForecastYear(epiasPlantId: number, year: number): Promise<WindForecastYear | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(windFcFile(epiasPlantId, year))).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeWindForecastYear(doc: WindForecastYear): Promise<void> {
  const file = windFcFile(doc.epiasPlantId, doc.year);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, file);
}

const nwpFile = (epiasPlantId: number, model: NwpModel, year: number) => path.join(weatherDir(), String(epiasPlantId), `nwp-${model}-${year}.json.gz`);

/** Ek hava modelleri (nwp-models.ts, Aşama 22.3): aynı klasörde `nwp-<model>-<yıl>.json.gz` */
export async function readNwpYear(epiasPlantId: number, model: NwpModel, year: number): Promise<NwpYear | null> {
  let doc: NwpYear;
  try {
    doc = JSON.parse(gunzipSync(await fs.readFile(nwpFile(epiasPlantId, model, year))).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
  // Yalnız 2 gün önceki sürüm temiz (bilgi anı): başka sürüm d2 diye kullanılmasın
  if (doc.lead !== "d2") throw new Error(`#${epiasPlantId} ${model} ${year}: beklenmeyen sürüm ${doc.lead}`);
  return doc;
}

export async function writeNwpYear(doc: NwpYear): Promise<void> {
  const file = nwpFile(doc.epiasPlantId, doc.model, doc.year);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, file);
}
