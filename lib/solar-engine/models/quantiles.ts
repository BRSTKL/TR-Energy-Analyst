/**
 * TR-Energy Analyst - Olasılıksal güneş tahmini: P10 / P50 / P90 ve maliyete göre teklif (Aşama 22.5)
 *
 * Tahminin geçmişteki ÖRNEKLEM DIŞI hatalarının dağılımı, tahmin düzeyine göre dilimlenir (tahmin / tavan: 0–0,2, 0,2–0,4,
 * 0,4–0,6, 0,6–0,8, 0,8+; aynı düzeydeki saatlerin hatası benzer). q çeyrekliği = tahmin + tavan × (o dilimdeki
 * (gerçekleşen − tahmin) / tavan dağılımının q çeyrekliği); [0, max(tavan, tahmin)] aralığına kırpılır. Dilimde
 * MIN_BIN_ROWS'tan az satır varsa bütün satırların dağılımı. Gece ve sıfıra yakın tahmin değişmez.
 * Maliyete göre teklif (`chooseBidQuantile`): dengesizlik fiyatları asimetrik (eksik üretim pozitif fiyattan, fazla üretim
 * negatif fiyattan; dönemin kuralı ve KÜPST lib/forecast/production-backtest.ts): geçmiş saatlerde aday çeyrekliklerin
 * gerçek maliyeti hesaplanır, en ucuzu seçilir. Önceki bulgu (2026-09 geriye dönük testi): miktar ayarı küçük kazanç verir,
 * 2026 katsayılarıyla daha da az; sonuç bu yüzden yalnız örneklem dışı ölçülür.
 * Kalibrasyon (22.5 a2): `width` bandı medyan çevresinde genişletir (q = P50 + width × (ham q − P50); 1 = ham). Çarpan
 * test döneminden AYRI bir dönemde seçilir (`chooseWidth`). `ceiling`: kırpma tavanı (ör. kayıtlı kurulu güç; varsayılan
 * eğitim tavanı); tavan kırpması bahar aylarında kış tavanının altında kalan üretimi bandın dışına itiyordu. SAF: I/O yok.
 */

export const LEVEL_EDGES = [0.2, 0.4, 0.6, 0.8];
export const MIN_BIN_ROWS = 150;
export const BID_QUANTILES = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];
/** Kalibrasyonda denenen genişlik çarpanları */
export const WIDTHS = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2];

export interface QuantileModel {
  /** q ∈ (0, 1) çeyrekliği (MWh); `width` bant çarpanı (varsayılan 1, ham) */
  quantile: (pred: number, q: number, width?: number) => number;
  rows: number;
}

const binOf = (level: number) => LEVEL_EDGES.filter((e) => level >= e).length;

function q(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const x = p * (sorted.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return i + 1 < sorted.length ? sorted[i] * (1 - f) + sorted[i + 1] * f : sorted[i];
}

/** Geçmiş örneklem dışı (tahmin, gerçekleşen) çiftlerinden; satır azsa null */
export function fitResidualQuantiles(rows: Array<{ pred: number; actual: number }>, cap: number, opts: { ceiling?: number } = {}): QuantileModel | null {
  if (cap <= 0) return null;
  const bins: number[][] = Array.from({ length: LEVEL_EDGES.length + 1 }, () => []);
  const pooled: number[] = [];
  for (const r of rows) {
    if (r.pred <= 0.01 * cap && r.actual <= 0.01 * cap) continue;
    const e = (r.actual - r.pred) / cap;
    bins[binOf(r.pred / cap)].push(e);
    pooled.push(e);
  }
  if (pooled.length < MIN_BIN_ROWS * 2) return null;
  for (const b of bins) b.sort((a, c) => a - c);
  pooled.sort((a, c) => a - c);
  return {
    rows: pooled.length,
    quantile: (pred, p, width = 1) => {
      if (pred <= 0.01 * cap) return pred;
      const b = bins[binOf(pred / cap)];
      const src = b.length >= MIN_BIN_ROWS ? b : pooled;
      const r = width === 1 ? q(src, p) : q(src, 0.5) + width * (q(src, p) - q(src, 0.5));
      return Math.min(Math.max(opts.ceiling ?? cap, pred), Math.max(0, pred + cap * r));
    },
  };
}

/** Geçmiş saatlerde aday çeyrekliklerin maliyeti (`cost`: çeyreklik → toplam TL); en ucuzu */
export function chooseBidQuantile(cost: (q: number) => number, candidates: number[] = BID_QUANTILES): { q: number; costs: Record<string, number> } {
  const costs: Record<string, number> = {};
  let best = 0.5;
  let bestCost = Infinity;
  for (const c of candidates) {
    const v = cost(c);
    costs[c.toFixed(2)] = v;
    if (v < bestCost - 1e-9 || (Math.abs(v - bestCost) <= 1e-9 && Math.abs(c - 0.5) < Math.abs(best - 0.5))) {
      best = c;
      bestCost = v;
    }
  }
  return { q: best, costs };
}

/** Kapsaması hedefe (varsayılan %80) en yakın genişlik çarpanı; `coverage`: çarpan → [bant içi, saat] (seçim dönemi) */
export function chooseWidth(coverage: (width: number) => [number, number], target = 0.8, widths: number[] = WIDTHS): { width: number; coverage: number } {
  let best = { width: 1, coverage: NaN, gap: Infinity };
  for (const w of widths) {
    const [i, n] = coverage(w);
    if (!n) continue;
    const c = i / n;
    if (Math.abs(c - target) < best.gap - 1e-12) best = { width: w, coverage: c, gap: Math.abs(c - target) };
  }
  return { width: best.width, coverage: best.coverage };
}
