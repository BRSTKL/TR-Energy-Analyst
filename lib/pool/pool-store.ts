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
