import { describe, it, expect } from "vitest";
import { companyRollup, distribution, percentileRank, plantMetrics, passesQuality, quantile } from "@/lib/sector/benchmark";
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

  it("şirket toplamı üretim ağırlıklı, sıra santral dağılımına göre", () => {
    const base = { type: "RES" as const, yekdem: false, hours: 8760, peakMw: 10, kupstTl: 0, unitKupstTl: 0, deviationPct: 0, sameDirectionPct: 0, biasPct: 0 };
    const plant = (id: number, org: number | null, mwh: number, unit: number) => ({
      ...base,
      epiasPlantId: id,
      name: `S${id}`,
      organizationId: org,
      organizationName: org === null ? null : `Şirket ${org}`,
      actualMwh: mwh,
      imbalanceCostTl: mwh * unit,
      unitImbalanceTl: unit,
    });
    const rows = companyRollup([plant(1, 1, 100, 100), plant(2, 1, 300, 50), plant(3, 2, 100, 150), plant(4, null, 100, 80)]);
    expect(rows).toHaveLength(2); // sahibi bilinmeyen santral şirket satırı oluşturmaz
    const a = rows.find((r) => r.organizationId === 1)!;
    expect(a.plantCount).toBe(2);
    expect(a.plantIds).toEqual([1, 2]);
    expect(a.unitImbalanceTl).toBeCloseTo(62.5, 10); // (10 000 + 15 000) / 400
    expect(a.rankPct).toBeCloseTo(25, 10); // [100, 50, 150, 80] içinde altında 1 değer → 1/4
    expect(a.peakMw).toBe(20);
  });
});
