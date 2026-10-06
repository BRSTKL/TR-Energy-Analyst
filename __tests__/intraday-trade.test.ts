import { describe, it, expect } from "vitest";
import { intradayTradeCost, materialTradeCost } from "@/lib/analysis/intraday-trade";
import { finalPlanCoverage, describeLowFinalPlan } from "@/lib/analysis/data-completeness";

describe("Gün içi işlem maliyeti (GİP ortalama fiyatıyla)", () => {
  it("elle hesaplanan örnek: plan düşüşü, plan artışı, kazanç, son plansız ve fiyatsız saat", () => {
    const r = intradayTradeCost([
      // Plan 10 → 7: PTF'den satılan 3 MWh GİP'ten 2.200'e geri alınır: 3 × (2.200 − 2.000) = 600 maliyet
      { forecastMwh: 10, forecastFinalMwh: 7, ptf: 2000, gipPrice: 2200 },
      // Plan 5 → 8: fazladan 3 MWh GİP'te 1.800'e satılır (PTF 2.000): −3 × (1.800 − 2.000) = 600 maliyet
      { forecastMwh: 5, forecastFinalMwh: 8, ptf: 2000, gipPrice: 1800 },
      // Plan 5 → 6, GİP PTF'den pahalı: −1 × (2.100 − 2.000) = −100 (kazanç)
      { forecastMwh: 5, forecastFinalMwh: 6, ptf: 2000, gipPrice: 2100 },
      // Son plan yok: hesaba girmez
      { forecastMwh: 5, forecastFinalMwh: null, ptf: 2000, gipPrice: 9999 },
      // Plan değişmedi: fiyattan bağımsız 0
      { forecastMwh: 5, forecastFinalMwh: 5, ptf: 2000, gipPrice: null },
      // Plan değişti ama GİP fiyatı yok: maliyet 0, ayrıca sayılır
      { forecastMwh: 4, forecastFinalMwh: 2, ptf: 2000, gipPrice: null },
    ]);
    expect(r.costTl).toBeCloseTo(1100, 6);
    expect(r.planDownMwh).toBeCloseTo(5, 6); // 3 + 2
    expect(r.planUpMwh).toBeCloseTo(4, 6); // 3 + 1
    expect(r.hoursWithoutGip).toBe(1);
  });

  it("brüt azalmanın %2'sinden küçük işlem maliyeti ihmal edilir", () => {
    expect(materialTradeCost(19, 1000)).toBe(0);
    expect(materialTradeCost(-20, 1000)).toBe(-20);
    expect(materialTradeCost(250, 1000)).toBe(250);
  });
});

describe("Son plan kapsamı", () => {
  it("santral-saat payı, kapsamı düşük santraller; üretmeyen santral listelenmez", () => {
    const h = (final: number | null, f = 5, a = 5) => ({ forecastMwh: f, actualMwh: a, forecastFinalMwh: final });
    const cov = finalPlanCoverage([
      { plantName: "TAM RES", hourly: [h(5), h(4), h(6), h(5)] },
      { plantName: "YARIM GES", hourly: [h(5), h(null), h(null), h(5)] },
      { plantName: "LÜY BİRİMİ", hourly: [h(null), h(null), h(null), h(null)] },
      { plantName: "YENİ RES", hourly: [h(null, 0, 0), h(null, 0, 0)] }, // henüz üretmiyor
      { plantName: "BOŞ", hourly: [] },
    ]);
    expect(cov.hours).toBe(14);
    expect(cov.hoursWithFinal).toBe(6);
    expect(cov.coveragePct).toBeCloseTo((6 / 14) * 100, 6);
    expect(cov.lowPlants.map((p) => p.plantName)).toEqual(["LÜY BİRİMİ", "YARIM GES"]);
    expect(describeLowFinalPlan(cov.lowPlants[1])).toBe("YARIM GES (%50)");
  });
});

import { pctIn, pctOf } from "@/lib/format";

