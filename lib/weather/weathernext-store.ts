/**
 * TR-Energy Analyst - WeatherNext 3 hücre deposu (havuz: data/pool/weather/wn3/<yıl>/<enlem>_<boylam>.json.gz)
 *
 * Bir dosya = bir 0,1° ızgara hücresi × bir yıl. Diziler havuzla aynı düzende: indeks = yılın başından duvar saati (Türkiye,
 * UTC+3; `start` "YYYY-01-01T00:00:00.000Z" biçiminde duvar saati). Değer o DAMGADAKİ tahmin:
 *   - anlık: `ws100`, `dir100` (u/v'den, rüzgârın geldiği yön), `ws100p10`, `ws100p90`, `ws10`, `t2m` (°C), `cloud` (0–1);
 *   - saatlik birikim, damgadan ÖNCEKİ saat (WN3 makalesi: 1 saat ileri = başlangıç ile +1 sa arası birikim): `ghi`,
 *     `direct` (W/m², J/m² / 3600). Üretim saati [i, i+1) için ışınım i+1 damgasındadır.
 * Her hedef gün (Türkiye günü) için kullanılan çalışma `runs[gün]` (ISO). Kural: kesimden önce elde olan en yeni 6 saatlik
 * çalışma (lib/weather/weathernext.ts `weathernextRunsForTargetDay`); eksikse bir öncekine düşülür.
 * SAF kısımlar (assembleDay) I/O içermez.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { poolDir } from "@/lib/pool/pool-store";

export const WN3_VARS = ["ws100", "dir100", "ws100p10", "ws100p90", "ws10", "t2m", "ghi", "direct", "cloud"] as const;
export type Wn3Var = (typeof WN3_VARS)[number];
export const WN3_SCHEMA = 1;

export interface Wn3CellYear {
  schema: number;
  latitude: number;
  longitude: number;
  year: number;
  start: string;
  vars: Record<Wn3Var, Array<number | null>>;
  runs: Record<string, string>;
  /** Gün başına çekim anı (ISO; 18.11.2026'dan): kesimden sonra çekilen günler sonradan ayırt edilebilsin */
  fetchedAt?: Record<string, string>;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TR = 3 * HOUR;

export const hoursOfYear = (y: number) => (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / HOUR;
export const cellKey = (lat: number, lon: number) => `${lat.toFixed(1)}_${lon.toFixed(1)}`;

export function emptyCellYear(latitude: number, longitude: number, year: number): Wn3CellYear {
  const n = hoursOfYear(year);
  return {
    schema: WN3_SCHEMA,
    latitude,
    longitude,
    year,
    start: new Date(Date.UTC(year, 0, 1)).toISOString(),
    vars: Object.fromEntries(WN3_VARS.map((v) => [v, Array<number | null>(n).fill(null)])) as Wn3CellYear["vars"],
    runs: {},
  };
}

export function wn3Dir(): string {
  return path.join(poolDir(), "weather", "wn3");
}

const fileOf = (lat: number, lon: number, year: number) => path.join(wn3Dir(), String(year), `${cellKey(lat, lon)}.json.gz`);

export async function readCellYear(lat: number, lon: number, year: number): Promise<Wn3CellYear | null> {
  try {
    return JSON.parse(gunzipSync(await fs.readFile(fileOf(lat, lon, year))).toString()) as Wn3CellYear;
  } catch {
    return null;
  }
}

export async function writeCellYear(doc: Wn3CellYear): Promise<void> {
  const f = fileOf(doc.latitude, doc.longitude, doc.year);
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(doc)));
  await fs.rename(tmp, f);
}

/** Sorgudan gelen bir satır (bir hücre, bir çalışma, bir öncü saat); birimler çevrilmiş */
export interface Wn3Row {
  cell: string;
  run: number;
  lead: number;
  values: Record<Wn3Var, number | null>;
}

const round = (v: number | null, d: number) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

/** BigQuery ham değerlerinden depo birimleri */
export function convertRow(raw: { u: number | null; v: number | null; ws: number | null; p10: number | null; p90: number | null; ws10: number | null; t2m: number | null; ghi: number | null; direct: number | null; cloud: number | null }): Record<Wn3Var, number | null> {
  const dir = raw.u === null || raw.v === null ? null : (((Math.atan2(-raw.u, -raw.v) * 180) / Math.PI) % 360 + 360) % 360;
  return {
    ws100: round(raw.ws, 2),
    dir100: round(dir, 1),
    ws100p10: round(raw.p10, 2),
    ws100p90: round(raw.p90, 2),
    ws10: round(raw.ws10, 2),
    t2m: round(raw.t2m === null ? null : raw.t2m - 273.15, 2),
    ghi: round(raw.ghi === null ? null : Math.max(0, raw.ghi / 3600), 1),
    direct: round(raw.direct === null ? null : Math.max(0, raw.direct / 3600), 1),
    cloud: round(raw.cloud, 3),
  };
}

