/**
 * TR-Energy Analyst - Sistem yönü ve makas tahmini: model ve rakipler (Aşama 14.2)
 *
 * - Yön: L2 düzenlemeli lojistik regresyon (Newton / IRLS, sabit iterasyon; rastgelelik yok).
 * - Makas: log(1 + |SMF − PTF|) üzerinde ridge regresyon (kapalı form).
 * Özellikler eğitim verisinin ortalama ve standart sapmasıyla ölçeklenir; sabit terim düzenlenmez. λ sabittir,
 * test verisine bakılarak ayarlanmaz. Yöntem, epftoolbox'taki LEAR'ın (düzenlemeli doğrusal model + gecikmeli
 * girdiler) sade bir uyarlamasıdır.
 *
 * Rakipler (model bunları yenemezse işe yaramaz sayılır):
 * - İklim: eğitim dönemindeki saat bazında açık oranı ve makas medyanı.
 * - Kalıcılık: son bilinen yön (D-1: D-2'nin aynı saati; H-2: 2 saat önce). Olasılık, eğitim döneminde "son bilinen yön
 *   açık/fazla iken" gerçekleşen açık oranıyla kalibre edilir (0/1 olasılık Brier'de rakibi haksız yere zayıflatırdı).
 *
 * SAF fonksiyonlar: I/O yok.
 */

import type { FeatureRow } from "@/lib/analysis/direction-features";

export const DEFAULT_LAMBDA = 1;
const NEWTON_ITERATIONS = 25;
const P_MIN = 1e-4;

/** Simetrik pozitif tanımlı A x = b (Cholesky). A değiştirilmez. */
export function solveSpd(A: number[][], b: number[]): number[] {
  const n = b.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 0) throw new Error("Matris pozitif tanımlı değil");
        L[i][i] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  }
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

interface Scaler {
  mean: number[];
  sd: number[];
}

function fitScaler(xs: number[][]): Scaler {
  const m = xs[0].length;
  const mean = new Array<number>(m).fill(0);
  const sd = new Array<number>(m).fill(0);
  for (const x of xs) for (let j = 0; j < m; j++) mean[j] += x[j] / xs.length;
  for (const x of xs) for (let j = 0; j < m; j++) sd[j] += (x[j] - mean[j]) ** 2 / xs.length;
  // Sabit sütun (eğitimde hiç değişmeyen): ölçek 1, katsayısı düzenlemeyle sıfıra çekilir
  return { mean, sd: sd.map((v) => (v > 1e-12 ? Math.sqrt(v) : 1)) };
}

/** [1, ölçeklenmiş x] */
const design = (x: number[], s: Scaler) => [1, ...x.map((v, j) => (v - s.mean[j]) / s.sd[j])];

const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Ağırlıklı normal denklemler: (Xᵀ W X + λ I*) β = Xᵀ W z; I* sabit terimi düzenlemez */
function weightedRidge(X: number[][], z: number[], w: number[], lambda: number): number[] {
  const m = X[0].length;
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b = new Array<number>(m).fill(0);
  for (let r = 0; r < X.length; r++) {
    const xr = X[r];
    const wr = w[r];
    for (let i = 0; i < m; i++) {
      const wi = wr * xr[i];
      b[i] += wi * z[r];
      for (let j = 0; j <= i; j++) A[i][j] += wi * xr[j];
    }
  }
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < i; j++) A[j][i] = A[i][j];
    if (i > 0) A[i][i] += lambda;
  }
  return solveSpd(A, b);
}

export interface LogisticModel {
  scaler: Scaler;
  beta: number[];
}

