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
let n = 0;
let late = 0;
let pending = 0;
let sumM = 0;
let sumR = 0;
let bias = 0;
let inside = 0;
let banded = 0;
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
  const ref = baseline(new PtfView(days, t));
  n++;
  for (const h of log.hours) {
    sumM += Math.abs(h.p50 - actual[h.hour]);
    bias += h.p50 - actual[h.hour];
    if (ref) sumR += Math.abs(ref[h.hour] - actual[h.hour]);
    if (h.q10 !== null && h.q90 !== null) {
      banded++;
      if (actual[h.hour] >= h.q10 && actual[h.hour] <= h.q90) inside++;
    }
  }
}
const f0 = (v: number) => Math.round(v).toLocaleString("tr-TR");
console.log(
  `PTF karnesi: ${targets.length} kayıt; skorlanan ${n} gün, kesimden sonra yazılmış ${late}, gerçekleşeni henüz yok ${pending}.`
);
if (n) {
  const m = sumM / (n * 24);
  const r = sumR / (n * 24);
  console.log(
    `MAE ${f0(m)} TL/MWh (referans R2 ${f0(r)}, %${(((r - m) / r) * 100).toFixed(1)} daha iyi); sapma ${f0(bias / (n * 24))}; aralık kapsaması %${banded ? ((inside / banded) * 100).toFixed(1) : "—"} (hedef %80).`
  );
  if (n < 30) console.log(`Not: ${n} gün az; karar için en az 30, tercihen 60 gün.`);
}
process.exit(0);
