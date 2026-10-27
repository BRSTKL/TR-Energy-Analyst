/**
 * TR-Energy Analyst - Veri havuzu: ENTSO-E komşu fiyat ve akış dosyası (biçim entsoe-codec.ts)
 *
 * `<havuz>/entsoe/neighbors.json.gz`. Yazma önce geçici dosyaya, sonra yeniden adlandırma. Santral listesi
 * (listPoolPlants) yalnız sayısal klasörleri okuduğu için `entsoe` klasörü onu etkilemez.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { poolDir } from "./pool-store";
import type { EntsoeDoc } from "./entsoe-codec";

export const entsoeDir = () => path.join(poolDir(), "entsoe");
const file = () => path.join(entsoeDir(), "neighbors.json.gz");

/** Belge yoksa null */
export async function readEntsoe(): Promise<EntsoeDoc | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(file())).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeEntsoe(doc: EntsoeDoc): Promise<void> {
  await fs.mkdir(entsoeDir(), { recursive: true });
  const tmp = `${file()}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, file());
}
