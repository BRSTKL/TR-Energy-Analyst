/**
 * TR-Energy Analyst - Günlük tahmin kaydının dosyası (kural: lib/solar-engine/learning/forecast-log.ts)
 *
 * data/pool/forecast-log/solar/<YYYY-MM>/<YYYY-MM-DD>.json.gz: hedef gün başına bir dosya. Yalnız yoksa yazılır: kayıt
 * bir daha değişmez. Aynı gün ikinci çalışma dokunmaz.
 *
 * Ek kayıt (18.11.2026): ana kayıttan SONRA hazır olan gölge sürüm (ör. WeatherNext 3, ≈ 11:10 TR'de yayımlanır) aynı
 * kurallarla ayrı dosyaya yazılır: data/pool/forecast-log/<tech>-addendum/<YYYY-MM>/<YYYY-MM-DD>.<sürüm>.json.gz. Yalnız
 * yoksa yazılır, değişmez. `readForecastLog` ana kayıt varsa KESİMDEN ÖNCE yazılmış ekleri gölge listesine katar
 * (aynı sürüm ana kayıtta varsa ek yok sayılır): karne ve şampiyon kararı onları başka işlem gerekmeden ölçer.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { poolDir } from "@/lib/pool/pool-store";
import type { ForecastLog, ForecastLogShadow } from "@/lib/solar-engine/learning/forecast-log";

export const forecastLogPath = (targetDate: string, tech: "solar" | "wind" = "solar") => path.join(poolDir(), "forecast-log", tech, targetDate.slice(0, 7), `${targetDate}.json.gz`);

export async function readForecastLog(targetDate: string, tech: "solar" | "wind" = "solar"): Promise<ForecastLog | null> {
  let log: ForecastLog;
  try {
    log = JSON.parse(gunzipSync(await fs.readFile(forecastLogPath(targetDate, tech))).toString("utf8")) as ForecastLog;
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
  const extra = (await readForecastAddenda(targetDate, tech)).filter((a) => a.onTime && Date.parse(a.issuedAt) <= Date.parse(log.cutoff));
  const have = new Set((log.shadow ?? []).map((s) => s.modelId));
  for (const a of extra) if (!have.has(a.shadow.modelId)) (log.shadow ??= []).push(a.shadow);
  return log;
}

/** Ana kayıttan sonra yazılan gölge sürüm (ek kayıt) */
export interface ForecastAddendum {
  schema: number;
  tech: "GES" | "RES";
  targetDate: string;
  issuedAt: string;
  cutoff: string;
  onTime: boolean;
  /** Hava kaynağı ve kullanılan çalışma (iz için) */
  weather: { source: string; runInit: string | null };
  code: string | null;
  shadow: ForecastLogShadow;
}

const addendumDir = (targetDate: string, tech: "solar" | "wind") => path.join(poolDir(), "forecast-log", `${tech}-addendum`, targetDate.slice(0, 7));

export async function readForecastAddenda(targetDate: string, tech: "solar" | "wind" = "solar"): Promise<ForecastAddendum[]> {
  const dir = addendumDir(targetDate, tech);
  const out: ForecastAddendum[] = [];
  for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
    if (!f.startsWith(`${targetDate}.`) || !f.endsWith(".json.gz")) continue;
    out.push(JSON.parse(gunzipSync(await fs.readFile(path.join(dir, f))).toString("utf8")) as ForecastAddendum);
  }
  return out;
}

/** Ek kaydı yazar; aynı gün ve sürüm için varsa dokunmaz ve false döner (ana kayıtla aynı tek adımlı yazım) */
export async function writeForecastAddendum(a: ForecastAddendum, tech: "solar" | "wind" = "solar"): Promise<boolean> {
  if ((tech === "wind") !== (a.tech === "RES")) throw new Error("Kayıt teknolojisi ve dizini uyuşmuyor");
  if (!/^[\w.-]+$/.test(a.shadow.modelId)) throw new Error(`Geçersiz sürüm kimliği: ${a.shadow.modelId}`);
  const file = path.join(addendumDir(a.targetDate, tech), `${a.targetDate}.${a.shadow.modelId}.json.gz`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const h = await fs.open(tmp, "wx");
  try {
    await h.writeFile(gzipSync(JSON.stringify(a)));
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