/** L2 lojistik regresyon, Newton yöntemi (IRLS) */
export function fitLogistic(xs: number[][], ys: number[], lambda = DEFAULT_LAMBDA): LogisticModel {
  const scaler = fitScaler(xs);
  const X = xs.map((x) => design(x, scaler));
  let beta = new Array<number>(X[0].length).fill(0);
  for (let it = 0; it < NEWTON_ITERATIONS; it++) {
    const w: number[] = [];
    const z: number[] = [];
    for (let r = 0; r < X.length; r++) {
      const eta = dot(X[r], beta);
      const p = Math.min(1 - P_MIN, Math.max(P_MIN, sigmoid(eta)));
      const wr = p * (1 - p);
      w.push(wr);
      z.push(eta + (ys[r] - p) / wr);
    }
    const next = weightedRidge(X, z, w, lambda);
    const change = Math.max(...next.map((v, i) => Math.abs(v - beta[i])));
    beta = next;
    if (change < 1e-8) break;
  }
  return { scaler, beta };
}

export const predictLogistic = (m: LogisticModel, x: number[]) => sigmoid(dot(design(x, m.scaler), m.beta));

export interface RidgeModel {
  scaler: Scaler;
  beta: number[];
}

export function fitRidge(xs: number[][], ys: number[], lambda = DEFAULT_LAMBDA): RidgeModel {
  const scaler = fitScaler(xs);
  const X = xs.map((x) => design(x, scaler));
  return { scaler, beta: weightedRidge(X, ys, new Array<number>(X.length).fill(1), lambda) };
}

export const predictRidge = (m: RidgeModel, x: number[]) => dot(design(x, m.scaler), m.beta);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Bir saat için üç tahmin: model ve iki rakip */
export interface DirectionPrediction {
  t: number;
  month: string;
  hour: number;
  y: 0 | 1;
  spread: number;
  /** P(açık) */
  model: number;
  climatology: number;
  persistence: number;
  /** Beklenen makas, TL/MWh */
  modelSpread: number;
  climatologySpread: number;
  persistenceSpread: number;
}

export interface FittedDirection {
  predict: (row: FeatureRow) => DirectionPrediction;
}

/**
 * Model ve rakipleri eğitim satırlarıyla kurar. Olasılıklar Laplace düzeltmeli (rakiplerde 0 ve 1 çıkmaz).
 */
export function fitDirection(train: FeatureRow[], lambda = DEFAULT_LAMBDA): FittedDirection {
  if (train.length === 0) throw new Error("Eğitim verisi yok");
  const xs = train.map((r) => r.x);
  const logistic = fitLogistic(
    xs,
    train.map((r) => r.y),
    lambda
  );
  const logSpreads = train.map((r) => Math.log1p(r.spread));
  const ridge = fitRidge(xs, logSpreads, lambda);
  // Log ölçeğinde dış değer tahmini expm1 ile katlanır (uç PTF / makas girdisinde milyonlarca TL); tahmin eğitimde
  // görülen aralıkla sınırlanır
  const logMin = Math.min(...logSpreads);
  const logMax = Math.max(...logSpreads);

  const byHour = Array.from({ length: 24 }, () => ({ n: 0, d: 0, spreads: [] as number[] }));
  const byPersist = { def: { n: 0, d: 0 }, sur: { n: 0, d: 0 } };
  for (const r of train) {
    const b = byHour[r.hour];
    b.n++;
    b.d += r.y;
    b.spreads.push(r.spread);
    const p = r.persistDeficit ? byPersist.def : byPersist.sur;
    p.n++;
    p.d += r.y;
  }
  const climP = byHour.map((b) => (b.d + 1) / (b.n + 2));
  const allSpreads = median(train.map((r) => r.spread));
  const climSpread = byHour.map((b) => (b.spreads.length ? median(b.spreads) : allSpreads));
  const persistP = {
    def: (byPersist.def.d + 1) / (byPersist.def.n + 2),
    sur: (byPersist.sur.d + 1) / (byPersist.sur.n + 2),
  };

  return {
    predict: (row) => ({
      t: row.t,
      month: row.month,
      hour: row.hour,
      y: row.y,
      spread: row.spread,
      model: predictLogistic(logistic, row.x),
      climatology: climP[row.hour],
      persistence: row.persistDeficit ? persistP.def : persistP.sur,
      modelSpread: Math.expm1(Math.min(logMax, Math.max(logMin, predictRidge(ridge, row.x)))),
      climatologySpread: climSpread[row.hour],
      persistenceSpread: row.persistSpread,
    }),
  };
}
