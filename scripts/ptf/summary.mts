/**
 * PTF motoru: kayıtlı yeniden oynatma sonuçlarını (.cache/ptf/replay-<etiket>.json) seçim ve sınama dönemlerinde karşılaştırır.
 * Seçim (karar verilen) 2025-07-01 – 2026-03-31, sınama (yalnız rapor) 2026-04-01 – sonrası. Birleşim = LEAR ve GBM ortalaması.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/ptf/summary.mts etiket1 etiket2 …
 */

import fs from "node:fs";

const mae = (a: number[], b: number[]) =>
  a.reduce((s, v, h) => s + Math.abs(v - b[h]), 0) / a.length;
const PERIODS = [
  ["seçim", "2025-07-01", "2026-03-31"],
  ["sınama", "2026-04-01", "2099-12-31"],
  ["hepsi", "2000-01-01", "2099-12-31"],
] as const;

for (const label of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(`.cache/ptf/replay-${label}.json`, "utf8"));
  const cells: string[] = [];
  for (const [name, from, to] of PERIODS) {
    const rs = d.results.filter((r: { day: string }) => r.day >= from && r.day <= to);
    const m = (id: string) =>
      rs.reduce((s: number, r: { preds: Record<string, number[]>; actual: number[] }) => {
        const p =
          id === "ENS"
            ? r.preds["LEAR-ridge"].map((v, h) => (v + r.preds["GBM"][h]) / 2)
            : r.preds[id];
        return s + mae(p, r.actual);
      }, 0) / rs.length;
    cells.push(
      `${name} ${rs.length}g: R2 ${m("R2-sinif-ortancasi").toFixed(0)} LEAR ${m("LEAR-ridge").toFixed(0)} GBM ${m("GBM").toFixed(0)} ENS ${m("ENS").toFixed(1)}`
    );
  }
  console.log(label.padEnd(18), cells.join("  |  "));
}