describe("Yüzde ekleri", () => {
  it("okunuşun son sözcüğüne göre", () => {
    expect([0, 1, 2, 3, 6, 9, 10, 40, 50, 60, 75, 90, 95, 100].map(pctOf)).toEqual(
      ["%0'ı", "%1'i", "%2'si", "%3'ü", "%6'sı", "%9'u", "%10'u", "%40'ı", "%50'si", "%60'ı", "%75'i", "%90'ı", "%95'i", "%100'ü"]
    );
    expect([0, 2, 6, 9, 30, 60, 70, 95, 100].map(pctIn)).toEqual(
      ["%0'ında", "%2'sinde", "%6'sında", "%9'unda", "%30'unda", "%60'ında", "%70'inde", "%95'inde", "%100'ünde"]
    );
    expect(pctOf(94.6)).toBe("%95'i");
  });
});

import { aggregatorIntraday, intradayPeerStats, type AggregatorBenchmarkRow, type BenchmarkPlant } from "@/lib/analysis/aggregator-benchmark";

describe("Toplayıcıların gerçekleşen gün içi düzeltmesi (12.1)", () => {
  it("portföy netleşmiş, ilk ve son plan aynı fiyatlarla; GİP işlem maliyeti düşülür", () => {
    // İki santral, iki saat. Fiyat: PTF 2.000, pozitif 1.800, negatif 2.300, GİP 2.100
    const prices = new Map([
      [1, { ptf: 2000, pos: 1800, neg: 2300, gip: 2100 }],
      [2, { ptf: 2000, pos: 1800, neg: 2300, gip: 2100 }],
    ]);
    const plant = (id: number, hours: Array<[number, number, number, number | null]>): BenchmarkPlant => ({
      epiasPlantId: id,
      type: "RES",
      owner: null,
      hours: new Map(hours.map(([t, first, actual, final]) => [t, { d: actual - first, actual, firstPlan: first, finalPlan: final }])),
    });
    const r = aggregatorIntraday(
      [
        plant(1, [[1, 10, 6, 7], [2, 10, 10, 10]]), // saat 1: −4 ilk plana göre, −1 son plana göre
        plant(2, [[1, 5, 5, 5], [2, 5, 8, null]]), // saat 2: son plan yok, kapsam dışı
      ],
      prices
    )!;
    expect(r.coveragePct).toBeCloseTo(75, 6);
    // İlk plan: saat 1 portföy −4 → 4 × 300 = 1.200; saat 2 (yalnız santral 1) 0
    expect(r.firstCostTl).toBeCloseTo(1200, 6);
    // Son plan: saat 1 −1 → 300
    expect(r.finalCostTl).toBeCloseTo(300, 6);
    // İşlem: (10 − 7) × (2.100 − 2.000) = 300
    expect(r.tradeCostTl).toBeCloseTo(300, 6);
    expect(r.grossPct).toBeCloseTo(75, 6);
    expect(r.netPct).toBeCloseTo(50, 6);
  });

  it("dağılım: kendisi, düşük kapsamlı ve küçük toplayıcılar dışarıda; medyan ve en iyi çeyrek", () => {
    const row = (id: number, netPct: number, coveragePct = 100, productionMwh = 500_000) =>
      ({ id, name: `T${id}`, productionMwh, intraday: { coveragePct, netPct, grossPct: netPct, firstCostTl: 1, finalCostTl: 1, tradeCostTl: 0 } }) as unknown as AggregatorBenchmarkRow;
    const all = [row(1, 99), row(2, 10), row(3, 20), row(4, 30), row(5, 40), row(6, 50), row(7, 80, 50), row(8, 70, 100, 1000)];
    const s = intradayPeerStats(all, 1, { start: "2026-01-01", end: "2026-08-31" })!;
    expect(s.n).toBe(5);
    expect(s.excluded).toBe(2);
    expect(s.medianNetPct).toBeCloseTo(30, 6);
    expect(s.topQuartileNetPct).toBeCloseTo(40, 6);
    expect(s.rows[0].id).toBe(6);
  });
});
