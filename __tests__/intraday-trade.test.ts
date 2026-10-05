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
