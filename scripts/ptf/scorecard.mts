/**
 * PTF motoru: ileriye dönük karne. Değişmeyen günlük kayıtları (data/pool/forecast-log/ptf) gerçekleşen PTF'yle karşılaştırır.
 * Yalnız kesimden önce yazılmış (`onTime`) kayıtlar sayılır; referans R2 (aynı sınıf son 28 gün ortancası) aynı günlerde,
 * aynı bilgi kuralıyla yeniden hesaplanır.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/scorecard.mts
 */

import { listPtfLogs, readPtfLog } from "@/lib/ptf/forecast-log-store";
import { baseline } from "@/lib/ptf/features";
import { PtfView, shiftDay } from "@/lib/ptf/history";
import { SCORECARD_MIN_DAYS, scoreDay, summarizeScores, type ScoredDay } from "@/lib/ptf/scorecard";
import { loadPtfHistory } from "@/lib/services/ptf-history";

const targets = await listPtfLogs();
if (!targets.length) {
  console.log("Henüz PTF tahmin kaydı yok.");
  process.exit(0);
}
const days = await loadPtfHistory(
  shiftDay(targets[0], -40),
  targets[targets.length - 1],
  { windForecast: false, gas: false }
);
let late = 0;
let pending = 0;
const scored: ScoredDay[] = [];
const shadow = new Map<string, number>();
for (const t of targets) {
  const log = await readPtfLog(t);
  if (!log) continue;
  if (!log.onTime) {
    late++;
    continue;
  }
  const actual = days.get(t)?.ptf;
  if (!actual) {
    pending++;
    continue;
  }
  const day = scoreDay(log, actual, baseline(new PtfView(days, t)));
  if (!day) continue;
  scored.push(day);
  for (const [id, p] of Object.entries(log.shadow ?? {}))
    shadow.set(
      id,
      (shadow.get(id) ?? 0) + p.reduce((x, v, h) => x + Math.abs(v - actual[h]), 0)
    );
}
const f0 = (v: number) => Math.round(v).toLocaleString("tr-TR");
const n = scored.length;
console.log(
  `PTF karnesi: ${targets.length} kayıt; skorlanan ${n} gün, kesimden sonra yazılmış ${late}, gerçekleşeni henüz yok ${pending}.`
);
const sum = summarizeScores(scored);
if (sum) {
  console.log(
    `MAE ${f0(sum.mae)} TL/MWh (referans R2 ${sum.refMae === null ? "—" : f0(sum.refMae)}${sum.vsRefPct === null ? "" : `, %${sum.vsRefPct.toFixed(1)} daha iyi`}); sapma ${f0(sum.bias)}; aralık kapsaması %${sum.coveragePct === null ? "—" : sum.coveragePct.toFixed(1)} (hedef %80).`
  );
  for (const [id, total] of Array.from(shadow))
    console.log(`gölge ${id}: MAE ${f0(total / (n * 24))} TL/MWh (ana ${f0(sum.mae)})`);
  if (n < SCORECARD_MIN_DAYS)
    console.log(`Not: ${n} gün az; karar için en az ${SCORECARD_MIN_DAYS}, tercihen 60 gün.`);
}
process.exit(0);
