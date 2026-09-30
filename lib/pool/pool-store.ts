/**
 * TR-Energy Analyst - Veri havuzu: dosya okuma/yazma (PLAN 7.1)
 *
 * Havuz `data/pool/<epiasPlantId>/<yıl>.json.gz` dosyalarıdır (git dışı). Biçim pool-codec.ts'te. Yazma önce geçici
 * dosyaya yapılır, sonra yeniden adlandırılır: yarıda kesilen bir çekim bozuk dosya bırakmaz.
 * POOL_DIR ortam değişkeni havuzu başka klasöre yönlendirir (testler).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { PoolYear } from "./pool-codec";

export function poolDir(): string {
  return process.env.POOL_DIR || path.join(process.cwd(), "data", "pool");
}

function yearFile(epiasPlantId: number, year: number): string {
  return path.join(poolDir(), String(epiasPlantId), `${year}.json.gz`);
}

/** Belge yoksa null */
export async function readPoolYear(epiasPlantId: number, year: number): Promise<PoolYear | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(yearFile(epiasPlantId, year))).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function writePoolYear(doc: PoolYear): Promise<void> {
  const file = yearFile(doc.epiasPlantId, doc.year);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, file);
}

/** Havuzdaki santral kimlikleri */
export async function listPoolPlants(): Promise<number[]> {
  try {
    const names = await fs.readdir(poolDir());
    return names.filter((n) => /^\d+$/.test(n)).map(Number).sort((a, b) => a - b);
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
}

/** Santralin havuzdaki tanımı: uzlaştırma birimleri (KGÜP bunların toplamıdır) ve biliniyorsa türü */
export interface PoolPlantInfo {
  epiasPlantId: number;
  name?: string;
  type?: "RES" | "HES" | "GES";
  /** Analiz edilmeyen tür (doğalgaz, biyokütle, jeotermal…) ya da dönemde üretim verisi yok */
  kind?: "OTHER" | "NODATA";
  uevcbs?: Array<{ id: number; name: string; eic?: string | null }>;
  /** Uzlaştırma birimlerinin EPİAŞ'tan alındığı an (ISO) */
  uevcbsAt?: string;
}

const infoFile = (epiasPlantId: number) => path.join(poolDir(), String(epiasPlantId), "plant.json");

export async function readPoolPlantInfo(epiasPlantId: number): Promise<PoolPlantInfo | null> {
  try {
    return JSON.parse(await fs.readFile(infoFile(epiasPlantId), "utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

/** Var olan tanımla birleştirir (verilmeyen alanlar korunur) */
export async function writePoolPlantInfo(info: PoolPlantInfo): Promise<PoolPlantInfo> {
  const merged = { ...(await readPoolPlantInfo(info.epiasPlantId)), ...info };
  const file = infoFile(info.epiasPlantId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(merged));
  await fs.rename(tmp, file);
  return merged;
}

/**
 * Önbellekli okuma: sayfalar aynı santral-yılı art arda okur (sonuç, DSG, rapor). Dosya değişince (mtime) yeniden
 * okunur; en fazla CACHE_MAX belge tutulur (eski girilen önce çıkar).
 */
const CACHE_MAX = 400;
const cache = new Map<string, { mtimeMs: number; doc: PoolYear }>();

export async function readPoolYearCached(epiasPlantId: number, year: number): Promise<PoolYear | null> {
  const file = yearFile(epiasPlantId, year);
  let mtimeMs: number;
  try {
    mtimeMs = (await fs.stat(file)).mtimeMs;
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
  const key = `${poolDir()}|${epiasPlantId}|${year}`;
  const hit = cache.get(key);
  if (hit && hit.mtimeMs === mtimeMs) return hit.doc;
  const doc = await readPoolYear(epiasPlantId, year);
  if (!doc) return null;
  cache.delete(key);
  cache.set(key, { mtimeMs, doc });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return doc;
}
