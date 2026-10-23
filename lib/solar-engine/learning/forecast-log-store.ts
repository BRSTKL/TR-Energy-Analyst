/**
 * TR-Energy Analyst - Günlük tahmin kaydının dosyası (kural: lib/solar-engine/learning/forecast-log.ts)
 *
 * data/pool/forecast-log/solar/<YYYY-MM>/<YYYY-MM-DD>.json.gz: hedef gün başına bir dosya. Yalnız yoksa yazılır: kayıt
 * bir daha değişmez. Aynı gün ikinci çalışma dokunmaz.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { poolDir } from "@/lib/pool/pool-store";
import type { ForecastLog } from "@/lib/solar-engine/learning/forecast-log";

export const forecastLogPath = (targetDate: string, tech: "solar" | "wind" = "solar") => path.join(poolDir(), "forecast-log", tech, targetDate.slice(0, 7), `${targetDate}.json.gz`);

export async function readForecastLog(targetDate: string, tech: "solar" | "wind" = "solar"): Promise<ForecastLog | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(forecastLogPath(targetDate, tech))).toString("utf8")) as ForecastLog;
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

/**
 * Kaydı yazar; o gün için kayıt varsa dokunmaz ve false döner. Önce geçici dosyaya yazılıp diske işlenir, sonra tek
 * adımda (`link`, hedef varsa EEXIST) yerine konur: yarıda kalan yazım yarım kayıt bırakmaz, okuyucu yarım dosya görmez.
 * Kayıt salt okunur yapılır.
 */
export async function writeForecastLog(log: ForecastLog, tech: "solar" | "wind" = "solar"): Promise<boolean> {
  if ((tech === "wind") !== (log.tech === "RES")) throw new Error("Kayıt teknolojisi ve dizini uyuşmuyor");
  const file = forecastLogPath(log.targetDate, tech);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const h = await fs.open(tmp, "wx");
  try {
    await h.writeFile(gzipSync(JSON.stringify(log)));
    await h.sync();
  } finally {
    await h.close();
  }
  try {
    await fs.link(tmp, file);
    await fs.chmod(file, 0o444);
    return true;
  } catch (e: any) {
    if (e?.code === "EEXIST") return false;
    throw e;
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/** Kaydı olan hedef günler (YYYY-MM-DD, sıralı) */
export async function listForecastLogs(tech: "solar" | "wind" = "solar"): Promise<string[]> {
  const root = path.join(poolDir(), "forecast-log", tech);
  const out: string[] = [];
  for (const m of await fs.readdir(root).catch(() => [] as string[]))
    for (const f of await fs.readdir(path.join(root, m)).catch(() => [] as string[])) if (/^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)) out.push(f.slice(0, 10));
  return out.sort();
}
