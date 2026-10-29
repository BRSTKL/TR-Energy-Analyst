/**
 * PTF motoru: teklif öncesi sayfası için tahmin (kayıt yazmaz). Sayfanın API'si bu betiği ayrı süreçte çalıştırır; model eğitimi
 * yaklaşık bir dakika işlemciyi tutar, uygulama süreci donmasın diye (lib/services/ptf-forecast-page.ts).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/forecast-preview.mts --date YYYY-AA-GG --out <dosya>
 *
 * Çıktı: { ok: true, computedAt, log, notes, inputs, display } ya da { ok: false, computedAt, error, notes, inputs }.
 */

import fs from "node:fs";
import path from "node:path";
import { forecastPtf, PtfForecastError } from "@/lib/services/ptf-engine";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const date = arg("date");
const out = arg("out");
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !out) {
  console.error("Kullanım: --date YYYY-AA-GG --out <dosya>");
  process.exit(1);
}

const computedAt = new Date().toISOString();
let result: unknown;
try {
  result = { ok: true, computedAt, ...(await forecastPtf(date)) };
} catch (e) {
  result = {
    ok: false,
    computedAt,
    error: e instanceof Error ? e.message : String(e),
    notes: e instanceof PtfForecastError ? e.notes : [],
    inputs: e instanceof PtfForecastError ? e.inputs : [],
  };
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(`${out}.tmp`, JSON.stringify(result));
fs.renameSync(`${out}.tmp`, out);
process.exit(0);
