/**
 * PTF motoru: günlük yeniden oynatma (lib/ptf/replay.ts). Her hedef gün, kesimde bilinen veriyle yeniden tahmin edilir.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/replay.mts [--from 2025-07-01] [--to dün] [--oracle cons,windRt,kgup]
 *       [--models R,LEAR,GBM,HYB] [--no-sun-fix] [--no-windf] [--history-from 2024-01-01] [--lear-window 728] [--gbm-window 728]
 *       [--no-solar] (kendi ülke güneş tahminini kapat, vekile dön) [--no-ownwind] [--wind-policy forecastFirst|average|ownFirst|noOwn] [--exclude gas,cap] (varsayılan motorunki: gas; hiçbir şey çıkarmamak için --exclude none) [--label ad]
 *
 * `--oracle`: kusursuz girdi tanısı (hata bütçesi): verilen alanlar hedef günün gerçekleşeniyle değiştirilir, eğitimde de.
 * Sonuç canlı başarı değildir. Çıktı: model skorları, R2'ye ve en iyi referansa göre farklar (haftalık blok bootstrap),
 * dönem kırılımı; .cache/ptf/replay-<etiket>.json.
 */

import fs from "node:fs";
import path from "node:path";
import {
  ENGINE_EXCLUDE,
  FeatureCache,
  GBM_DEFAULTS,
  gbmModel,
  hybridModel,
  LEAR_DEFAULTS,
  learModel,
  referenceModels,
  type ModelContext,
  type PtfModel,
} from "@/lib/ptf/models";
import { LEVEL_GAMMA, correctLevel } from "@/lib/ptf/level";
import { compare, replay, scoreModels, type DayResult } from "@/lib/ptf/replay";
import type { PtfField } from "@/lib/ptf/history";
import { loadPtfHistory } from "@/lib/services/ptf-history";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const shift = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const from = arg("from", "2025-07-01")!;
const to = arg("to", shift(today, -1))!;
const oracle = new Set(
  (arg("oracle", "") ?? "").split(",").filter(Boolean) as PtfField[]
);
const which = new Set((arg("models", "R,LEAR,GBM") ?? "").split(","));
const label = arg("label", oracle.size ? `oracle-${[...oracle].join("+")}` : "canli")!;

const t0 = Date.now();
const days = await loadPtfHistory(arg("history-from", "2024-01-01")!, to, {
  windForecast: !process.argv.includes("--no-windf"),
  solar: !process.argv.includes("--no-solar"),
  wind: !process.argv.includes("--no-ownwind"),
  sunFix: !process.argv.includes("--no-sun-fix"), // varsayılan canlı motorun tarifi
});
const exclude = new Set(
  (arg("exclude", ENGINE_EXCLUDE.join(",")) ?? "").split(",").filter(Boolean)
);
const windPolicy = arg("wind-policy") as ModelContext["windPolicy"];
const ctx: ModelContext = { days, oracle, exclude, windPolicy };
const cache = new FeatureCache(ctx);
const models: PtfModel[] = [];
if (which.has("R")) models.push(...referenceModels(ctx, cache));
const learWin = Number(arg("lear-window", String(LEAR_DEFAULTS.windowDays)));
const gbmWin = Number(arg("gbm-window", String(GBM_DEFAULTS.windowDays)));
if (which.has("LEAR"))
  models.push(learModel(ctx, cache, { ...LEAR_DEFAULTS, windowDays: learWin }));
if (which.has("GBM"))
  models.push(gbmModel(ctx, cache, { ...GBM_DEFAULTS, windowDays: gbmWin }));
if (which.has("HYB"))
  models.push(hybridModel(ctx, cache, { ...GBM_DEFAULTS, windowDays: gbmWin }));
console.log(
  `Veri: ${days.size} gün (${((Date.now() - t0) / 1000).toFixed(1)} sn). Yeniden oynatma ${from} – ${to}, ${models.length} model, ${label}.`
);

const t1 = Date.now();
const results = replay(models, days, from, to);
console.log(
  `Ortak gün: ${results.length} (${((Date.now() - t1) / 1000).toFixed(1)} sn)\n`
);

// Birleşim: LEAR ve GBM'nin basit ortalaması (öğrenilen ağırlık yok)
if (which.has("LEAR") && which.has("GBM"))
  for (const r of results)
    r.preds["ENS-ortalama"] = r.preds["LEAR-ridge"].map(
      (v, h) => (v + r.preds["GBM"][h]) / 2
    );
// Üçlü birleşim (deneysel): LEAR, GBM ve melez modelin basit ortalaması
if (which.has("LEAR") && which.has("GBM") && which.has("HYB"))
  for (const r of results)
    r.preds["ENS3"] = r.preds["LEAR-ridge"].map(
      (v, h) => (v + r.preds["GBM"][h] + r.preds["HYB"][h]) / 3
    );
