/**
 * TR-Energy Analyst - teklif öncesi sayfası: PTF motoru tahmini (kayıt yazmaz)
 *
 * Motor (lib/services/ptf-engine.ts) iki modeli geçmişle eğitip son 60 günü yeniden oynatır; yaklaşık bir dakika işlemciyi tutar.
 * Uygulama süreci donmasın diye hesap ayrı süreçte yapılır (scripts/ptf/forecast-preview.mts) ve `.cache/ptf/preview/<gün>.json`'a
 * yazılır. Sonuç 30 dakika taze sayılır (girdiler gün içinde yayımlanır: yük tahmini öğlen, PTF 14:00); "Yenile" yeniden hesaplatır.
 * Aynı gün için aynı anda tek hesap çalışır. Sabahki değişmeyen kayıt (data/pool/forecast-log/ptf) varsa özeti ayrıca verilir.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PtfForecastLog } from "@/lib/ptf/forecast-log";
import { readPtfLog } from "@/lib/ptf/forecast-log-store";
import type {
  PtfDisplaySeries,
  PtfInputStatus,
} from "@/lib/services/ptf-engine";

const DIR = path.join(process.cwd(), ".cache", "ptf", "preview");
const FRESH_MS = 30 * 60_000;
const TIMEOUT_MS = 8 * 60_000;

export type PtfPreview =
  | {
      ok: true;
      computedAt: string;
      log: PtfForecastLog;
      notes: string[];
      inputs: PtfInputStatus[];
      display: PtfDisplaySeries;
    }
  | {
      ok: false;
      computedAt: string;
      error: string;
      notes: string[];
      inputs: PtfInputStatus[];
    };

export interface PtfPageForecast {
  /** "computing": hesap sürüyor (varsa eski sonuç `preview`de) */
  state: "ready" | "computing";
  startedAt: string | null;
  preview: PtfPreview | null;
  /** Sabahki değişmeyen kayıt (yazıldıysa) */
  record: { issuedAt: string; onTime: boolean; mean: number } | null;
}

const running = new Map<string, { startedAt: string; done: Promise<void> }>();

function readPreview(date: string): PtfPreview | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, `${date}.json`), "utf8")) as PtfPreview;
  } catch {
    return null;
  }
}

function start(date: string) {
  const startedAt = new Date().toISOString();
  const args = [
    ...(fs.existsSync(path.join(process.cwd(), ".env")) ? ["--env-file=.env"] : []),
    path.join("node_modules", ".bin", "tsx"),
    "--tsconfig",
    "tsconfig.json",
    path.join("scripts", "ptf", "forecast-preview.mts"),
    "--date",
    date,
    "--out",
    path.join(DIR, `${date}.json`),
  ];
  const done = new Promise<void>((resolve) => {
    const c = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    c.stderr.on("data", (b) => (err = (err + b).slice(-4000)));
    const timer = setTimeout(() => c.kill("SIGTERM"), TIMEOUT_MS);
    const finish = (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0) {
        // Betik kendi hatasını dosyaya yazar; buraya yalnız süreç düzeyindeki hata (zaman aşımı, açılamama) düşer
        const line = err.split("\n").find((l) => /^\w*Error: /.test(l));
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(
          path.join(DIR, `${date}.json`),
          JSON.stringify({
            ok: false,
            computedAt: new Date().toISOString(),
            error:
              line ?? (code === null ? "Hesap zaman aşımına uğradı." : `Hesap süreci ${code} koduyla bitti.`),
            notes: [],
            inputs: [],
          } satisfies PtfPreview)
        );
      }
      running.delete(date);
      resolve();
    };
    c.on("close", finish);
    c.on("error", () => finish(-1));
  });
  running.set(date, { startedAt, done });
}

export async function getPtfPageForecast(
  date: string,
  refresh = false
): Promise<PtfPageForecast> {
  const log = await readPtfLog(date).catch(() => null);
  const record = log
    ? {
        issuedAt: log.issuedAt,
        onTime: log.onTime,
        mean: log.hours.reduce((s, h) => s + h.p50, 0) / log.hours.length,
      }
    : null;
  const preview = readPreview(date);
  const fresh =
    preview && Date.now() - Date.parse(preview.computedAt) < FRESH_MS && !refresh;
  if (!fresh && !running.has(date)) start(date);
  const r = running.get(date);
  return {
    state: r ? "computing" : "ready",
    startedAt: r?.startedAt ?? null,
    preview,
    record,
  };
}
