/**
 * TR-Energy Analyst - PTF tahmin kaydının dosyası (biçim lib/ptf/forecast-log.ts)
 *
 * data/pool/forecast-log/ptf/<YYYY-MM>/<YYYY-MM-DD>.json.gz: hedef gün başına bir dosya, yalnız yoksa yazılır (geçici dosya +
 * `link`, salt okunur). Aynı gün ikinci çalışma dokunmaz; güneş kaydıyla aynı kural.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { poolDir } from "@/lib/pool/pool-store";
import type { PtfForecastLog } from "./forecast-log";

export const ptfLogPath = (targetDate: string) =>
  path.join(
    poolDir(),
    "forecast-log",
    "ptf",
    targetDate.slice(0, 7),
    `${targetDate}.json.gz`
  );

export async function readPtfLog(targetDate: string): Promise<PtfForecastLog | null> {
  try {
    return JSON.parse(
      gunzipSync(await fs.readFile(ptfLogPath(targetDate))).toString("utf8")
    ) as PtfForecastLog;
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

/** Kaydı yazar; varsa dokunmaz ve false döner */
export async function writePtfLog(log: PtfForecastLog): Promise<boolean> {
  const file = ptfLogPath(log.targetDate);
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

export async function listPtfLogs(): Promise<string[]> {
  const root = path.join(poolDir(), "forecast-log", "ptf");
  const out: string[] = [];
  for (const m of await fs.readdir(root).catch(() => [] as string[]))
    for (const f of await fs.readdir(path.join(root, m)).catch(() => [] as string[]))
      if (/^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)) out.push(f.slice(0, 10));
  return out.sort();
}
