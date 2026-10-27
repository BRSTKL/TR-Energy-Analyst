/**
 * TR-Energy Analyst - Veri havuzu: DSİ baraj doluluğu dosyası (biçim dsi-dam-codec.ts)
 *
 * `<havuz>/dsi/dam-occupancy.json.gz`. Yazma önce geçici dosyaya, sonra yeniden adlandırma. Santral listesi
 * (listPoolPlants) yalnız sayısal klasörleri okuduğu için `dsi` klasörü onu etkilemez.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { poolDir } from "./pool-store";
import type { DsiDamDoc } from "./dsi-dam-codec";

export const dsiDir = () => path.join(poolDir(), "dsi");
const file = () => path.join(dsiDir(), "dam-occupancy.json.gz");

/** Belge yoksa null */
export async function readDsiDam(): Promise<DsiDamDoc | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(file())).toString("utf8"));
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export async function writeDsiDam(doc: DsiDamDoc): Promise<void> {
  await fs.mkdir(dsiDir(), { recursive: true });
  const tmp = `${file()}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, file());
}
