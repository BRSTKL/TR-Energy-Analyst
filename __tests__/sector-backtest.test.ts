import { describe, it, expect } from "vitest";
import { improvementBacktest, premiumBacktest, premiumRange, type PlantBacktestInput } from "@/lib/analysis/sector-backtest";

const plant = (id: number, type: string, predicted: number, actual: number, priceOnly: number, w25 = 20, w26 = 20, unit25 = 100): PlantBacktestInput => ({
  epiasPlantId: id,
  type,
  predictedTlPerMwh: predicted,
  actualTlPerMwh: actual,
  priceOnlyTlPerMwh: priceOnly,
  wape2025: w25,
  wape2026: w26,
  unit2025TlPerMwh: unit25,
});

describe("Geçmişle sınama: risk primi (12.2)", () => {
  it("oran dağılımı, fiyat ve tahmin etkisi; tahmini çok küçük santral dışarıda", () => {
    // Oranlar 1,0 1,2 1,4 1,6 1,8; fiyat etkisi hep 1,2
    const ps = [1.0, 1.2, 1.4, 1.6, 1.8].map((r, i) => plant(i, "RES", 100, 100 * r, 120));
    ps.push(plant(9, "RES", 0.5, 50, 1)); // tahmin < 1 TL/MWh: oran anlamsız
    const s = premiumBacktest(ps).RES;
    expect(s.n).toBe(5);
    expect(s.ratio.p50).toBeCloseTo(1.4, 9);
    expect(s.ratio.p25).toBeCloseTo(1.2, 9);
    expect(s.ratio.p75).toBeCloseTo(1.6, 9);
    expect(s.priceEffectRatio).toBeCloseTo(1.2, 9);
    expect(s.forecastEffectRatio).toBeCloseTo(1.4 / 1.2, 9);
    expect(s.medianAbsErrorPct).toBeCloseTo(40, 9);
  });

  it("portföy aralığı teknolojilerin üretim payıyla ağırlıklı", () => {
    const stats = {
      RES: { n: 5, ratio: { p10: 1, p25: 1.2, p50: 1.4, p75: 1.6, p90: 1.8 }, medianAbsErrorPct: 40, priceEffectRatio: 1.2, forecastEffectRatio: 1.1 },
      HES: { n: 5, ratio: { p10: 0.5, p25: 0.8, p50: 1.0, p75: 1.2, p90: 2 }, medianAbsErrorPct: 30, priceEffectRatio: 1.1, forecastEffectRatio: 1 },
    };
    const r = premiumRange(100, { RES: 300, HES: 100 }, stats)!;
    expect(r.low).toBeCloseTo(100 * (0.75 * 1.2 + 0.25 * 0.8), 9);
    expect(r.mid).toBeCloseTo(100 * (0.75 * 1.4 + 0.25 * 1.0), 9);
    expect(r.high).toBeCloseTo(100 * (0.75 * 1.6 + 0.25 * 1.2), 9);
  });
});

describe("Geçmişle sınama: tahmin iyileştirme (12.3)", () => {
  it("yalnız medyandan pahalı santraller; iyileşme yoksa gerçekçi senaryo 0", () => {
    const ps: PlantBacktestInput[] = [];
    // 5 ucuz santral (medyanın altı) ve 6 pahalı: değişimler −40, −20, 0, +10, +20, +30 (%)
    for (let i = 0; i < 5; i++) ps.push(plant(i, "HES", 1, 1, 1, 20, 5, 10 + i));
    [-40, -20, 0, 10, 20, 30].forEach((c, i) => ps.push(plant(10 + i, "HES", 1, 1, 1, 20, 20 * (1 + c / 100), 100 + i)));
    const s = improvementBacktest(ps).HES;
    expect(s.n).toBe(5); // medyan (100 civarı) ve altı dışarıda: 6 pahalının 5'i medyanın üstünde
    expect(s.improvedSharePct).toBeCloseTo(20, 9);
    expect(s.change.p50).toBeCloseTo(10, 9);
    expect(s.realisticImprovementPct).toBe(0);
    expect(s.goodImprovementPct).toBe(0); // p25 = 0
  });
});

import { candidateBacktest, spearman } from "@/lib/analysis/sector-backtest";

describe("Geçmişle sınama: aday taraması (12.5)", () => {
  it("Spearman: birebir sıra 1, ters sıra −1, eşitler ortalama sırayla", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 9);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 9);
    expect(spearman([1, 1, 2, 3], [5, 5, 6, 7])).toBeCloseTo(1, 9);
  });

  it("tutar oranı, sıra korelasyonu ve en iyi çeyrek isabeti", () => {
    // 12 santral: gerçekleşen tahminin 2 katı, sıra aynı
    const pairs = Array.from({ length: 12 }, (_, i) => ({ aggregatorId: i % 3, predictedTlPerMwh: i + 1, actualTlPerMwh: 2 * (i + 1) }));
    const s = candidateBacktest(pairs)!;
    expect(s.n).toBe(12);
    expect(s.aggregators).toBe(3);
    expect(s.ratio.p50).toBeCloseTo(2, 9);
    expect(s.spearman).toBeCloseTo(1, 9);
    expect(s.topQuartileHitPct).toBe(100);
    expect(candidateBacktest(pairs.slice(0, 5))).toBeNull();
  });
});