/**
 * Hedef gün D'nin 24 damgası (duvar saati D 00:00 … 23:00) için hücre değerleri: `runs` sırasıyla ilk eksiksiz çalışma.
 * Dönüş: hücre → { run, values[24] } ; hiçbir çalışma 24 damgayı tam vermiyorsa hücre yok.
 */
export function assembleDay(rows: Wn3Row[], targetDay: string, runs: number[]): Map<string, { run: number; values: Array<Record<Wn3Var, number | null>> }> {
  const wall0 = Date.parse(`${targetDay}T00:00:00Z`);
  const idx = new Map<string, Record<Wn3Var, number | null>>();
  const cells = new Set<string>();
  for (const r of rows) {
    idx.set(`${r.cell}|${r.run}|${r.lead}`, r.values);
    cells.add(r.cell);
  }
  const out = new Map<string, { run: number; values: Array<Record<Wn3Var, number | null>> }>();
  for (const cell of cells) {
    for (const run of runs) {
      const values = Array.from({ length: 24 }, (_, h) => idx.get(`${cell}|${run}|${Math.round((wall0 + h * HOUR - TR - run) / HOUR)}`));
      if (values.every((v) => v !== undefined)) {
        out.set(cell, { run, values: values as Array<Record<Wn3Var, number | null>> });
        break;
      }
    }
  }
  return out;
}

/** Günü yıl dosyasına yazar (o günün 24 damgası ve kullanılan çalışma) */
export function putDay(doc: Wn3CellYear, targetDay: string, run: number, values: Array<Record<Wn3Var, number | null>>): void {
  const i0 = (Date.parse(`${targetDay}T00:00:00Z`) - Date.parse(doc.start)) / HOUR;
  values.forEach((v, h) => {
    for (const k of WN3_VARS) doc.vars[k][i0 + h] = v[k];
  });
  doc.runs[targetDay] = new Date(run).toISOString();
}

export const dayAdd = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Bir damganın değerleri ve o günün çalışması (yalnız kesimden önce elde olan çalışmayla doldurulmuş günler) */
export interface Wn3Stamp {
  run: number;
  values: Record<Wn3Var, number | null>;
}

/**
 * Hücrenin [from, to) duvar saati damgaları. Bilgi zamanı burada denetlenir: günün çalışması + yayım gecikmesi o günün
 * kesiminden (D-1 12:30 TR) sonraysa gün atlanır (lib/forecast/info-time.ts `decisionCutoff`, `WEATHER_RUN_RULES`).
 */
export async function wn3Stamps(latitude: number, longitude: number, from: number, to: number, publishDelayMs: number, cutoffOf: (wall: number) => number): Promise<Map<number, Wn3Stamp>> {
  const out = new Map<number, Wn3Stamp>();
  for (let y = new Date(from).getUTCFullYear(); y <= new Date(to - 1).getUTCFullYear(); y++) {
    const doc = await readCellYear(latitude, longitude, y);
    if (!doc) continue;
    const s0 = Date.parse(doc.start);
    for (const [day, iso] of Object.entries(doc.runs)) {
      const wall0 = Date.parse(`${day}T00:00:00Z`);
      if (wall0 + DAY <= from || wall0 >= to) continue;
      const run = Date.parse(iso);
      if (run + publishDelayMs + TR > cutoffOf(wall0)) continue;
      for (let h = 0; h < 24; h++) {
        const t = wall0 + h * HOUR;
        if (t < from || t >= to) continue;
        const i = (t - s0) / HOUR;
        out.set(t, { run, values: Object.fromEntries(WN3_VARS.map((k) => [k, doc.vars[k][i] ?? null])) as Record<Wn3Var, number | null> });
      }
    }
  }
  return out;
}

/**
 * Üretim saati t'nin kesiminde (cutoffOf(t)) damga s elde mi: damganın çalışması + yayım gecikmesi ≤ kesim. Günün son
 * saati ertesi günün 00:00 damgasına uzanır; o damga ertesi günün çalışmasındandır ve t'nin kesiminde elde DEĞİLDİR.
 */
export function wn3UsableFor(stamp: Wn3Stamp | undefined, t: number, publishDelayMs: number, cutoffOf: (wall: number) => number): Wn3Stamp | null {
  return stamp && stamp.run + publishDelayMs + TR <= cutoffOf(t) ? stamp : null;
}
