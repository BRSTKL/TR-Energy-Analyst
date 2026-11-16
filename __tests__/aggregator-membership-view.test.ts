import { describe, it, expect } from "vitest";
import { benchmarkAggregator, membershipView, type BenchmarkPlant } from "@/lib/analysis/aggregator-benchmark";

const t = (m: string, h = 0) => Date.parse(`2026-${m}-01T${String(h).padStart(2, "0")}:00:00Z`);
const plant = (id: number, months: string[]): BenchmarkPlant => ({
  epiasPlantId: id,
  type: "RES",
  owner: null,
  hours: new Map(months.map((m) => [t(m), { d: 1, actual: 10 }])),
});

describe("toplayıcı kıyasında ay ay üyelik", () => {
  const plants = new Map([
    [1, plant(1, ["01", "02", "03"])],
    [2, plant(2, ["01", "02", "03"])], // Mart'ta katıldı
    [3, plant(3, ["01", "02", "03"])], // Şubat'tan sonra ayrıldı (bugünkü listede yok)
  ]);
  const byMonth = { "01": [1, 3], "02": [1, 3], "03": [1, 2] };

  it("santral yalnız üye olduğu aylarla sayılır; ayrılan da üye olduğu aylarla girer", () => {
    const v = membershipView([1, 2], byMonth, plants);
    expect(v.plantIds.sort()).toEqual([1, 2, 3]);
    expect(Array.from(v.plants.get(2)!.hours.keys())).toEqual([t("03")]);
    expect(Array.from(v.plants.get(3)!.hours.keys())).toEqual([t("01"), t("02")]);
    const r = benchmarkAggregator({ id: 9, name: "T", plantIds: v.plantIds }, v.plants, new Map(["01", "02", "03"].map((m) => [t(m), { ptf: 2000, pos: 1900, neg: 2600 }])));
    expect(r.productionMwh).toBe(60); // santral 1: 3 ay, 2: 1 ay, 3: 2 ay → 6 santral-ay × 10 MWh
  });

  it("geçmiş yoksa ya da ay eksikse bugünkü liste", () => {
    expect(membershipView([1, 2], null, plants).plants).toBe(plants);
    const v = membershipView([1, 2], { "01": [1] }, plants);
    expect(Array.from(v.plants.get(2)!.hours.keys())).toEqual([t("02"), t("03")]);
  });
});
