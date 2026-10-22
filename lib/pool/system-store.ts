/**
 * TR-Energy Analyst - Veri havuzu: sistem geneli seriler dosyaları (biçim system-codec.ts)
 *
 * `<havuz>/system/<yıl>.json.gz`. Yazma pool-store.ts ile aynı biçimde önce geçici dosyaya, sonra yeniden adlandırma.
 * Santral listesi (listPoolPlants) yalnız sayısal klasörleri okuduğu için `system` klasörü onu etkilemez.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { poolDir } from "./pool-store";
import type { SystemYear } from "./system-codec";

export function systemDir(): string {
  return path.join(poolDir(), "system");
}

const yearFile = (year: number) => path.join(systemDir(), `${year}.json.gz`);

/** Belge yoksa null */
export async function readSystemYear(year: number): Promise<SystemYear | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(yearFile(year))).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeSystemYear(doc: SystemYear): Promise<void> {
  const file = yearFile(doc.year);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, file);
}
