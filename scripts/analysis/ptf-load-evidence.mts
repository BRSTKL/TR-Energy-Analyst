/**
 * Kanıt: yarının fiyatını yorumlamak için hangi veri işe yarıyor? (27.10.2026, "yarın görünümü" planı için)
 *
 *   POOL_DIR=<havuz> npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/ptf-load-evidence.mts
 *
 * Her gün D için, D'den önceki 28 günün aynı gün sınıfındaki (hafta içi / hafta sonu / tatil) günlerinden saatlik referans:
 *   M0: saat bazında medyan PTF (panodaki referans bandının ortası)
 *   M1: M0 + b × (yük tahmini D − aynı günlerin medyan yük tahmini)   ← yarın 14:00'te bilinen
 *   M2: M0 + b × (net yük D − medyan net yük); net yük = yük tahmini − gerçekleşen rüzgâr − KGÜP güneşi ← YARIN BİLİNMEZ (üst sınır)
 * b, önceki aynı sınıf günlerinde saat sapmalarına en küçük kareler. Ölçü: ortalama mutlak hata (TL/MWh), günlerin yüzde kaçında
 * model M0'dan iyi. Ayrıca yük tahmininin (D-1'de yayımlanan) gerçekleşen tüketimden sapması. Yalnız doğrulanmış piyasa verisi (EPIAS, FILE).
 */

import { prisma } from "@/lib/prisma";
import { dayClass } from "@/lib/analysis/daily-market";
import { readSystemYear } from "@/lib/pool/system-store";

const HOURS = 24;
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
type Series = Array<number | null>;
const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const rows = await prisma.marketData.findMany({ where: { source: { in: ["EPIAS", "FILE"] } }, select: { timestamp: true, ptf: true }, orderBy: { timestamp: "asc" } });
const ptf = new Map<string, Series>();
for (const r of rows) {
  const d = r.timestamp.toISOString().slice(0, 10);
  if (!ptf.has(d)) ptf.set(d, Array(HOURS).fill(null));
  ptf.get(d)![r.timestamp.getUTCHours()] = r.ptf;
}
const docs = new Map<number, Awaited<ReturnType<typeof readSystemYear>>>();
for (const y of [2025, 2026]) docs.set(y, await readSystemYear(y));
const at = (series: Array<number | null> | undefined, doc: { start: string }, d: string, h: number) => {
  if (!series) return null;
  const i = (Date.parse(`${d}T00:00:00Z`) - Date.parse(doc.start)) / 3_600_000 + h;
  return series[i] ?? null;
};
interface Day { ptf: Series; lep: Series; nl: Series; nlK: Series; cons: Series; wind: Series; windK: Series }
const days = new Map<string, Day>();
for (const [d, p] of ptf) {
  const doc = docs.get(Number(d.slice(0, 4)));
  if (!doc || p.some((v) => v === null)) continue;
  const lep = Array.from({ length: HOURS }, (_, h) => at(doc.lep, doc, d, h));
  const cons = Array.from({ length: HOURS }, (_, h) => at(doc.consumption, doc, d, h));
  const wind = Array.from({ length: HOURS }, (_, h) => at(doc.rt?.wind, doc, d, h));
  const sun = Array.from({ length: HOURS }, (_, h) => at(doc.kgup?.sun, doc, d, h));
  if (lep.some((v) => v === null)) continue;
  const windK = Array.from({ length: HOURS }, (_, h) => at(doc.kgup?.wind, doc, d, h));
  const nl = lep.map((v, h) => (wind[h] === null || sun[h] === null ? null : v! - wind[h]! - sun[h]!));
  const nlK = lep.map((v, h) => (windK[h] === null || sun[h] === null ? null : v! - windK[h]! - sun[h]!));
  days.set(d, { ptf: p, lep, nl, nlK, cons, wind, windK });
}

