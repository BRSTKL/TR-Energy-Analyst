/**
 * TR-Energy Analyst - Veri havuzu: arıza / bakım bildirimleri dosyaları (biçim umm-codec.ts)
 *
 * `<havuz>/umm/<yıl>.json.gz`. Yazma pool-store.ts ile aynı biçimde önce geçici dosyaya, sonra yeniden adlandırma.
 * Santral listesi (listPoolPlants) yalnız sayısal klasörleri okuduğu için `umm` klasörü onu etkilemez.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { poolDir } from "./pool-store";
import type { UmmYear } from "./umm-codec";

export function ummDir(): string {
  return path.join(poolDir(), "umm");
}

const yearFile = (year: number) => path.join(ummDir(), `${year}.json.gz`);

/** Belge yoksa null */
export async function readUmmYear(year: number): Promise<UmmYear | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(yearFile(year))).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeUmmYear(doc: UmmYear): Promise<void> {
  const file = yearFile(doc.year);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, file);
}
