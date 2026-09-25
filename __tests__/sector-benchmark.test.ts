import { describe, it, expect } from "vitest";
import { distribution, percentileRank, plantMetrics, passesQuality, quantile } from "@/lib/sector/benchmark";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE } from "@/lib/calculations/types";

describe("Sektör karnesi", () => {
  it("yüzdelik ve dağılım", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 10);
    const d = distribution([10, 20, 30], [1, 1, 2]);
    expect(d.median).toBe(20);
    expect(d.weightedMean).toBeCloseTo(22.5, 10);
    // 25 değerin altında 2, eşit 0 → %50... [10,20,30,40]: 25 → 2/4
    expect(percentileRank([10, 20, 30, 40], 25)).toBe(50);
    expect(percentileRank([10, 20, 30, 40], 10)).toBe(12.5);
  });

  it("santral göstergeleri ve kalite süzgeci", () => {
    const t = new Date(Date.UTC(2025, 5, 1, 12));
    const h = processHourlyRecord({ timestamp: t, forecastMwh: 10, actualMwh: 8 }, { timestamp: t, ptf: 2000, smf: 2400, systemDirection: "DEFICIT" }, DEFAULT_IMBALANCE_PROFILE);
    const m = plantMetrics({ epiasPlantId: 1, name: "A", type: "RES", organizationName: null, yekdem: false }, [h]);
    expect(m.deviationPct).toBeCloseTo(25, 10);
    expect(m.sameDirectionPct).toBe(100); // açıkta eksik üretim
    expect(m.biasPct).toBeCloseTo(25, 10);
    expect(m.unitImbalanceTl).toBeCloseTo(h.imbalanceCost / 8, 10);
    expect(passesQuality(m, 1)).toBe(true);
    expect(passesQuality(m, 2)).toBe(false); // verinin %50'si
  });
});
