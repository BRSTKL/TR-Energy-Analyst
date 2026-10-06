/**
 * TR-Energy Analyst - Geçmişle sınama (Aşama 12.2 ve 12.3)
 *
 * Raporun "ne olurdu" rakamları gerçekle karşılaştırılır: yöntem geçen yılın verisiyle çalıştırılır, bu yıl gerçekte ne
 * olduğuna bakılır, hata ölçülür. Veri: sektör karnesindeki santrallerin iki yılın aynı ayları (Ocak–Ağustos).
 *
 * 12.2 Risk primi: 2025 verisi 2026 kurallarıyla (raporun prim yöntemi) "tahmin"; 2026'da gerçekleşen TL/MWh "gerçek".
 *   Oran = gerçek / tahmin. Fiyat etkisi: 2025 sapmaları 2026 fiyatlarıyla (aynı takvim saati) fiyatlanır; kalan tahmin
 *   (sapma) etkisidir.
 * 12.3 Tahmin iyileştirme: 2025'te kendi teknolojisinin medyanından pahalı santrallerin sapma oranı (WAPE) 2026'da ne kadar
 *   değişti. Rapor "medyana iner" varsayımı yerine gözlenen değişimi kullanır.
 *
 * SAF: I/O yok (veri scripts/sector-backtest.mts'te okunur ve fiyatlanır).
 */

import { quantile } from "@/lib/sector/benchmark";

export interface PlantBacktestInput {
  epiasPlantId: number;
  type: string;
  /** 2025 verisi 2026 kurallarıyla: (dengesizlik + KÜPST) / üretim, TL/MWh */
  predictedTlPerMwh: number;
  /** 2026 gerçekleşen (resmi fiyatlar, 2026 KÜPST), TL/MWh */
  actualTlPerMwh: number;
  /** 2025 sapmaları 2026 fiyatlarıyla, TL/MWh (fiyat etkisi) */
  priceOnlyTlPerMwh: number;
  /** Σ|gerçekleşen − plan| / Σ gerçekleşen (%), iki yılın aynı ayları */
  wape2025: number;
  wape2026: number;
  /** 2025 karnesindeki birim dengesizlik maliyeti (santral tek başına, 2025 kuralları) */
  unit2025TlPerMwh: number;
}

export interface PremiumBacktestStats {
  n: number;
  /** gerçek / tahmin oranının dağılımı */
  ratio: { p10: number; p25: number; p50: number; p75: number; p90: number };
  /** |gerçek − tahmin| / tahmin medyanı (%) */
  medianAbsErrorPct: number;
  /** Fiyat etkisi: fiyatOnly / tahmin medyanı; tahmin (sapma) etkisi: gerçek / fiyatOnly medyanı */
  priceEffectRatio: number;
  forecastEffectRatio: number;
}

export interface ImprovementBacktestStats {
  /** 2025'te kendi teknolojisinin medyanından pahalı olup iki yılda da verisi olan santraller */
  n: number;
  /** 2026'da sapma oranı düşenlerin payı (%) */
  improvedSharePct: number;
  /** Sapma oranındaki göreli değişim (WAPE 2026 / 2025 − 1, %): negatif = iyileşme */
  change: { p25: number; p50: number; p75: number };
  /** Gerçekçi senaryo: medyan iyileşme (%; iyileşme yoksa 0) ve iyi senaryo: en iyi çeyreğin iyileşmesi (%) */
  realisticImprovementPct: number;
  goodImprovementPct: number;
}

export interface SectorBacktest {
  fromYear: number;
  toYear: number;
  months: string;
  premium: Record<string, PremiumBacktestStats>;
  improvement: Record<string, ImprovementBacktestStats>;
  /** Aday taraması sınaması (12.5); toplayıcı üyelik geçmişi yoksa yok */
  candidates?: CandidateBacktestStats | null;
}

const q = (sorted: number[], p: number) => quantile(sorted, p);
const sortNum = (v: number[]) => [...v].sort((a, b) => a - b);

/** Prim hatasının teknoloji başına dağılımı. Tahmini 1 TL/MWh'tan küçük santraller (oran anlamsız) dışarıda. */
export function premiumBacktest(plants: PlantBacktestInput[], minPredicted = 1): Record<string, PremiumBacktestStats> {
  const out: Record<string, PremiumBacktestStats> = {};
  const types = Array.from(new Set(plants.map((p) => p.type)));
  for (const type of [...types, "ALL"]) {
    const ps = plants.filter((p) => (type === "ALL" || p.type === type) && p.predictedTlPerMwh >= minPredicted && p.priceOnlyTlPerMwh > 0);
    if (ps.length < 5) continue;
    const ratio = sortNum(ps.map((p) => p.actualTlPerMwh / p.predictedTlPerMwh));
    out[type] = {
      n: ps.length,
      ratio: { p10: q(ratio, 0.1), p25: q(ratio, 0.25), p50: q(ratio, 0.5), p75: q(ratio, 0.75), p90: q(ratio, 0.9) },
      medianAbsErrorPct: q(sortNum(ps.map((p) => Math.abs(p.actualTlPerMwh / p.predictedTlPerMwh - 1) * 100)), 0.5),
      priceEffectRatio: q(sortNum(ps.map((p) => p.priceOnlyTlPerMwh / p.predictedTlPerMwh)), 0.5),
      forecastEffectRatio: q(sortNum(ps.map((p) => p.actualTlPerMwh / p.priceOnlyTlPerMwh)), 0.5),
    };
  }
  return out;
}

