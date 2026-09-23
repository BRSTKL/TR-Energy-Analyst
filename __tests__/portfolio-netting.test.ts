import { describe, it, expect } from "vitest";
import { analyzeGroupNetting, analyzePortfolioNetting } from "@/lib/analysis/portfolio-netting";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, SystemDirection } from "@/lib/calculations/types";

const hour = (h: number, forecastMwh: number, actualMwh: number, ptf: number, smf: number, dir: SystemDirection) =>
  processHourlyRecord(
    { timestamp: new Date(Date.UTC(2026, 0, 1, h)), forecastMwh, actualMwh },
    { timestamp: new Date(Date.UTC(2026, 0, 1, h)), ptf, smf, systemDirection: dir },
    DEFAULT_IMBALANCE_PROFILE
  );

const plant = (id: string, type: string, hourly: ReturnType<typeof hour>[]) => ({
  plantId: id,
  plantName: id,
  plantType: type,
  hourly,
});

describe("DSG Netleştirme Analizi (portfolio-netting)", () => {
  it("Ters yönlü dengesizlikler aynı saatte tamamen netleşirse grup maliyeti sıfır olmalıdır", () => {
    // 00:00 sistem açığı: A +2 MWh fazla, B -2 MWh eksik
    const a = plant("A", "RES", [hour(0, 10, 12, 2000, 2400, "DEFICIT")]);
    const b = plant("B", "HES", [hour(0, 10, 8, 2000, 2400, "DEFICIT")]);

    const r = analyzeGroupNetting([a, b], { key: "g", label: "g", kind: "pair" });

    // A: 2 × (2000 − min(2000,2400)×0.97) = 2 × 60 = 120
    // B: 2 × (max(2000,2400)×1.06 − 2000) = 2 × 544 = 1088
    expect(r.standaloneCost).toBeCloseTo(1208, 6);
    expect(r.nettedCost).toBeCloseTo(0, 6);
    expect(r.benefitTl).toBeCloseTo(1208, 6);
    expect(r.benefitRatio).toBeCloseTo(1, 10);
    expect(r.grossImbalanceMwh).toBe(4);
    expect(r.netImbalanceMwh).toBe(0);
    expect(r.offsettingHourShare).toBe(1);
  });

  it("Aynı yönlü dengesizliklerde netleştirme fayda sağlamamalıdır", () => {
    const a = plant("A", "RES", [hour(0, 10, 12, 2000, 1800, "SURPLUS")]);
    const b = plant("B", "RES", [hour(0, 10, 13, 2000, 1800, "SURPLUS")]);

    const r = analyzeGroupNetting([a, b], { key: "g", label: "g", kind: "pair" });

    expect(r.benefitTl).toBeCloseTo(0, 6);
    expect(r.offsettingHourShare).toBe(0);
    expect(r.grossImbalanceMwh).toBe(r.netImbalanceMwh);
  });

  it("Rastgele verilerde netleştirme maliyeti hiçbir zaman artırmamalıdır (fayda ≥ 0)", () => {
    // Deterministik sözde rastgele üreteç
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const dirs: SystemDirection[] = ["SURPLUS", "DEFICIT", "BALANCED"];

    for (let trial = 0; trial < 50; trial++) {
      const plants = ["A", "B", "C"].map((id) =>
        plant(
          id,
          "RES",
          Array.from({ length: 24 }, (_, h) =>
            hour(h, rnd() * 20, rnd() * 20, 500 + rnd() * 2900, 500 + rnd() * 2900, dirs[h % 3])
          )
        )
      );
      // Aynı saatte santraller aynı fiyatı görmeli: B ve C'nin fiyatlarını A'ya eşitle
      const priced = plants.map((p) =>
        plant(
          p.plantId,
          p.plantType,
          p.hourly.map((hh, i) => hour(i, hh.forecastMwh, hh.actualMwh, plants[0].hourly[i].ptf, plants[0].hourly[i].smf, plants[0].hourly[i].systemDirection))
        )
      );
      const r = analyzeGroupNetting(priced, { key: "g", label: "g", kind: "portfolio" });
      expect(r.benefitTl).toBeGreaterThanOrEqual(-1e-6);
      expect(r.netImbalanceMwh).toBeLessThanOrEqual(r.grossImbalanceMwh + 1e-9);
    }
  });

  it("Portföy, teknoloji grupları ve çiftleri üretmeli; çiftleri faydaya göre sıralamalıdır", () => {
    const h0 = (f: number, a: number) => hour(0, f, a, 2000, 2400, "DEFICIT");
    const r = analyzePortfolioNetting([
      plant("RES_1", "RES", [h0(10, 13)]), // +3
      plant("RES_2", "RES", [h0(10, 10)]), // 0
      plant("HES_1", "HES", [h0(10, 7)]), // -3
    ]);

    expect(r.portfolio?.plantNames).toEqual(["RES_1", "RES_2", "HES_1"]);
    expect(r.portfolio?.nettedCost).toBeCloseTo(0, 6);
    // Yalnızca RES grubunda 2 santral var; HES tek santral olduğu için grup oluşmaz
    expect(r.technologies.map((t) => t.label)).toEqual(["RES Grubu"]);
    expect(r.pairs).toHaveLength(3);
    expect(r.pairs[0].label).toBe("RES_1 + HES_1");
    expect(r.pairs[0].benefitTl).toBeGreaterThan(0);
  });

  it("Tek santralli portföyde netleştirme grubu oluşturmamalıdır", () => {
    const r = analyzePortfolioNetting([plant("A", "RES", [hour(0, 10, 12, 2000, 2400, "DEFICIT")])]);
    expect(r.portfolio).toBeNull();
    expect(r.pairs).toHaveLength(0);
  });
});
