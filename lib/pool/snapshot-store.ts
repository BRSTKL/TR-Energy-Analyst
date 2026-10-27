/**
 * TR-Energy Analyst - Veri havuzu: EPİAŞ anlık görüntüleri (27.10.2026)
 *
 * EPİAŞ yarının tahminlerini (rüzgâr, yük) ve fiyatını yalnız SON hâliyle verir; "12:25'te ne biliniyordu" sorusu geçmişten
 * öğrenilemez. Zamanlanmış iş (scripts/snapshot-capture.mts) 08:00–14:00 arasında bu serileri çekip burada saklar. Dosya
 * çekim gününe göre: `<havuz>/snapshots/<çekim günü>/<SSDD>.json.gz` (Türkiye duvar saati). Bir kez yazılır, hiç düzenlenmez
 * (önceki bir dosyanın üzerine yazılmaz; aynı dakikada ikinci çekim hata verir). İçinde hedef günler ayrıdır (yarın ve bugün).
 * Geriye doldurulamaz: kaçırılan çekim yoktur.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { poolDir } from "./pool-store";

export const SNAPSHOT_FORMAT = 1;

export type SnapshotSeriesId = "res-forecast" | "load-plan" | "ptf" | "dpp";

export interface SnapshotSeries {
  id: SnapshotSeriesId;
  /** Çekim anına göre: yarın ya da bugün */
  target: "tomorrow" | "today";
  /** Serinin günü (YYYY-AA-GG) */
  day: string;
  endpoint: string;
  ok: boolean;
  /** Hata varsa HTTP durumu (400, 404, …); yoksa null */
  status: number | null;
  error: string | null;
  count: number;
  /** EPİAŞ kayıtları (gereken alanlar) */
  items: unknown[];
}

export interface Snapshot {
  format: number;
  /** Çekim anı (UTC ISO) */
  takenAt: string;
  /** Çekim anı, Türkiye duvar saati ("2026-10-27T16:02:00+03:00") */
  wall: string;
  today: string;
  tomorrow: string;
  series: SnapshotSeries[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Türkiye (UTC+3, yıl boyu) duvar saati parçaları */
export function wallParts(at: Date): { day: string; hhmm: string; iso: string; tomorrow: string } {
  const w = new Date(at.getTime() + 3 * 3_600_000);
  const day = w.toISOString().slice(0, 10);
  const hhmm = `${pad(w.getUTCHours())}${pad(w.getUTCMinutes())}`;
  return {
    day,
    hhmm,
    iso: `${day}T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}:${pad(w.getUTCSeconds())}+03:00`,
    tomorrow: new Date(w.getTime() + 86_400_000).toISOString().slice(0, 10),
  };
}

export const snapshotsDir = () => path.join(poolDir(), "snapshots");
export const snapshotFile = (day: string, hhmm: string) => path.join(snapshotsDir(), day, `${hhmm}.json.gz`);

/** Bir kez yazar; dosya varsa hata verir (EEXIST). Önce geçici dosya, sonra sert bağ: yarım dosya görünmez. */
export async function writeSnapshot(snap: Snapshot): Promise<string> {
  const { day, hhmm } = wallParts(new Date(snap.takenAt));
  const file = snapshotFile(day, hhmm);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(snap)));
  try {
    await fs.link(tmp, file);
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
  return file;
}

export async function readSnapshot(file: string): Promise<Snapshot> {
  return JSON.parse(gunzipSync(await fs.readFile(file)).toString("utf8")) as Snapshot;
}

/** Bütün anlık görüntü dosyaları, çekim zamanına göre */
export async function listSnapshotFiles(): Promise<string[]> {
  let days: string[];
  try {
    days = (await fs.readdir(snapshotsDir())).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
  const out: string[] = [];
  for (const d of days) {
    const names = (await fs.readdir(path.join(snapshotsDir(), d))).filter((n) => /^\d{4}\.json\.gz$/.test(n)).sort();
    for (const n of names) out.push(path.join(snapshotsDir(), d, n));
  }
  return out;
}
