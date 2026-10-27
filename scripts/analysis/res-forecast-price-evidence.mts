/**
 * Kanıt: EPİAŞ'ın sistem geneli rüzgâr tahmini (/renewables/data/res-generation-and-forecast, 15 dakikalık üretim ve tahmin) fiyat
 * okumasına ne katıyor? (27.10.2026) Tahmin geçmişi yalnız 2026 Mayıs'tan itibaren dolu.
 *
 *   POOL_DIR=<havuz> npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/res-forecast-price-evidence.mts <saatlik.json>
 *
 * <saatlik.json> [ilk gün]: ilk gün verilirse yalnız ondan sonraki günler değerlendirilir (EPİAŞ tahmin serisinin tanımı 2026 Mayıs öncesinde farklı: gerçekleşen üretimi gerçek zamanlı rüzgârla tutmuyor; 2026-06-01 kullanın). [[saat ISO, gerçekleşen MW, tahmin MW], ...] (15 dakikalıklar saatlik ortalamaya çevrilmiş). Her gün için, yalnız
 * önceki günlerle uydurulan modeller: referans (önceki 28 günün aynı sınıf medyanı), dünkü artık, EPİAŞ rüzgâr tahminli net yük
 * (net yük = yük tahmini − rüzgâr tahmini − güneş vekili; güneş vekili önceki 7 günün aynı saat KGÜP güneş medyanı, çünkü yarının
 * KGÜP'ü sorulamıyor), ikisinin birleşimi; KGÜP rüzgârla ve gerçekleşen rüzgârla üst sınırlar. Ölçü: saatlik ortalama mutlak hata.
 */

import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { dayClass } from "@/lib/analysis/daily-market";
import { readSystemYear } from "@/lib/pool/system-store";

