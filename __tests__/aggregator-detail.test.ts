import { describe, expect, it } from "vitest";
import { aggregatorDetail } from "@/lib/analysis/aggregator-detail";
import type { BenchmarkHourPrice, BenchmarkPlant } from "@/lib/analysis/aggregator-benchmark";

const H = 3_600_000;
const T0 = Date.UTC(2026, 0, 31, 22); // ay sınırını içersin: 2 saat Ocak, 2 saat Şubat
const times = [0, 1, 2, 3].map((i) => T0 + i * H);
const prices = new Map<number, BenchmarkHourPrice>(times.map((t) => [t, { ptf: 100, pos: 80, neg: 130 }]));
const plant = (id: number, owner: string | null, d: number[], type = "RES"): BenchmarkPlant => ({
  epiasPlantId: id,
  name: `P${id}`,
  type,
  owner,
  hours: new Map(times.map((t, i) => [t, { d: d[i], actual: 10 }])),
});
const agg = { id: 1, name: "A", plantIds: [1, 2, 3] };

describe("aggregatorDetail", () => {
  // 1 ve 2 ters yönde sapar (netleşir); 3 ayrı sahibin küçük santrali
  const plants = new Map([
    [1, plant(1, "ÜRETİCİ X", [2, -2, 2, -2])],
    [2, plant(2, "ÜRETİCİ Y", [-2, 2, -2, 2])],
    [3, plant(3, null, [0, 0, 0, 0], "HES")],
  ]);
  const d = aggregatorDetail(agg, plants, prices, { RES: 50, HES: 40 });

  it("özet kıyasla aynı ve aylık toplam özetle tutarlı", () => {
    expect(d.summary.nettingValueTl).toBeGreaterThan(0);
    expect(d.months.map((m) => m.month)).toEqual(["2026-01", "2026-02"]);
    expect(d.months.reduce((a, m) => a + m.nettingTl, 0)).toBeCloseTo(d.summary.nettingValueTl, 6);
    expect(d.months.reduce((a, m) => a + m.portfolioTl, 0)).toBeCloseTo(d.summary.portfolioCostTl, 6);
  });

  it("birbirini dengeleyen iki üretici pozitif katkı verir; sapması olmayan sıfır", () => {
    const x = d.owners.find((o) => o.name === "ÜRETİCİ X")!;
    const y = d.owners.find((o) => o.name === "ÜRETİCİ Y")!;
    expect(x.contributionTl).toBeGreaterThan(0);
    expect(x.contributionTl).toBeCloseTo(y.contributionTl, 6);
    expect(d.owners.find((o) => o.name === "P3")!.contributionTl).toBeCloseTo(0, 9);
  });

  it("santral satırı: tek başına maliyet ve sektör medyanı farkı", () => {
    const p1 = d.plants.find((p) => p.epiasPlantId === 1)!;
    expect(p1.productionMwh).toBe(40);
    expect(p1.standaloneTlPerMwh).toBeGreaterThan(0);
    expect(p1.sectorMedianTlPerMwh).toBe(50);
    expect(d.plants.find((p) => p.epiasPlantId === 3)!.vsMedianPct).toBe(-100);
  });
});
