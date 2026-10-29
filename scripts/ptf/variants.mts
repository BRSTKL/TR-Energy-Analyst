/**
 * PTF motoru: hidro ve güneş deneylerinin karşılaştırması (yalnız okur; replay çıktıları üstünde).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/variants.mts [--base v0] [--labels v1-hidro,v2-sundef,...]
 *
 * Her sürüm için tarifler (ENS-ortalama = LEAR + GBM, ENS3 = LEAR + GBM + HYB, HYB, LEAR, GBM) üç dönemde ölçülür:
 *   yeni   2025-01 – 2025-06 (ayar seçiminde hiç kullanılmamıştı)
 *   secim  2025-07 – 2026-03 (SEÇİM: kazananı yalnız bu dönem belirler)
 *   sinama 2026-04 – 2026-10 (yalnız rapor; bu oturumda önceden de bakılmıştı)
 * Taban: --base sürümünün ENS-ortalama'sı. Fark ve %95 aralık: haftalık blok bootstrap (2.000 tekrar). Ardından her adayın
 * üstüne günlük seviye düzeltmesi (γ yalnız seçim döneminde seçilir, lib/ptf/level.ts) ve birleşik sonuç.
 */

import fs from "node:fs";
import path from "node:path";
import { correctLevel } from "@/lib/ptf/level";
import { compare, type DayResult } from "@/lib/ptf/replay";

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const baseLabel = arg("base", "v0");
const labels = arg("labels", "v1-hidro,v2-sundef,v3-hidro-sundef,v4-sunfix,v5-sunfix-hidro,v6-taban").split(",");
const load = (l: string) =>
  (
    JSON.parse(
      fs.readFileSync(path.join(process.cwd(), ".cache", "ptf", `replay-${l}.json`), "utf8")
    ) as { results: DayResult[] }
  ).results;
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const f0 = (x: number) => Math.round(x).toLocaleString("tr-TR");
const PERIODS = [
  { id: "yeni", from: "2025-01-01", to: "2025-06-30" },
  { id: "secim", from: "2025-07-01", to: "2026-03-31" },
  { id: "sinama", from: "2026-04-01", to: "2026-10-31" },
] as const;
const RECIPES = ["ENS-ortalama", "ENS-seviye", "ENS3", "HYB", "LEAR-ridge", "GBM"];
const inP = (rs: DayResult[], p: { from: string; to: string }) =>
  rs.filter((r) => r.day >= p.from && r.day <= p.to);
const maeOf = (rs: DayResult[], m: string) =>
  rs.length ? mean(rs.flatMap((r) => r.actual.map((a, h) => Math.abs(r.preds[m][h] - a)))) : NaN;

const baseRes = load(baseLabel);
const baseByDay = new Map(baseRes.map((r) => [r.day, r]));

/** Aday (sürüm + tarif) ile taban aynı günlerde: iki "model" içeren DayResult listesi */
const paired = (cand: DayResult[], recipe: string): DayResult[] =>
  cand
    .filter((r) => baseByDay.has(r.day) && r.preds[recipe])
    .map((r) => ({
      day: r.day,
      actual: r.actual,
      preds: { base: baseByDay.get(r.day)!.preds["ENS-ortalama"], cand: r.preds[recipe] },
    }));

const row = (name: string, rs: DayResult[], recipe: string) => {
  const cells = PERIODS.map((p) => {
    const part = paired(inP(rs, p), recipe);
    if (!part.length) return "      –      ";
    const c = compare(part, "cand", "base");
    return `${f0(maeOf(part, "cand")).padStart(4)} (${c.improvementPct >= 0 ? "+" : "−"}${Math.abs(c.improvementPct).toFixed(1)}%${c.verdict === "better" ? "✓" : c.verdict === "worse" ? "✗" : " "})`;
  });
  console.log(`  ${name.padEnd(30)} ${cells.join("  ")}`);
};

console.log(
  `Taban: ${baseLabel} ENS-ortalama. Hücre: MAE (tabana göre %, ✓ = %95 aralık tabandan iyi, ✗ = kötü).\n`
);
console.log(`  ${"sürüm / tarif".padEnd(30)} ${PERIODS.map((p) => p.id.padEnd(13)).join("  ")}`);
const all = new Map<string, DayResult[]>([[baseLabel, baseRes]]);
for (const l of labels) {
  try {
    all.set(l, load(l));
  } catch {
    console.log(`  (${l}: replay çıktısı yok)`);
  }
}
for (const [l, rs] of all) {
  const nDays = rs.length;
  console.log(`\n[${l}] ${nDays} gün`);
  for (const rec of RECIPES) if (rs[0]?.preds[rec]) row(`${l} ${rec}`, rs, rec);
}

// ---- seviye düzeltmesi: her aday için γ yalnız seçim döneminde
console.log("\n== + günlük seviye düzeltmesi (γ seçim döneminde seçilir) ==");
const GAMMAS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
for (const [l, rs] of all) {
  for (const rec of ["ENS-ortalama", "ENS3"]) {
    if (!rs[0]?.preds[rec]) continue;
    let best = { g: 0, mae: Infinity };
    for (const g of GAMMAS) {
      const m = maeOf(inP(correctLevel(rs, rec, "COR", g), PERIODS[1]), "COR");
      if (Number.isFinite(m) && m < best.mae - 1e-9) best = { g, mae: m };
    }
    const cor = correctLevel(rs, rec, "COR", best.g);
    row(`${l} ${rec} + düzeltme γ=${best.g}`, cor, "COR");
  }
}
