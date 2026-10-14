/**
 * TR-Energy Analyst - Sistem yönü ve makas tahmini: geçmişle sınama (Aşama 14.3)
 *
 * Her test ayı için model ve rakipler YALNIZ önceki `trainMonths` ayın satırlarıyla eğitilir, sonra o ay tahmin edilir
 * (walk-forward; proje geriye dönük testindeki TRAIN_MONTHS = 4 ile aynı düzen). Ölçüler:
 * - Yön: Brier skoru (düşük iyi), log-loss, isabet (eşik 0,5), kalibrasyon kutuları.
 * - Makas: ortalama mutlak hata (TL/MWh).
 *
 * Kapı (go/no-go): model örneklem dışında hem iklimden hem kalıcılıktan daha düşük Brier almalı VE test aylarının
 * yarısından fazlasında ikisinden de iyi olmalı. Geçemezse tahmin, karar testine (14.4) bağlanmaz.
 *
 * SAF fonksiyonlar: I/O yok.
 */

import { countIn } from "@/lib/format";
import { buildFeatureRows, type DirectionHour, type FeatureOptions, type FeatureRow, type InfoTime } from "@/lib/analysis/direction-features";
import { DEFAULT_LAMBDA, fitDirection, type DirectionPrediction } from "@/lib/analysis/direction-model";

export const DIRECTION_TRAIN_MONTHS = 4;
/** Eğitim penceresinde en az bu kadar satır yoksa ay test edilmez */
export const MIN_DIRECTION_TRAIN_ROWS = 1_000;

export type Forecaster = "model" | "climatology" | "persistence";
export const FORECASTERS: Forecaster[] = ["model", "climatology", "persistence"];

export interface ScoreSet {
  n: number;
  brier: number;
  logLoss: number;
  /** Eşik 0,5 ile doğru yön oranı */
  accuracy: number;
  /** Makas ortalama mutlak hatası, TL/MWh */
  spreadMae: number;
}

export interface MonthScores {
  month: string;
  /** Gerçekleşen açık oranı */
  deficitRate: number;
  scores: Record<Forecaster, ScoreSet>;
}

export interface CalibrationBin {
  /** "%0–10" … "%90–100" */
  label: string;
  n: number;
  meanPredicted: number;
  observedRate: number;
}

export interface DirectionGate {
  beatsClimatology: boolean;
  beatsPersistence: boolean;
  /** Modelin hem iklimden hem kalıcılıktan iyi olduğu test ayı */
  monthsBetterThanBoth: number;
  testMonths: number;
  passed: boolean;
  /** Tek cümlelik sonuç */
  verdict: string;
}

export interface DirectionBacktest {
  infoTime: InfoTime;
  /** Kullanılan dış girdiler (boş: yalnız piyasa verisi) */
  externalInputs: string[];
  trainMonths: number;
  lambda: number;
  months: MonthScores[];
  total: MonthScores;
  calibration: CalibrationBin[];
  gate: DirectionGate;
  /** Model girdisi kurulamayan saatler */
  excluded: { balancedHours: number; insufficientHistory: number };
  predictions: DirectionPrediction[];
}

const P_CLIP = 1e-4;

const prob = (p: DirectionPrediction, f: Forecaster) => (f === "model" ? p.model : f === "climatology" ? p.climatology : p.persistence);
const spreadOf = (p: DirectionPrediction, f: Forecaster) =>
  f === "model" ? p.modelSpread : f === "climatology" ? p.climatologySpread : p.persistenceSpread;

export function scoreSet(preds: DirectionPrediction[], f: Forecaster): ScoreSet {
  if (preds.length === 0) return { n: 0, brier: NaN, logLoss: NaN, accuracy: NaN, spreadMae: NaN };
  let brier = 0;
  let logLoss = 0;
  let correct = 0;
  let mae = 0;
  for (const p of preds) {
    const q = Math.min(1 - P_CLIP, Math.max(P_CLIP, prob(p, f)));
    brier += (q - p.y) ** 2;
    logLoss += -(p.y * Math.log(q) + (1 - p.y) * Math.log(1 - q));
    if ((q >= 0.5 ? 1 : 0) === p.y) correct++;
    mae += Math.abs(spreadOf(p, f) - p.spread);
  }
  const n = preds.length;
  return { n, brier: brier / n, logLoss: logLoss / n, accuracy: correct / n, spreadMae: mae / n };
}