// Canlı motorun tarifi: birleşim + günlük seviye düzeltmesi (lib/ptf/level.ts, γ seçim döneminde seçildi)
if (which.has("LEAR") && which.has("GBM")) {
  const withLevel = correctLevel(results, "ENS-ortalama", "ENS-seviye", LEVEL_GAMMA);
  withLevel.forEach((r, i) => (results[i].preds["ENS-seviye"] = r.preds["ENS-seviye"]));
}
const ids = [
  ...models.map((m) => m.id),
  ...(which.has("LEAR") && which.has("GBM") ? ["ENS-ortalama"] : []),
  ...(which.has("LEAR") && which.has("GBM") && which.has("HYB") ? ["ENS3"] : []),
  ...(which.has("LEAR") && which.has("GBM") ? ["ENS-seviye"] : []),
];
const f0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : "—");
const table = (rs: DayResult[], title: string) => {
  if (!rs.length) return;
  console.log(`== ${title} (${rs.length} gün)`);
  console.log(
    "model".padEnd(20),
    "MAE".padStart(6),
    "RMSE".padStart(6),
    "gece".padStart(6),
    "öğle".padStart(6),
    "akşam".padStart(6),
    "sapma".padStart(6)
  );
  for (const s of scoreModels(rs, ids))
    console.log(
      s.id.padEnd(20),
      f0(s.mae).padStart(6),
      f0(s.rmse).padStart(6),
      f0(s.maeNight).padStart(6),
      f0(s.maeNoon).padStart(6),
      f0(s.maeEvening).padStart(6),
      f0(s.bias).padStart(6)
    );
  const refs = ids.filter((i) => i.startsWith("R"));
  const bestRef = scoreModels(rs, refs).sort((a, b) => a.mae - b.mae)[0]?.id;
  for (const m of ids.filter((i) => !i.startsWith("R")))
    for (const r of Array.from(
      new Set(["R2-sinif-ortancasi", bestRef].filter(Boolean) as string[])
    )) {
      const c = compare(rs, m, r);
      console.log(
        `  ${m} vs ${r}: %${c.improvementPct.toFixed(1)} (fark ${c.diff.toFixed(0)} TL/MWh, %95 aralık ${c.lo.toFixed(0)}…${c.hi.toFixed(0)}, iyi gün %${c.betterDaysPct.toFixed(0)}) → ${c.verdict}`
      );
    }
  console.log();
};
// Aralık kapsaması: her gün için önceki 60 günün birleşim hatalarından %5/%95 (canlıdaki kural, lib/ptf/forecast-log.ts)
const BAND_MODEL = ids.includes("ENS-seviye") ? "ENS-seviye" : "ENS-ortalama";
if (ids.includes(BAND_MODEL)) {
  const q = (v: number[], p: number) => {
    const a = [...v].sort((x, y) => x - y);
    const pos = (a.length - 1) * p;
    const lo = Math.floor(pos);
    return a[lo] + (a[Math.ceil(pos)] - a[lo]) * (pos - lo);
  };
  let inside = 0;
  let n = 0;
  let width = 0;
  for (let i = 60; i < results.length; i++) {
    const past = results
      .slice(i - 60, i)
      .map((r) => r.actual.map((a, h) => a - r.preds[BAND_MODEL][h]));
    const r = results[i];
    for (let h = 0; h < 24; h++) {
      const e = past.map((x) => x[h]);
      const lo = r.preds[BAND_MODEL][h] + q(e, 0.05);
      const hi = r.preds[BAND_MODEL][h] + q(e, 0.95);
      if (r.actual[h] >= lo && r.actual[h] <= hi) inside++;
      width += hi - lo;
      n++;
    }
  }
  if (n)
    console.log(
      `Birleşim (${BAND_MODEL}) %80 hedefli aralığı (önceki 60 günün hatalarının %5/%95'i): ${n / 24} gün, kapsama %${((inside / n) * 100).toFixed(1)}, ortalama genişlik ${Math.round(width / n)} TL/MWh\n`
    );
}
table(results, "Bütün dönem");
table(
  results.filter((r) => r.day < "2026-01-01"),
  "2025 ikinci yarı"
);
table(
  results.filter((r) => r.day >= "2026-01-01" && r.day < "2026-06-01"),
  "2026 Ocak–Mayıs"
);
table(
  results.filter((r) => r.day >= "2026-06-01"),
  "2026 Haziran–"
);

const out = path.join(process.cwd(), ".cache", "ptf", `replay-${label}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    from,
    to,
    oracle: [...oracle],
    ids,
    results,
  })
);
console.log(`yazıldı: ${out}`);
process.exit(0);