/**
 * 2025'te kendi teknolojisinin medyanından pahalı santrallerin sapma oranı 2026'da ne kadar değişti. Medyan, sınamaya
 * giren bütün santrallerin 2025 birim maliyetinden (karne ile aynı tanım).
 */
export function improvementBacktest(plants: PlantBacktestInput[]): Record<string, ImprovementBacktestStats> {
  const out: Record<string, ImprovementBacktestStats> = {};
  for (const type of Array.from(new Set(plants.map((p) => p.type)))) {
    const all = plants.filter((p) => p.type === type);
    const median = q(sortNum(all.map((p) => p.unit2025TlPerMwh)), 0.5);
    const weak = all.filter((p) => p.unit2025TlPerMwh > median && p.wape2025 > 0);
    if (weak.length < 5) continue;
    const change = sortNum(weak.map((p) => (p.wape2026 / p.wape2025 - 1) * 100));
    const p25 = q(change, 0.25);
    const p50 = q(change, 0.5);
    out[type] = {
      n: weak.length,
      improvedSharePct: (weak.filter((p) => p.wape2026 < p.wape2025).length / weak.length) * 100,
      change: { p25, p50, p75: q(change, 0.75) },
      realisticImprovementPct: Math.max(0, -p50),
      goodImprovementPct: Math.max(0, -p25),
    };
  }
  return out;
}

/**
 * Portföyün prim aralığı: teknolojilerin oran dağılımları üretim payıyla ağırlıklandırılır (çeyrekler). Santral bazında
 * hata portföyünkinden geniştir (portföyde santrallerin hataları kısmen dengelenir): aralık ihtiyatlıdır.
 */
export function premiumRange(
  expectedTlPerMwh: number,
  mix: Record<string, number>,
  stats: Record<string, PremiumBacktestStats>
): { low: number; mid: number; high: number; basis: string[] } | null {
  let w = 0;
  let lo = 0;
  let mid = 0;
  let hi = 0;
  const basis: string[] = [];
  for (const [type, mwh] of Object.entries(mix)) {
    const s = stats[type] ?? stats.ALL;
    if (!s || mwh <= 0) continue;
    w += mwh;
    lo += mwh * s.ratio.p25;
    mid += mwh * s.ratio.p50;
    hi += mwh * s.ratio.p75;
    basis.push(type);
  }
  if (w === 0) return null;
  return { low: (expectedTlPerMwh * lo) / w, mid: (expectedTlPerMwh * mid) / w, high: (expectedTlPerMwh * hi) / w, basis };
}

export interface CandidateBacktestStats {
  /** Sınamaya giren (toplayıcı, katılan santral) çifti */
  n: number;
  aggregators: number;
  /** gerçekleşen / tahmin edilen katkı oranının dağılımı (tahmini pozitif çiftler) */
  ratio: { p25: number; p50: number; p75: number };
  /** Sıra korelasyonu (Spearman): tahmin sırası gerçekleşen sırayı ne kadar tutturdu (1 = birebir, 0 = ilişkisiz) */
  spearman: number;
  /** Tahminde en iyi çeyrekte olanların gerçekte de en iyi yarıda kalma oranı (%) */
  topQuartileHitPct: number;
}

/** Spearman sıra korelasyonu (eşit değerler ortalama sırayla) */
export function spearman(x: number[], y: number[]): number {
  const rank = (v: number[]) => {
    const idx = v.map((val, i) => [val, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(v.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const n = x.length;
  if (n < 3) return 0;
  const rx = rank(x);
  const ry = rank(y);
  const mean = (n + 1) / 2;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mean) * (ry[i] - mean);
    dx += (rx[i] - mean) ** 2;
    dy += (ry[i] - mean) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

/**
 * Aday taraması sınaması (12.5): bir santralin toplayıcı portföyüne kattığı netleşme (MWh başına), önceki yılın verisiyle
 * "tahmin" ve sonraki yılın verisiyle "gerçekleşen". Tutar oranı ve sıra tutarlılığı.
 */
export function candidateBacktest(pairs: Array<{ aggregatorId: number; predictedTlPerMwh: number; actualTlPerMwh: number }>): CandidateBacktestStats | null {
  if (pairs.length < 10) return null;
  const pos = pairs.filter((p) => p.predictedTlPerMwh > 0);
  const ratio = sortNum(pos.map((p) => p.actualTlPerMwh / p.predictedTlPerMwh));
  const pred = sortNum(pairs.map((p) => p.predictedTlPerMwh));
  const act = sortNum(pairs.map((p) => p.actualTlPerMwh));
  const predTop = q(pred, 0.75);
  const actMedian = q(act, 0.5);
  const top = pairs.filter((p) => p.predictedTlPerMwh >= predTop);
  return {
    n: pairs.length,
    aggregators: new Set(pairs.map((p) => p.aggregatorId)).size,
    ratio: { p25: q(ratio, 0.25), p50: q(ratio, 0.5), p75: q(ratio, 0.75) },
    spearman: spearman(
      pairs.map((p) => p.predictedTlPerMwh),
      pairs.map((p) => p.actualTlPerMwh)
    ),
    topQuartileHitPct: top.length ? (top.filter((p) => p.actualTlPerMwh >= actMedian).length / top.length) * 100 : 0,
  };
}