const H = 24;
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const rows = await prisma.marketData.findMany({ where: { source: { in: ["EPIAS", "FILE"] } }, select: { timestamp: true, ptf: true }, orderBy: { timestamp: "asc" } });
const ptf = new Map<string, number[]>();
for (const r of rows) { const d = r.timestamp.toISOString().slice(0, 10); if (!ptf.has(d)) ptf.set(d, Array(H).fill(NaN)); ptf.get(d)![r.timestamp.getUTCHours()] = r.ptf; }
const docs = new Map<number, any>();
for (const y of [2025, 2026]) docs.set(y, await readSystemYear(y));
const at = (s: any[] | undefined, doc: any, d: string, h: number) => (s ? s[(Date.parse(`${d}T00:00:00Z`) - Date.parse(doc.start)) / 3_600_000 + h] ?? null : null);
const fcRaw = JSON.parse(fs.readFileSync(process.argv[2], "utf8")) as Array<[string, number, number]>;
const fcMap = new Map<string, number>();
for (const [k, , f] of fcRaw) fcMap.set(k.slice(0, 13), f);
interface Day { ptf: number[]; lep: number[]; wind: number[]; windK: number[]; sunK: number[]; windF: number[] | null }
const days = new Map<string, Day>();
for (const [d, p] of ptf) {
  const doc = docs.get(Number(d.slice(0, 4)));
  if (!doc || p.some((v) => !Number.isFinite(v))) continue;
  const g = (s: any) => Array.from({ length: H }, (_, h) => at(s, doc, d, h));
  const lep = g(doc.lep), wind = g(doc.rt?.wind), windK = g(doc.kgup?.wind), sunK = g(doc.kgup?.sun);
  if ([lep, wind, windK, sunK].some((a) => a.some((v: any) => v === null))) continue;
  const wf = Array.from({ length: H }, (_, h) => fcMap.get(`${d}T${String(h).padStart(2, "0")}`) ?? null);
  days.set(d, { ptf: p, lep, wind, windK, sunK, windF: wf.every((v) => v !== null) ? (wf as number[]) : null });
}
const sunProxy = (d: string) => { const prev = Array.from({ length: 7 }, (_, i) => days.get(shift(d, -(i + 1)))).filter(Boolean) as Day[]; return prev.length >= 4 ? Array.from({ length: H }, (_, h) => median(prev.map((x) => x.sunK[h]))) : null; };
const nlReal = (d: string) => { const x = days.get(d), sp = sunProxy(d); return x && sp ? x.lep.map((v, h) => v - x.wind[h] - sp[h]) : null; };
const baseM = new Map<string, { mP: number[]; mN: number[] } | null>();
const baseOf = (d: string) => {
  if (baseM.has(d)) return baseM.get(d)!;
  const cls = dayClass(d);
  const pr: string[] = [];
  for (let i = 1; i <= 28; i++) { const p = shift(d, -i); if (days.has(p) && dayClass(p) === cls && nlReal(p)) pr.push(p); }
  const b = pr.length < 4 ? null : { mP: Array.from({ length: H }, (_, h) => median(pr.map((p) => days.get(p)!.ptf[h]))), mN: Array.from({ length: H }, (_, h) => median(pr.map((p) => nlReal(p)![h]))) };
  baseM.set(d, b);
  return b;
};
const resid = (d: string) => { const b = baseOf(d), x = days.get(d); return b && x ? x.ptf.map((v, h) => v - b.mP[h]) : null; };
const ols = (r: Array<{ x: number[]; y: number }>) => {
  const k = r[0].x.length;
  const A = Array.from({ length: k }, () => Array(k).fill(0)), B = Array(k).fill(0);
  for (const q of r) for (let i = 0; i < k; i++) { B[i] += q.x[i] * q.y; for (let j = 0; j < k; j++) A[i][j] += q.x[i] * q.x[j]; }
  if (k === 1) return [A[0][0] > 0 ? B[0] / A[0][0] : 0];
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  return det === 0 ? [0, 0] : [(B[0] * A[1][1] - B[1] * A[0][1]) / det, (A[0][0] * B[1] - A[1][0] * B[0]) / det];
};
const names = ["referans", "dünkü artık", "net yük: EPİAŞ rüzgâr tahmini + güneş vekili", "birleşim (dünkü artık + EPİAŞ tahminli net yük)", "net yük: KGÜP rüzgâr + gerçek KGÜP güneşi (D-1'de yok)", "net yük: gerçekleşen rüzgâr + güneş vekili (üst sınır)"];
const err = names.map(() => [] as number[]);
const win = names.map(() => 0);
let n = 0;
for (const [d, cur] of days) {
  if (!cur.windF || d < (process.argv[3] ?? "0000")) continue;
  const b = baseOf(d), r1 = resid(shift(d, -1)), sp = sunProxy(d);
  if (!b || !r1 || !sp) continue;
  const cls = dayClass(d);
  const train: string[] = [];
  for (let i = 1; i <= 56; i++) { const p = shift(d, -i); if (dayClass(p) === cls && baseOf(p) && nlReal(p) && resid(shift(p, -1))) train.push(p); }
  if (train.length < 6) continue;
  const mk = (withRes: boolean, withNl: boolean) => train.flatMap((p) => { const x = days.get(p)!, nl = nlReal(p)!, rr = resid(shift(p, -1))!; return Array.from({ length: H }, (_, h) => ({ x: [...(withRes ? [rr[h]] : []), ...(withNl ? [nl[h] - b.mN[h]] : [])], y: x.ptf[h] - b.mP[h] })); });
  const cR = ols(mk(true, false)), cN = ols(mk(false, true)), cB = ols(mk(true, true));
  const nlF = cur.lep.map((v, h) => v - cur.windF![h] - sp[h]);
  const nlK = cur.lep.map((v, h) => v - cur.windK[h] - cur.sunK[h]);
  const nlO = cur.lep.map((v, h) => v - cur.wind[h] - sp[h]);
  const preds = [
    b.mP,
    b.mP.map((m, h) => m + cR[0] * r1[h]),
    b.mP.map((m, h) => m + cN[0] * (nlF[h] - b.mN[h])),
    b.mP.map((m, h) => m + cB[0] * r1[h] + cB[1] * (nlF[h] - b.mN[h])),
    b.mP.map((m, h) => m + cN[0] * (nlK[h] - b.mN[h])),
    b.mP.map((m, h) => m + cN[0] * (nlO[h] - b.mN[h])),
  ];
  const mae = preds.map((p) => p.reduce((s, v, h) => s + Math.abs(cur.ptf[h] - v), 0) / H);
  n++;
  mae.forEach((v, i) => { err[i].push(v); if (i > 0 && v < mae[0]) win[i]++; });
}
const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
console.log(`Gün ${n} (EPİAŞ rüzgâr tahmini 24 saat dolu olan); katsayılar yalnız önceki günlerle`);
names.forEach((nm, i) => console.log(`  ${nm.padEnd(58)} ${avg(err[i]).toFixed(0).padStart(4)} TL/MWh  ${i === 0 ? "" : `iyileşme %${((1 - avg(err[i]) / avg(err[0])) * 100).toFixed(1)}  referanstan iyi gün %${((win[i] / n) * 100).toFixed(0)}`}`));
await prisma.$disconnect();
