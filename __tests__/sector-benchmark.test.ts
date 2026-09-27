import { describe, it, expect } from "vitest";
import { companyRollup, distribution, percentileRank, plantMetrics, passesQuality, quantile, sectorYearChange, type SectorBenchmark, type SectorPlantMetrics } from "@/lib/sector/benchmark";
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

describe("Sektör karnesi yıllar arası değişim", () => {
  const plant = (id: number, type: "RES" | "GES", unit: number, dev: number): SectorPlantMetrics => ({
    epiasPlantId: id, name: `S${id}`, type, organizationName: null, yekdem: null, hours: 5000, actualMwh: 1000, peakMw: 1,
    imbalanceCostTl: unit * 1000, kupstTl: 0, unitImbalanceTl: unit, unitKupstTl: 0, deviationPct: dev, sameDirectionPct: 50, biasPct: 0,
  });
  const bench = (year: number, plants: SectorPlantMetrics[]) => ({ year, plants } as unknown as SectorBenchmark);

  it("aynı santraller eşlenir: artan pay, medyan değişim ve medyan sapma", () => {
    const prev = bench(2025, [plant(1, "RES", 40, 18), plant(2, "RES", 50, 20), plant(3, "RES", 60, 22), plant(9, "GES", 30, 10), plant(7, "RES", 0, 5)]);
    const cur = bench(2026, [plant(1, "RES", 60, 18), plant(2, "RES", 75, 21), plant(3, "RES", 54, 22), plant(4, "RES", 80, 30), plant(7, "RES", 10, 5)]);
    const ch = sectorYearChange(prev, cur);
    // 4 yalnızca 2026'da, 7'nin 2025 maliyeti sıfır: dışarıda; GES eşleşmesi yok
    expect(ch.RES).toMatchObject({ plants: 3, medianCostChangePct: 50, medianDeviationPct: { prev: 20, cur: 21 } });
    expect(ch.RES!.increasedPct).toBeCloseTo(200 / 3, 10);
    expect(ch.GES).toBeUndefined();
  });
});
