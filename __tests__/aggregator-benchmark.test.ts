import { describe, it, expect } from "vitest";
import { benchmarkAggregator, type BenchmarkPlant } from "@/lib/analysis/aggregator-benchmark";

const H = 3_600_000;
const price = new Map([[0, { ptf: 1000, pos: 900, neg: 1100 }], [H, { ptf: 1000, pos: 900, neg: 1100 }]]);
const plant = (id: number, type: string, owner: string, d: number[], actual = 100): BenchmarkPlant => ({
  epiasPlantId: id,
  type,
  owner,
  hours: new Map(d.map((x, i) => [i * H, { d: x, actual }])),
});

describe("toplayıcı kıyası", () => {
  it("netleşme değeri sahipler arasıdır, endeks karışıma göre beklenen maliyete oranlanır", () => {
    // İki sahip: A +10, B −10 (ilk saat) → portföyde netleşir; 1 MWh sapma maliyeti 100 TL
    const plants = new Map([
      [1, plant(1, "HES", "A", [10, 0])],
      [2, plant(2, "RES", "B", [-10, 0])],
    ]);
    const r = benchmarkAggregator({ id: 9, name: "X", plantIds: [1, 2] }, plants, price, { HES: 50, RES: 100 });
    expect(r.ownerLevelCostTl).toBeCloseTo(2000, 6);
    expect(r.portfolioCostTl).toBeCloseTo(0, 6);
    expect(r.nettingValueTl).toBeCloseTo(2000, 6);
    // Beklenen: HES 200 MWh × 50 + RES 200 MWh × 100 = 30.000
    expect(r.expectedCostTl).toBeCloseTo(30_000, 6);
    expect(r.byTypeMwh).toEqual({ HES: 200, RES: 200 });
    expect(r.mixAdjustedIndex).toBeCloseTo(0, 6);
  });

  it("aynı sapmada hidro ağırlıklı portföyün endeksi daha yüksek olur (ucuz teknolojiye göre kıyas)", () => {
    const hydro = new Map([[1, plant(1, "HES", "A", [10, 10])]]);
    const wind = new Map([[1, plant(1, "RES", "A", [10, 10])]]);
    const med = { HES: 50, RES: 100 };
    const h = benchmarkAggregator({ id: 1, name: "H", plantIds: [1] }, hydro, price, med);
    const w = benchmarkAggregator({ id: 2, name: "W", plantIds: [1] }, wind, price, med);
    expect(h.nettedTlPerMwh).toBeCloseTo(w.nettedTlPerMwh, 6);
    expect(h.mixAdjustedIndex!).toBeGreaterThan(w.mixAdjustedIndex!);
  });
});
