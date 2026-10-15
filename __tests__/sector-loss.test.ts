import { describe, it, expect } from "vitest";
import { isYeka, sectorLoss, type SectorLossPlant } from "@/lib/analysis/sector-loss";
import type { MonthlyLoss } from "@/lib/forecast/curtailment";

const m = (month: string, actual: number, planned: number, unplanned: number, commissioning = false): MonthlyLoss => ({
  month,
  actualMwh: actual,
  plannedLossMwh: planned,
  unplannedLossMwh: unplanned,
  lossPct: 0,
  plannedHours: 0,
  unplannedHours: 0,
  plannedValueTl: planned * 10,
  unplannedValueTl: unplanned * 1000,
  commissioning,
});
const plant = (id: number, name: string, months: MonthlyLoss[]): SectorLossPlant => ({ epiasPlantId: id, name, organizationName: null, locationSource: "OSM", months });

describe("Sektör kayıp özeti (20.4)", () => {
  it("YEKA tanımı", () => {
    expect(isYeka("G4-VİRANŞEHİR-7 GES")).toBe(true);
    expect(isYeka("KARAPINAR YEKA-1 GES")).toBe(true);
    expect(isYeka("GİTAŞ-1 GES")).toBe(false);
  });

  it("gruplar birleştirilmiş oran; aynı aylar; devreye alma ayı dışarıda; santral satırları", () => {
    const plants = [
      plant(1, "G4-BOR3 GES", [m("2025-05", 90, 5, 5), m("2026-05", 60, 35, 5), m("2026-09", 50, 50, 0)]),
      plant(2, "YAYSUN GES", [m("2025-05", 95, 0, 5), m("2026-04", 0, 0, 0), m("2026-05", 98, 0, 2, false)]),
      plant(3, "G4-ERZİN-1 GES", [m("2026-05", 10, 0, 90, true)]), // devreye alma: sayılmaz
    ];
    const r = sectorLoss(plants, [2025, 2026], 8);
    const y26 = r.years.find((y) => y.year === 2026)!;
    // YEKA 2026 (Eylül pencere dışı): kayıp 40 / (60 + 40) = %40; planlı payı 35 / 40
    expect(y26.groups.yeka.lossPct).toBeCloseTo(40, 9);
    expect(y26.groups.yeka.plannedSharePct).toBeCloseTo(87.5, 9);
    expect(y26.groups.yeka.plants).toBe(1);
    // Bütün: (40 + 2) / (60 + 98 + 42)
    expect(y26.groups.all.lossPct).toBeCloseTo((42 / 200) * 100, 9);
    expect(y26.groups.other.unplannedValueTl).toBe(2000);
    expect(r.years.find((y) => y.year === 2025)!.groups.all.lossPct).toBeCloseTo((15 / 200) * 100, 9);
    expect(y26.monthly.yeka.map((x) => x.month)).toEqual(["2026-05"]);
    expect(r.plants.find((p) => p.epiasPlantId === 3)!.years).toEqual({});
    expect(r.plants.find((p) => p.epiasPlantId === 1)!.yeka).toBe(true);
  });
});
