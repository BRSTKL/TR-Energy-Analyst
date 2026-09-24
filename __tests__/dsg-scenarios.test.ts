import { describe, it, expect } from "vitest";
import { processHourlyRecord } from "../lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, HourlyResult } from "../lib/calculations/types";
import { analyzeDsgScenario } from "../lib/analysis/dsg-scenarios";
import { analyzeGroupNetting, NettingPlantInput } from "../lib/analysis/portfolio-netting";

// 2025 saatleri, PTF = SMF = 2000, sistem dengede: 1 MWh sapmanın maliyeti 60 ₺ (sabit %3)
const hour = (h: number, forecastMwh: number, actualMwh: number, month = 1): HourlyResult => {
  const ts = `2025-${String(month).padStart(2, "0")}-01T${String(h).padStart(2, "0")}:00:00Z`;
  return processHourlyRecord(
    { timestamp: ts, forecastMwh, actualMwh },
    { timestamp: ts, ptf: 2000, smf: 2000, systemDirection: "BALANCED" },
    DEFAULT_IMBALANCE_PROFILE
  );
};
const plant = (id: string, type: string, hourly: HourlyResult[]): NettingPlantInput => ({
  plantId: id,
  plantName: id,
  plantType: type,
  hourly,
});

describe("DSG senaryo analizi", () => {
  // A ve B aynı saatte tam zıt yönde 10 MWh sapıyor; C başka bir saatte 20 MWh sapıyor
  const A = plant("A", "RES", [hour(0, 50, 60), hour(1, 50, 50)]);
  const B = plant("B", "RES", [hour(0, 50, 40), hour(1, 50, 50)]);
  const C = plant("C", "HES", [hour(0, 30, 30), hour(1, 30, 50)]);
  const all = [A, B, C];

  it("Netleşmiş maliyeti mevcut netleştirme motoruyla aynı hesaplar", () => {
    const r = analyzeDsgScenario(all, ["A", "B", "C"], DEFAULT_IMBALANCE_PROFILE);
    const ref = analyzeGroupNetting(all, { key: "p", label: "p", kind: "portfolio" }, DEFAULT_IMBALANCE_PROFILE);
    expect(r.selection!.nettedCost).toBeCloseTo(ref.nettedCost, 6);
    expect(r.selection!.standaloneCost).toBeCloseTo(ref.standaloneCost, 6);
    // Tek başına: A 600 + B 600 + C 1200 = 2400; grupta yalnızca C'nin 1200'ü kalır
    expect(r.selection!.standaloneCost).toBeCloseTo(2400, 6);
    expect(r.selection!.nettedCost).toBeCloseTo(1200, 6);
  });

  it("Her yöntem netleşen maliyetin tamamını paylaştırır", () => {
    const r = analyzeDsgScenario(all, ["A", "B", "C"], DEFAULT_IMBALANCE_PROFILE);
    for (const m of r.allocation!) {
      expect(m.shares.reduce((s, x) => s + x.allocatedCost, 0)).toBeCloseTo(1200, 6);
    }
  });

  it("Shapley faydayı yaratanlara verir; maliyet orantılı paylaştırmada A+B ayrılmak ister", () => {
    const r = analyzeDsgScenario(all, ["A", "B", "C"], DEFAULT_IMBALANCE_PROFILE);
    const shapley = r.allocation!.find((m) => m.id === "shapley")!;
    const share = (id: string) => shapley.shares.find((s) => s.plantId === id)!.allocatedCost;
    // A ve B birbirini tamamen götürür, C'ye katkıları yok: Shapley'de A ve B 0 öder, C kendi maliyetini
    expect(share("A")).toBeCloseTo(0, 6);
    expect(share("B")).toBeCloseTo(0, 6);
    expect(share("C")).toBeCloseTo(1200, 6);
    expect(shapley.unstableSubgroups).toEqual([]);

    // Maliyet orantılı: A ve B 300'er öder; oysa kendi aralarında grup kurarsa 0 öderler
    const prop = r.allocation!.find((m) => m.id === "cost-proportional")!;
    expect(prop.shares.find((s) => s.plantId === "A")!.allocatedCost).toBeCloseTo(300, 6);
    expect(prop.unstableSubgroups).toContainEqual(["A", "B"]);
  });

  it("Marjinal değer: gruptaki santralin ayrılınca kaybettirdiği, dışarıdakinin eklenince kattığı fayda", () => {
    const r = analyzeDsgScenario(all, ["A", "C"], DEFAULT_IMBALANCE_PROFILE);
    // A+C'de netleşme yok (fayda 0); B eklenirse A ile 1200 ₺ fayda doğar
    expect(r.selection!.benefitTl).toBeCloseTo(0, 6);
    const b = r.marginal.find((m) => m.plantId === "B")!;
    expect(b.inGroup).toBe(false);
    expect(b.benefitChangeTl).toBeCloseTo(1200, 6);
    expect(r.marginal.find((m) => m.plantId === "A")!.benefitChangeTl).toBeCloseTo(0, 6);
  });

  it("Alt grupları faydaya göre sıralar; tek santral seçiminde grup sonucu üretmez", () => {
    const r = analyzeDsgScenario(all, ["A"], DEFAULT_IMBALANCE_PROFILE);
    expect(r.selection).toBeNull();
    expect(r.allocation).toBeNull();
    expect(r.subsetsExhaustive).toBe(true);
    expect(r.topSubsets[0].benefitTl).toBeCloseTo(1200, 6);
    // En iyi fayda A+B ve A+B+C'de eşit (1200); sıralama azalan
    for (let i = 1; i < r.topSubsets.length; i++) {
      expect(r.topSubsets[i].benefitTl).toBeLessThanOrEqual(r.topSubsets[i - 1].benefitTl);
    }
  });

  it("Aylık faydayı ve zıt yönlü saat payını hesaplar", () => {
    const X = plant("X", "RES", [hour(0, 50, 60, 1), hour(0, 50, 60, 2)]);
    const Y = plant("Y", "RES", [hour(0, 50, 40, 1), hour(0, 50, 60, 2)]);
    const r = analyzeDsgScenario([X, Y], ["X", "Y"], DEFAULT_IMBALANCE_PROFILE);
    expect(r.monthly.map((m) => m.month)).toEqual(["2025-01", "2025-02"]);
    expect(r.monthly[0].benefitRatio).toBeCloseTo(1, 6); // Ocak: tam netleşme
    expect(r.monthly[1].benefitRatio).toBeCloseTo(0, 6); // Şubat: aynı yönde
    expect(r.offsettingHourShare).toBeCloseTo(0.5, 6);
  });
});
