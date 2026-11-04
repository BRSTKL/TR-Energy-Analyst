/**
 * TR-Energy Analyst - PTF şampiyon defterinin dosyası (kural lib/ptf/champion.ts)
 *
 * data/pool/forecast-log/ptf/champion.json: canlı sürüm ve geçmişi. Tek dosya, geçici dosya + yeniden adlandırma ile yazılır.
 * Dosya günlük kayıt klasörüyle aynı yerde ama ay klasörü değildir (`listPtfLogs` yalnız ay klasörlerine bakar).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { poolDir } from "@/lib/pool/pool-store";
import { EMPTY_REGISTRY, type PtfChampionRegistry } from "./champion";

export const ptfChampionPath = () => path.join(poolDir(), "forecast-log", "ptf", "champion.json");

export async function readPtfChampion(): Promise<PtfChampionRegistry> {
  try {
    const f = JSON.parse(await fs.readFile(ptfChampionPath(), "utf8")) as PtfChampionRegistry;
    return { updatedAt: f.updatedAt ?? EMPTY_REGISTRY.updatedAt, state: f.state ?? null, reviewedOn: f.reviewedOn };
  } catch (e: any) {
    if (e?.code === "ENOENT") return { ...EMPTY_REGISTRY };
    throw e;
  }
}

export async function writePtfChampion(reg: PtfChampionRegistry): Promise<void> {
  const file = ptfChampionPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(reg, null, 1));
  await fs.rename(tmp, file);
}