const errs: Record<string, number[]> = { M0: [], M1: [], M2: [], M3: [] };
const peakHit: Record<string, number[]> = { M0: [], M1: [], M2: [], M3: [] };
const windErr: number[] = [];
const windVal: number[] = [];
const dayWin = { M1: 0, M2: 0, M3: 0, n: 0 };
const monthly = new Map<string, { m0: number[]; m1: number[]; m2: number[] }>();
const lepErr: number[] = [];
const lepBias: number[] = [];
for (const [d, cur] of days) {
  if (cur.cons.every((v) => v !== null)) {
    for (let h = 0; h < HOURS; h++) {
      lepErr.push(Math.abs(cur.lep[h]! - cur.cons[h]!) / cur.cons[h]!);
      lepBias.push((cur.lep[h]! - cur.cons[h]!) / cur.cons[h]!);
    }
  }
  const cls = dayClass(d);
  const prior: Day[] = [];
  for (let i = 1; i <= 28; i++) {
    const p = shiftDay(d, -i);
    const x = days.get(p);
    if (x && dayClass(p) === cls && x.nl.every((v) => v !== null)) prior.push(x);
  }
  if (prior.length < 4 || cur.nl.some((v) => v === null) || cur.nlK.some((v) => v === null)) continue;
  for (let h = 0; h < HOURS; h++) { windErr.push(Math.abs(cur.windK[h]! - cur.wind[h]!)); windVal.push(cur.wind[h]!); }
  const med = (f: (x: Day) => Series) => Array.from({ length: HOURS }, (_, h) => median(prior.map((x) => f(x)[h]!)));
  const mP = med((x) => x.ptf);
  const mL = med((x) => x.lep);
  const mN = med((x) => x.nl);
  const fit = (f: (x: Day) => Series, m: number[]) => {
    let sxy = 0;
    let sxx = 0;
    for (const x of prior) for (let h = 0; h < HOURS; h++) {
      const dx = f(x)[h]! - m[h];
      sxy += dx * (x.ptf[h]! - mP[h]);
      sxx += dx * dx;
    }
    return sxx > 0 ? sxy / sxx : 0;
  };
  const b1 = fit((x) => x.lep, mL);
  const b2 = fit((x) => x.nl, mN);
  const priorK = prior.filter((x) => x.nlK.every((v) => v !== null));
  const mNK = Array.from({ length: HOURS }, (_, h) => median(priorK.map((x) => x.nlK[h]!)));
  let sxy3 = 0, sxx3 = 0;
  for (const x of priorK) for (let h = 0; h < HOURS; h++) { const dx = x.nlK[h]! - mNK[h]; sxy3 += dx * (x.ptf[h]! - mP[h]); sxx3 += dx * dx; }
  const b3 = sxx3 > 0 ? sxy3 / sxx3 : 0;
  let e0 = 0;
  let e1 = 0;
  let e2 = 0;
  for (let h = 0; h < HOURS; h++) {
    const a = cur.ptf[h]!;
    e0 += Math.abs(a - mP[h]);
    e1 += Math.abs(a - (mP[h] + b1 * (cur.lep[h]! - mL[h])));
    e2 += Math.abs(a - (mP[h] + b2 * (cur.nl[h]! - mN[h])));
  }
  let e3 = 0;
  const pred: Record<string, number[]> = { M0: [], M1: [], M2: [], M3: [] };
  for (let h = 0; h < HOURS; h++) {
    e3 += Math.abs(cur.ptf[h]! - (mP[h] + b3 * (cur.nlK[h]! - mNK[h])));
    pred.M0.push(mP[h]);
    pred.M1.push(mP[h] + b1 * (cur.lep[h]! - mL[h]));
    pred.M2.push(mP[h] + b2 * (cur.nl[h]! - mN[h]));
    pred.M3.push(mP[h] + b3 * (cur.nlK[h]! - mNK[h]));
  }
  const argmax = (a: number[]) => a.indexOf(Math.max(...a));
  const actualPeak = argmax(cur.ptf as number[]);
  for (const k of Object.keys(pred)) peakHit[k].push(Math.abs(argmax(pred[k]) - actualPeak) <= 1 ? 1 : 0);
  e0 /= HOURS; e1 /= HOURS; e2 /= HOURS; e3 /= HOURS;
  errs.M0.push(e0); errs.M1.push(e1); errs.M2.push(e2); errs.M3.push(e3);
  if (e3 < e0) dayWin.M3++;
  dayWin.n++;
  if (e1 < e0) dayWin.M1++;
  if (e2 < e0) dayWin.M2++;
  const mo = d.slice(0, 7);
  if (!monthly.has(mo)) monthly.set(mo, { m0: [], m1: [], m2: [] });
  const m = monthly.get(mo)!;
  m.m0.push(e0); m.m1.push(e1); m.m2.push(e2);
}
const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const nf0 = (x: number) => x.toFixed(0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Gün: ${dayWin.n} (doğrulanmış PTF + yük tahmini + gerçek zamanlı rüzgâr + KGÜP güneşi olan, ≥ 4 benzer gün)`);
for (const k of ["M0", "M1", "M2", "M3"]) console.log(`${k} ortalama mutlak hata: ${avg(errs[k]).toFixed(0)} TL/MWh (medyan günlük ${median(errs[k]).toFixed(0)})`);
console.log(`M1, M0'dan iyi gün oranı: ${pct(dayWin.M1 / dayWin.n)}; M1 iyileşme ${pct(1 - avg(errs.M1) / avg(errs.M0))}`);
console.log(`M2, M0'dan iyi gün oranı: ${pct(dayWin.M2 / dayWin.n)}; M2 iyileşme ${pct(1 - avg(errs.M2) / avg(errs.M0))}`);
console.log(`M3 (KGÜP rüzgâr + KGÜP güneş planı ile net yük) iyileşme ${pct(1 - avg(errs.M3) / avg(errs.M0))}, M0'dan iyi gün oranı ${pct(dayWin.M3 / dayWin.n)}`);
console.log("Günün en pahalı saatini ±1 saatle bulma oranı: " + ["M0", "M1", "M2", "M3"].map((k) => `${k} ${pct(avg(peakHit[k]))}`).join(", "));
console.log(`KGÜP rüzgâr planı - gerçek zamanlı rüzgâr: ortalama mutlak ${nf0(avg(windErr))} MW (ortalama rüzgâr ${nf0(avg(windVal))} MW, ${pct(avg(windErr) / avg(windVal))})`);
console.log("Ay bazında (M0 / M1 / M2 ortalama mutlak hata):");
for (const [mo, v] of Array.from(monthly).sort()) console.log(`  ${mo} n=${String(v.m0.length).padStart(2)}  ${avg(v.m0).toFixed(0).padStart(5)} / ${avg(v.m1).toFixed(0).padStart(5)} / ${avg(v.m2).toFixed(0).padStart(5)}`);
console.log(`Yük tahmini - gerçekleşen tüketim: ortalama mutlak sapma ${pct(avg(lepErr))}, eğilim ${pct(avg(lepBias))} (${lepErr.length} saat)`);

// Akşam rampası ve fiyat farkı: gerçekleşen net yükte (yük tahmini - rüzgâr - KGÜP güneşi) en büyük 3 saatlik yükseliş (15-22)
// ile ortalama PTF(18-21) - ortalama PTF(11-14) arasındaki ilişki; günlük ortalama net yük ile günlük ortalama PTF ilişkisi
const corr = (a: number[], b: number[]) => {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return s / Math.sqrt(sa * sb);
};
const ramp: number[] = [];
const spread: number[] = [];
const lvlN: number[] = [];
const lvlP: number[] = [];
for (const [, x] of days) {
  if (x.nl.some((v) => v === null)) continue;
  let best = -Infinity;
  for (let t = 15; t <= 19; t++) best = Math.max(best, x.nl[t + 3]! - x.nl[t]!);
  const m = (s: Series, a: number, b: number) => s.slice(a, b + 1).reduce((u, v) => u + v!, 0) / (b - a + 1);
  ramp.push(best);
  spread.push(m(x.ptf, 18, 21) - m(x.ptf, 11, 14));
  lvlN.push(m(x.nl, 0, 23));
  lvlP.push(m(x.ptf, 0, 23));
}
console.log(`Akşam rampası ile (PTF 18-21 - PTF 11-14) korelasyonu: ${corr(ramp, spread).toFixed(2)} (${ramp.length} gün)`);
console.log(`Günlük ortalama net yük ile günlük ortalama PTF korelasyonu: ${corr(lvlN, lvlP).toFixed(2)}`);

// ------------------------------------------------------------------ Birleşim: dünkü fiyat artığı + net yük
// Artık: günün PTF'si - o günün referansı (önceki 28 günün aynı sınıf medyanı). Model (hepsi yalnız önceki günlerle uydurulur):
//   P(h) = referans(h) + k × dünkü artık(h) + b × (net yük(h) - net yük medyanı(h)); katsayılar önceki aynı sınıf günlerinde 2 değişkenli EKK.
// Net yük: KGÜP rüzgâr + KGÜP güneş planıyla (nlK) ve gerçekleşen rüzgârla (nl, üst sınır).
const baseMemo = new Map<string, { mP: number[]; mNK: number[]; mN: number[] } | null>();
const baseOf = (d: string) => {
  if (baseMemo.has(d)) return baseMemo.get(d)!;
  const cls = dayClass(d);
  const prior: Day[] = [];
  for (let i = 1; i <= 28; i++) { const p = shiftDay(d, -i); const x = days.get(p); if (x && dayClass(p) === cls && x.nl.every((v) => v !== null) && x.nlK.every((v) => v !== null)) prior.push(x); }
  const r = prior.length < 4 ? null : { mP: Array.from({ length: HOURS }, (_, h) => median(prior.map((x) => x.ptf[h]!))), mNK: Array.from({ length: HOURS }, (_, h) => median(prior.map((x) => x.nlK[h]!))), mN: Array.from({ length: HOURS }, (_, h) => median(prior.map((x) => x.nl[h]!))) };
  baseMemo.set(d, r);
  return r;
};
const resid = (d: string): number[] | null => { const b = baseOf(d), x = days.get(d); return b && x ? x.ptf.map((v, h) => v! - b.mP[h]) : null; };
const ols = (rows: Array<{ x: number[]; y: number }>) => {
  const k = rows[0].x.length;
  const A = Array.from({ length: k }, () => Array(k).fill(0));
  const B = Array(k).fill(0);
  for (const r of rows) for (let i = 0; i < k; i++) { B[i] += r.x[i] * r.y; for (let j = 0; j < k; j++) A[i][j] += r.x[i] * r.x[j]; }
  if (k === 1) return [A[0][0] > 0 ? B[0] / A[0][0] : 0];
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  return det === 0 ? [0, 0] : [(B[0] * A[1][1] - B[1] * A[0][1]) / det, (A[0][0] * B[1] - A[1][0] * B[0]) / det];
};
const names = ["M0 referans", "dünkü artık", "net yük (KGÜP)", "dünkü artık + net yük (KGÜP)", "net yük (gerçekleşen)", "dünkü artık + net yük (gerçekleşen)"];
const cErr = names.map(() => [] as number[]);
const cWin = names.map(() => 0);
const cPeak = names.map(() => [] as number[]);
const cMonth = new Map<string, number[][]>();
const predStore = new Map<string, { pred: number[][]; act: number[] }>();
let cn = 0;
for (const [d, cur] of days) {
  const b = baseOf(d);
  const r1 = resid(shiftDay(d, -1));
  if (!b || !r1 || cur.nl.some((v) => v === null) || cur.nlK.some((v) => v === null)) continue;
  const cls = dayClass(d);
  const train: Array<{ d: string; x: Day; res1: number[] }> = [];
  for (let i = 1; i <= 28; i++) { const p = shiftDay(d, -i); const x = days.get(p); const rr = resid(shiftDay(p, -1)); if (x && rr && dayClass(p) === cls && x.nl.every((v) => v !== null) && x.nlK.every((v) => v !== null)) train.push({ d: p, x, res1: rr }); }
  if (train.length < 4) continue;
  const rows = (nlKey: "nlK" | "nl", mKey: "mNK" | "mN", withRes: boolean, withNl: boolean) =>
    train.flatMap(({ x, res1 }) => Array.from({ length: HOURS }, (_, h) => ({ x: [...(withRes ? [res1[h]] : []), ...(withNl ? [x[nlKey][h]! - b[mKey][h]] : [])], y: x.ptf[h]! - b.mP[h] })));
  const coef = [
    [],
    ols(rows("nlK", "mNK", true, false)),
    ols(rows("nlK", "mNK", false, true)),
    ols(rows("nlK", "mNK", true, true)),
    ols(rows("nl", "mN", false, true)),
    ols(rows("nl", "mN", true, true)),
  ];
  const feats = (i: number, h: number) =>
    i === 0 ? [] : i === 1 ? [r1[h]] : i === 2 ? [cur.nlK[h]! - b.mNK[h]] : i === 3 ? [r1[h], cur.nlK[h]! - b.mNK[h]] : i === 4 ? [cur.nl[h]! - b.mN[h]] : [r1[h], cur.nl[h]! - b.mN[h]];
  const mae: number[] = [];
  const peak: number[] = [];
  const preds: number[][] = [];
  const actualPeak = (cur.ptf as number[]).indexOf(Math.max(...(cur.ptf as number[])));
  for (let i = 0; i < names.length; i++) {
    const pred = Array.from({ length: HOURS }, (_, h) => b.mP[h] + feats(i, h).reduce((s, v, j) => s + coef[i][j] * v, 0));
    preds.push(pred);
    mae.push(pred.reduce((s, v, h) => s + Math.abs(cur.ptf[h]! - v), 0) / HOURS);
    peak.push(Math.abs(pred.indexOf(Math.max(...pred)) - actualPeak) <= 1 ? 1 : 0);
  }
  cn++;
  predStore.set(d, { pred: preds, act: cur.ptf as number[] });
  mae.forEach((v, i) => { cErr[i].push(v); if (i > 0 && v < mae[0]) cWin[i]++; cPeak[i].push(peak[i]); });
  const mo = d.slice(0, 7);
  if (!cMonth.has(mo)) cMonth.set(mo, names.map(() => []));
  mae.forEach((v, i) => cMonth.get(mo)![i].push(v));
}
console.log(`\nBirleşim (aynı ${cn} gün, hepsi yalnız önceki günlerle uydurulmuş):`);
names.forEach((n, i) => console.log(`  ${n.padEnd(40)} hata ${avg(cErr[i]).toFixed(0).padStart(4)} TL/MWh  iyileşme ${i === 0 ? "   –" : pct(1 - avg(cErr[i]) / avg(cErr[0])).padStart(6)}  referanstan iyi gün ${i === 0 ? "  –" : pct(cWin[i] / cn).padStart(6)}  pik saat ±1: ${pct(avg(cPeak[i]))}`));
console.log("  Ay bazında (referans / dünkü artık / net yük KGÜP / birleşim KGÜP):");
for (const [mo, v] of Array.from(cMonth).sort()) console.log(`    ${mo} n=${String(v[0].length).padStart(2)}  ${[0, 1, 2, 3].map((i) => avg(v[i]).toFixed(0).padStart(5)).join(" / ")}`);

// ------------------------------------------------------------------ ± aralık: geçmiş hatalardan saat bazında, kapsama sınaması
// Gün d için aralık: önceki 60 günün (hata = gerçek - tahmin) aynı saat değerlerinin %10 ve %90 (ya da %5-%95) yüzdelikleri. Sınama: gerçek
// fiyat aralığın içinde kalıyor mu (hedef %80 / %90), aralık ne kadar geniş.
const quant = (v: number[], q: number) => { const a = [...v].sort((x, y) => x - y); const pos = (a.length - 1) * q; const lo = Math.floor(pos); return a[lo] + (a[Math.ceil(pos)] - a[lo]) * (pos - lo); };
for (const [mi, label] of [[0, "referans (benzer gün ortancası)"], [3, "dünkü artık + net yük (KGÜP)"]] as const) {
  const dates = Array.from(predStore.keys()).sort();
  let n = 0, in80 = 0, in90 = 0, w80 = 0;
  const byMonth = new Map<string, { n: number; in80: number; w: number }>();
  for (let i = 60; i < dates.length; i++) {
    const d = dates[i];
    if (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${dates[i - 60]}T00:00:00Z`) > 75 * 86_400_000) continue;
    const cur = predStore.get(d)!;
    for (let h = 0; h < HOURS; h++) {
      const errs = dates.slice(i - 60, i).map((x) => predStore.get(x)!.act[h] - predStore.get(x)!.pred[mi][h]);
      const lo80 = cur.pred[mi][h] + quant(errs, 0.1), hi80 = cur.pred[mi][h] + quant(errs, 0.9);
      const lo90 = cur.pred[mi][h] + quant(errs, 0.05), hi90 = cur.pred[mi][h] + quant(errs, 0.95);
      const a = cur.act[h];
      n++; w80 += hi80 - lo80;
      if (a >= lo80 && a <= hi80) in80++;
      if (a >= lo90 && a <= hi90) in90++;
      const mo = d.slice(0, 7);
      const e = byMonth.get(mo) ?? { n: 0, in80: 0, w: 0 };
      e.n++; e.w += hi80 - lo80; if (a >= lo80 && a <= hi80) e.in80++;
      byMonth.set(mo, e);
    }
  }
  console.log(`\n${label}: saat ${n}; %80 aralığın kapsaması ${pct(in80 / n)} (hedef %80), ortalama genişlik ${nf0(w80 / n)} TL/MWh (±${nf0(w80 / n / 2)}); %90 aralığın kapsaması ${pct(in90 / n)} (hedef %90)`);
  if (mi === 3) {
    console.log("  Ay bazında %80 aralık kapsaması / genişlik:");
    for (const [mo, e] of Array.from(byMonth).sort()) console.log(`    ${mo}  ${pct(e.in80 / e.n).padStart(6)} / ${nf0(e.w / e.n).padStart(5)}`);
  }
}
await prisma.$disconnect();
