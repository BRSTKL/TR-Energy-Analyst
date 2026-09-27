import { describe, it, expect } from "vitest";
import { buildBenchmark, classifyHydro, companyRollup, distribution, percentileRank, plantMetrics, passesQuality, quantile, sectorYearChange, type SectorBenchmark, type SectorPlantMetrics } from "@/lib/sector/benchmark";
import { decodeHourly, encodeHourly } from "@/lib/sector/hourly-store";
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

describe("Sektör karnesi: saatlik seri, K1 ve hidro alt tipi", () => {
  const at = (d: number, h: number) => new Date(Date.UTC(2025, 0, d, h));
  const priced = (rows: Array<{ t: Date; f: number; a: number }>) =>
    rows.map((r) => processHourlyRecord({ timestamp: r.t, forecastMwh: r.f, actualMwh: r.a }, { timestamp: r.t, ptf: 2000, smf: 2600, systemDirection: "DEFICIT" }, DEFAULT_IMBALANCE_PROFILE));

  it("saatlik seri kodlanıp çözülünce aynı satırlar; dönem dışı ve boş saatler atlanır", () => {
    const rows = [
      { timestamp: at(1, 0), forecastMwh: 1.23456, actualMwh: 2 },
      { timestamp: at(1, 2), forecastMwh: 3, actualMwh: 0 },
      { timestamp: new Date(Date.UTC(2024, 11, 31, 23)), forecastMwh: 9, actualMwh: 9 },
    ];
    const s = encodeHourly(42, rows, "2025-01-01", "2025-01-02");
    expect(s.forecast).toHaveLength(48);
    expect(s.forecast.slice(0, 3)).toEqual([1.235, null, 3]);
    expect(decodeHourly(s)).toEqual([
      { timestamp: at(1, 0), forecastMwh: 1.235, actualMwh: 2 },
      { timestamp: at(1, 2), forecastMwh: 3, actualMwh: 0 },
    ]);
  });

  it("K1: arıza bloğu (plan yüksek, üretim sıfır, ≥ 3 saat) hariç MWh başına dengesizlik", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, h) => ({ t: at(1, h), f: 10, a: 9 })),
      // 4 saatlik blok: plan 10 (en yüksek üretimin %30'undan fazla), üretim 0
      ...Array.from({ length: 4 }, (_, h) => ({ t: at(1, 10 + h), f: 10, a: 0 })),
    ];
    const m = plantMetrics({ epiasPlantId: 1, name: "X RES", type: "RES", organizationName: null, yekdem: null }, priced(rows));
    expect(m.outageHours).toBe(4);
    // Eksik üretim, sistem açığı: sapma MWh'ı başına 2600 × 1,03 − 2000 = 678 TL. 10 saat × 1 MWh + blokta 4 saat × 10 MWh;
    // blokta üretim sıfır olduğundan payda (90 MWh) değişmez
    expect(m.unitImbalanceTl).toBeCloseTo(((10 + 40) * 678) / 90, 6);
    expect(m.unitImbalanceExOutageTl).toBeCloseTo((10 * 678) / 90, 6);
    expect(m.hydroKind).toBeUndefined();
  });

  it("hidro alt tipi: addaki baraj / regülatör, yoksa gün içi esneklik; az günde null", () => {
    const days = (n: number, shape: (h: number) => number) =>
      Array.from({ length: n * 24 }, (_, i) => ({ timestamp: new Date(Date.UTC(2025, 0, 1, i)), actualMwh: shape(i % 24) }));
    expect(classifyHydro("KEBAN BARAJI HES", [])).toBe("RESERVOIR");
    expect(classifyHydro("Yukarı Regülatörü ve HES", [])).toBe("RUN_OF_RIVER");
    expect(classifyHydro("Akarsu HES", days(40, () => 10))).toBe("RUN_OF_RIVER");
    expect(classifyHydro("Tepe HES", days(40, (h) => (h >= 17 && h <= 21 ? 50 : 0)))).toBe("RESERVOIR");
    expect(classifyHydro("Tepe HES", days(10, () => 10))).toBeNull();
    const hes = plantMetrics({ epiasPlantId: 2, name: "Akarsu HES", type: "HES", organizationName: null, yekdem: null }, priced(days(40, () => 10).map((r) => ({ t: r.timestamp, f: 10, a: 10 }))));
    expect(hes.hydroKind).toBe("RUN_OF_RIVER");
  });

  it("karne dağılımı: HES yalnızca varsa; K1 dağılımı yalnızca tüm santrallerde değer varsa", () => {
    const m = (id: number, type: "RES" | "HES", k1?: number) =>
      ({ epiasPlantId: id, name: `S${id}`, type, organizationName: null, yekdem: null, hours: 100, actualMwh: 100, peakMw: 1, imbalanceCostTl: 100 * id, kupstTl: 0,
        unitImbalanceTl: id, unitKupstTl: 0, deviationPct: 10, sameDirectionPct: 50, biasPct: 0, ...(k1 !== undefined ? { unitImbalanceExOutageTl: k1 } : {}) });
    const b = buildBenchmark(2025, [m(1, "RES", 1), m(2, "RES", 2), m(3, "HES", 3)], 100);
    expect(Object.keys(b.byType).sort()).toEqual(["GES", "HES", "RES"]);
    expect(b.byType.RES.unitImbalanceExOutageTl?.count).toBe(2);
    expect(buildBenchmark(2025, [m(1, "RES", 1), m(2, "RES")], 100).byType.RES.unitImbalanceExOutageTl).toBeUndefined();
    expect(buildBenchmark(2025, [m(1, "RES")], 100).byType.HES).toBeUndefined();
  });
});
