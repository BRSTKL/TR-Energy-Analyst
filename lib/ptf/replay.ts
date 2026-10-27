/**
 * TR-Energy Analyst - PTF motoru: günlük yeniden oynatma ve skor (saf, I/O yok)
 *
 * `replay`: hedef günleri sırayla gezer, her modelden 24 saatlik tahmin alır (model kendi eğitimini yalnız geçmişle yapar)
 * ve gerçekleşenle karşılaştırır. Bir gün yalnız bütün modeller tahmin verdiyse ortak kümeye girer: modeller aynı
 * günlerde karşılaştırılır.
 * `compare`: iki modelin günlük MAE farkı; belirsizlik haftalık blok bootstrap (günler arası bağımlılık), 2.000 tekrar,
 * tohumlu. Fark ±2 standart hata (ya da %95 aralık 0'ı içeriyor) ise "fark gürültü içinde".
 */

import { H, type PtfDay } from "./history";
import type { PtfModel } from "./models";

export interface DayResult {
  day: string;
  actual: number[];
  /** model id → 24 saat */
  preds: Record<string, number[]>;
}

export function replay(
  models: PtfModel[],
  days: Map<string, PtfDay>,
  from: string,
  to: string
): DayResult[] {
  const out: DayResult[] = [];
  for (
    let t = from;
    t <= to;
    t = new Date(Date.parse(`${t}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  ) {
    const actual = days.get(t)?.ptf;
    const preds: Record<string, number[]> = {};
    let ok = !!actual && actual.length === H && actual.every((x) => Number.isFinite(x));
    for (const m of models) {
      const p = m.predict(t); // her model her gün çağrılır: yeniden kurma takvimi tutarlı kalsın
      if (!p || p.length !== H || p.some((x) => !Number.isFinite(x))) ok = false;
      else preds[m.id] = p;
    }
    if (ok) out.push({ day: t, actual: actual!, preds });
  }
  return out;
}

const mae = (a: number[], b: number[]) =>
  a.reduce((s, v, h) => s + Math.abs(v - b[h]), 0) / a.length;
const rmse = (a: number[], b: number[]) =>
  Math.sqrt(a.reduce((s, v, h) => s + (v - b[h]) ** 2, 0) / a.length);

export interface ModelScore {
  id: string;
  days: number;
  mae: number;
  rmse: number;
  /** Saat grupları: gece (0–6), öğle (10–15), akşam (17–21) */
  maeNight: number;
  maeNoon: number;
  maeEvening: number;
  /** Ortalama işaretli hata (tahmin − gerçek) */
  bias: number;
}

export function scoreModels(results: DayResult[], ids: string[]): ModelScore[] {
  return ids.map((id) => {
    const part = (hours: number[]) => {
      let s = 0;
      let n = 0;
      for (const r of results)
        for (const h of hours) ((s += Math.abs(r.preds[id][h] - r.actual[h])), n++);
      return n ? s / n : NaN;
    };
    let bias = 0;
    for (const r of results)
      for (let h = 0; h < H; h++) bias += r.preds[id][h] - r.actual[h];
    return {
      id,
      days: results.length,
      mae:
        results.reduce((s, r) => s + mae(r.preds[id], r.actual), 0) /
        Math.max(1, results.length),
      rmse: Math.sqrt(
        results.reduce((s, r) => s + rmse(r.preds[id], r.actual) ** 2, 0) /
          Math.max(1, results.length)
      ),
      maeNight: part([0, 1, 2, 3, 4, 5, 6]),
      maeNoon: part([10, 11, 12, 13, 14, 15]),
      maeEvening: part([17, 18, 19, 20, 21]),
      bias: bias / Math.max(1, results.length * H),
    };
  });
}

export interface Comparison {
  model: string;
  reference: string;
  days: number;
  /** Ortalama günlük MAE farkı (referans − model; pozitif = model iyi), TL/MWh */
  diff: number;
  /** %95 aralık (haftalık blok bootstrap) */
  lo: number;
  hi: number;
  /** MAE iyileşmesi (%) */
  improvementPct: number;
  betterDaysPct: number;
  verdict: "better" | "worse" | "noise";
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function compare(
  results: DayResult[],
  model: string,
  reference: string,
  reps = 2000,
  seed = 11
): Comparison {
  const diffs = results.map(
    (r) => mae(r.preds[reference], r.actual) - mae(r.preds[model], r.actual)
  );
  const refMae =
    results.reduce((s, r) => s + mae(r.preds[reference], r.actual), 0) /
    Math.max(1, results.length);
  const mean = diffs.reduce((s, x) => s + x, 0) / Math.max(1, diffs.length);
  // Haftalık bloklar
  const blocks: number[][] = [];
  for (let i = 0; i < diffs.length; i += 7) blocks.push(diffs.slice(i, i + 7));
  const r = rng(seed);
  const boots: number[] = [];
  for (let k = 0; k < reps; k++) {
    let s = 0;
    let n = 0;
    for (let b = 0; b < blocks.length; b++) {
      const blk = blocks[Math.floor(r() * blocks.length)];
      for (const x of blk) ((s += x), n++);
    }
    boots.push(n ? s / n : 0);
  }
  boots.sort((a, b) => a - b);
  const lo = boots[Math.floor(0.025 * (reps - 1))] ?? 0;
  const hi = boots[Math.ceil(0.975 * (reps - 1))] ?? 0;
  return {
    model,
    reference,
    days: diffs.length,
    diff: mean,
    lo,
    hi,
    improvementPct: refMae ? (mean / refMae) * 100 : 0,
    betterDaysPct: diffs.length
      ? (diffs.filter((x) => x > 0).length / diffs.length) * 100
      : 0,
    verdict: lo > 0 ? "better" : hi < 0 ? "worse" : "noise",
  };
}