function monthScores(month: string, preds: DirectionPrediction[]): MonthScores {
  const scores = Object.fromEntries(FORECASTERS.map((f) => [f, scoreSet(preds, f)])) as Record<Forecaster, ScoreSet>;
  return { month, deficitRate: preds.length ? preds.reduce((s, p) => s + p.y, 0) / preds.length : NaN, scores };
}

export function calibrationBins(preds: DirectionPrediction[], bins = 10): CalibrationBin[] {
  const acc = Array.from({ length: bins }, () => ({ n: 0, sumP: 0, sumY: 0 }));
  for (const p of preds) {
    const i = Math.min(bins - 1, Math.floor(p.model * bins));
    acc[i].n++;
    acc[i].sumP += p.model;
    acc[i].sumY += p.y;
  }
  const step = 100 / bins;
  return acc.map((a, i) => ({
    label: `%${i * step}–${(i + 1) * step}`,
    n: a.n,
    meanPredicted: a.n ? a.sumP / a.n : NaN,
    observedRate: a.n ? a.sumY / a.n : NaN,
  }));
}

const addMonths = (month: string, by: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

const pct = (v: number) => `%${(v * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

export function directionGate(months: MonthScores[], total: MonthScores): DirectionGate {
  const s = total.scores;
  const beatsClimatology = s.model.brier < s.climatology.brier;
  const beatsPersistence = s.model.brier < s.persistence.brier;
  const monthsBetterThanBoth = months.filter(
    (m) => m.scores.model.brier < m.scores.climatology.brier && m.scores.model.brier < m.scores.persistence.brier
  ).length;
  const testMonths = months.length;
  const passed = testMonths > 0 && beatsClimatology && beatsPersistence && monthsBetterThanBoth * 2 > testMonths;
  const best = Math.min(s.climatology.brier, s.persistence.brier);
  const gain = best > 0 ? (best - s.model.brier) / best : 0;
  const verdict = passed
    ? `Model ${testMonths} test ayının ${countIn(monthsBetterThanBoth)} iki rakipten de iyi; Brier en iyi rakibe göre ${pct(gain)} düşük.`
    : testMonths === 0
      ? "Test edilecek ay yok."
      : `Model rakipleri yenemedi (Brier: model ${s.model.brier.toFixed(3)}, iklim ${s.climatology.brier.toFixed(3)}, kalıcılık ${s.persistence.brier.toFixed(3)}; ${testMonths} ayın ${countIn(monthsBetterThanBoth)} ikisinden de iyi).`;
  return { beatsClimatology, beatsPersistence, monthsBetterThanBoth, testMonths, passed, verdict };
}

export interface DirectionBacktestOptions {
  infoTime: InfoTime;
  trainMonths?: number;
  lambda?: number;
  /** Bu aydan önceki aylar test edilmez (eğitimde kullanılabilir), "YYYY-AA" */
  fromMonth?: string;
  /** Bu aydan sonraki aylar test edilmez, "YYYY-AA" */
  toMonth?: string;
  /** Dış girdiler (ör. arızalı kapasite) */
  features?: FeatureOptions;
}

/** Hazır satırlarla walk-forward tahminler (karar testi de bunu kullanır) */
export function walkForwardPredictions(
  rows: FeatureRow[],
  opts: { trainMonths?: number; lambda?: number; fromMonth?: string; toMonth?: string } = {}
): DirectionPrediction[] {
  const trainMonths = opts.trainMonths ?? DIRECTION_TRAIN_MONTHS;
  const byMonth = new Map<string, FeatureRow[]>();
  for (const r of rows) {
    const list = byMonth.get(r.month) ?? [];
    list.push(r);
    byMonth.set(r.month, list);
  }
  const out: DirectionPrediction[] = [];
  for (const month of [...byMonth.keys()].sort()) {
    if (opts.fromMonth && month < opts.fromMonth) continue;
    if (opts.toMonth && month > opts.toMonth) continue;
    const train: FeatureRow[] = [];
    for (let i = trainMonths; i >= 1; i--) train.push(...(byMonth.get(addMonths(month, -i)) ?? []));
    if (train.length < MIN_DIRECTION_TRAIN_ROWS) continue;
    const fitted = fitDirection(train, opts.lambda ?? DEFAULT_LAMBDA);
    for (const r of byMonth.get(month)!) out.push(fitted.predict(r));
  }
  return out;
}

export function runDirectionBacktest(hours: DirectionHour[], opts: DirectionBacktestOptions): DirectionBacktest {
  const trainMonths = opts.trainMonths ?? DIRECTION_TRAIN_MONTHS;
  const lambda = opts.lambda ?? DEFAULT_LAMBDA;
  const built = buildFeatureRows(hours, opts.infoTime, opts.features);
  const predictions = walkForwardPredictions(built.rows, { trainMonths, lambda, fromMonth: opts.fromMonth, toMonth: opts.toMonth });

  const byMonth = new Map<string, DirectionPrediction[]>();
  for (const p of predictions) {
    const list = byMonth.get(p.month) ?? [];
    list.push(p);
    byMonth.set(p.month, list);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, preds]) => monthScores(m, preds));
  const total = monthScores("toplam", predictions);
  return {
    infoTime: opts.infoTime,
    externalInputs: opts.features?.outage ? ["outage"] : [],
    trainMonths,
    lambda,
    months,
    total,
    calibration: calibrationBins(predictions),
    gate: directionGate(months, total),
    excluded: { balancedHours: built.balancedHours, insufficientHistory: built.insufficientHistory },
    predictions,
  };
}

export interface PairedComparison {
  /** İki tahminin de olduğu saat */
  n: number;
  brierBase: number;
  brierWith: number;
  /** (taban − yeni) / taban: pozitif = yeni girdi iyileştirdi */
  improvement: number;
  /** Ay ay Brier farkı (taban − yeni); pozitif = yeni iyi */
  months: Array<{ month: string; n: number; diff: number }>;
  monthsBetter: number;
  /** Aylık farkların ortalaması / standart hatası (ay sayısı küçükse kaba bir ölçü) */
  tStat: number;
}

/**
 * Aynı saatlerde iki model tahmininin (ör. dış girdisiz ve girdili) Brier karşılaştırması. Yalnız iki tarafta da tahmini
 * olan saatler sayılır; aylık farklar eşleştirilmiştir.
 */
export function pairedComparison(base: DirectionPrediction[], withInput: DirectionPrediction[]): PairedComparison {
  const b = new Map(base.map((p) => [p.t, p]));
  const pairs = withInput.filter((p) => b.has(p.t)).map((p) => ({ month: p.month, y: p.y, base: b.get(p.t)!.model, with: p.model }));
  const byMonth = new Map<string, { n: number; sb: number; sw: number }>();
  let sb = 0;
  let sw = 0;
  for (const p of pairs) {
    const eb = (p.base - p.y) ** 2;
    const ew = (p.with - p.y) ** 2;
    sb += eb;
    sw += ew;
    const m = byMonth.get(p.month) ?? { n: 0, sb: 0, sw: 0 };
    m.n++;
    m.sb += eb;
    m.sw += ew;
    byMonth.set(p.month, m);
  }
  const months = [...byMonth.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([month, m]) => ({ month, n: m.n, diff: (m.sb - m.sw) / m.n }));
  const n = pairs.length;
  const brierBase = n ? sb / n : NaN;
  const brierWith = n ? sw / n : NaN;
  const diffs = months.map((m) => m.diff);
  const mean = diffs.reduce((s, v) => s + v, 0) / Math.max(1, diffs.length);
  const sd = Math.sqrt(diffs.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, diffs.length - 1));
  return {
    n,
    brierBase,
    brierWith,
    improvement: brierBase > 0 ? (brierBase - brierWith) / brierBase : 0,
    months,
    monthsBetter: months.filter((m) => m.diff > 0).length,
    tStat: sd > 0 ? mean / (sd / Math.sqrt(diffs.length)) : 0,
  };
}
