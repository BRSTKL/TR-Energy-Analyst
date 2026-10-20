/**
 * TR-Energy Analyst - Rüzgârda olasılıksal tahmin ve rampa uyarısı (Aşama 23.6)
 *
 * (a) P10 / P50 / P90 (`fitWindQuantiles`): tahminin geçmişteki ÖRNEKLEM DIŞI hatasının dağılımı, tahmin HIZINA göre
 *     dilimlenir (rüzgârda hata hız dilimine göre çok değişir: kesme altında ≈ 0, güç eğrisinin dik bölgesinde en geniş,
 *     nominal üstünde tek yönlü). Dilimler `SPEED_EDGES` (m/s). q çeyrekliği = tahmin + kurulu güç × (dilimdeki
 *     (gerçekleşen − tahmin) / kurulu güç dağılımının q çeyrekliği); [0, kurulu güç] aralığına kırpılır. Dilimde
 *     `MIN_BIN_ROWS`'tan az satır varsa bütün satırlar. Güneşteki models/quantiles.ts ile aynı yapı, dilim hızdan.
 * (b) Rampa olasılığı (`fitRampModel`): üç saatte kurulu gücün %30'undan fazla değişim (`RAMP_SHARE`, `RAMP_HOURS`).
 *     L2 lojistik (lib/analysis/direction-model.ts `fitLogistic`; λ sabit). Özellikler tahminden: üç saatlik tahmin
 *     değişimi / kurulu güç, tahmin düzeyi, tahmin hızı ve üç saatlik hız değişimi, modellerin hız ayrışması (yoksa 0),
 *     günün saati (sin, cos). Yalnız aynı gün içindeki çiftler (t ve t+3 aynı hedef günde: ikisinin tahmini de kesimde
 *     elde). Rakip (`rampClimatology`): eğitimde saat başına rampa payı.
 * Kapsama hedefi %80; geriye dönük testte bütün saatlerde ölçülür. Bilgi zamanı: girdiler tahminin kendisi ve d2 hava
 * değişkenleri (tahmin zaten denetlenir); etiketler yalnız eğitim döneminden. SAF: I/O yok.
 */

import { fitLogistic, predictLogistic, type LogisticModel } from "@/lib/analysis/direction-model";

export const SPEED_EDGES = [4, 7, 10, 13];
export const MIN_BIN_ROWS = 150;
export const RAMP_SHARE = 0.3;
export const RAMP_HOURS = 3;
export const MIN_RAMP_ROWS = 500;
export const MIN_RAMP_EVENTS = 20;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const binOf = (ws: number) => SPEED_EDGES.filter((e) => ws >= e).length;

function q(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const x = p * (sorted.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return i + 1 < sorted.length ? sorted[i] * (1 - f) + sorted[i + 1] * f : sorted[i];
}

export interface WindQuantileModel {
  quantile: (pred: number, ws: number, p: number) => number;
  rows: number;
}

/** Geçmiş örneklem dışı (tahmin, tahmin hızı, gerçekleşen); satır azsa null */
export function fitWindQuantiles(rows: Array<{ pred: number; ws: number; actual: number; live?: boolean }>, capacityMw: number): WindQuantileModel | null {
  if (capacityMw <= 0) return null;
  const bins: number[][] = Array.from({ length: SPEED_EDGES.length + 1 }, () => []);
  const pooled: number[] = [];
  for (const r of rows) {
    if (r.live) throw new Error("Canlı tahmin saati eğitime giremez");
    const e = (r.actual - r.pred) / capacityMw;
    bins[binOf(r.ws)].push(e);
    pooled.push(e);
  }
  if (pooled.length < MIN_BIN_ROWS * 2) return null;
  for (const b of bins) b.sort((a, c) => a - c);
  pooled.sort((a, c) => a - c);
  return {
    rows: pooled.length,
    quantile: (pred, ws, p) => {
      const b = bins[binOf(ws)];
      return Math.min(capacityMw, Math.max(0, pred + capacityMw * q(b.length >= MIN_BIN_ROWS ? b : pooled, p)));
    },
  };
}

export interface RampHour {
  t: number;
  /** Tahmin (MWh) ve tahmin hızı (m/s) */
  pred: number | null;
  ws: number | null;
  /** Modellerin hız ayrışması (m/s); yoksa null */
  spreadMs?: number | null;
  /** Gerçekleşen üretim; canlıda null */
  actual: number | null;
  live?: boolean;
}

export interface RampRow {
  t: number;
  x: number[];
  y: 0 | 1 | null;
  live?: boolean;
}

/** Saat sıralı dizi → rampa satırları (t ve t + 3 aynı gün, ikisinin de tahmini var) */
export function buildRampRows(hours: RampHour[], capacityMw: number): RampRow[] {
  const byT = new Map(hours.map((h) => [h.t, h]));
  const out: RampRow[] = [];
  for (const a of hours) {
    const b = byT.get(a.t + RAMP_HOURS * HOUR);
    if (!b || Math.floor(a.t / DAY) !== Math.floor(b.t / DAY)) continue;
    if (a.pred === null || b.pred === null || a.ws === null || b.ws === null) continue;
    const hr = new Date(a.t).getUTCHours();
    const x = [
      Math.abs(b.pred - a.pred) / capacityMw,
      a.pred / capacityMw,
      a.ws,
      Math.abs(b.ws - a.ws),
      Math.max(a.spreadMs ?? 0, b.spreadMs ?? 0),
      Math.sin((2 * Math.PI * hr) / 24),
      Math.cos((2 * Math.PI * hr) / 24),
    ];
    const live = !!(a.live || b.live);
    const y = live || a.actual === null || b.actual === null ? null : Math.abs(b.actual - a.actual) > RAMP_SHARE * capacityMw ? 1 : 0;
    out.push({ t: a.t, x, y, ...(live ? { live: true } : {}) });
  }
  return out;
}

export interface RampModel {
  predict: (r: RampRow) => number;
  rows: number;
  events: number;
  model: LogisticModel;
}

export function fitRampModel(rows: RampRow[], lambda = 1): RampModel | null {
  for (const r of rows) {
    if (r.live) throw new Error("Canlı tahmin saati eğitime giremez");
    if (r.y === null) throw new Error("Etiketsiz satır eğitime giremez");
  }
  const events = rows.filter((r) => r.y === 1).length;
  if (rows.length < MIN_RAMP_ROWS || events < MIN_RAMP_EVENTS) return null;
  const model = fitLogistic(
    rows.map((r) => r.x),
    rows.map((r) => r.y as number),
    lambda
  );
  return { predict: (r) => predictLogistic(model, r.x), rows: rows.length, events, model };
}

/** Rakip: eğitimde saat başına rampa payı */
export function rampClimatology(rows: RampRow[]): (t: number) => number {
  const c = Array.from({ length: 24 }, () => [0, 0]);
  for (const r of rows) {
    if (r.y === null) continue;
    const h = new Date(r.t).getUTCHours();
    c[h][0] += r.y;
    c[h][1]++;
  }
  return (t) => {
    const [z, n] = c[new Date(t).getUTCHours()];
    return n ? z / n : 0;
  };
}
