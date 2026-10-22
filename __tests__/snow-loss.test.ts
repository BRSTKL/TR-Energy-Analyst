import { describe, expect, it } from "vitest";
import { monthlyLoss } from "@/lib/forecast/curtailment";
import { SNOW_DEPTH_MIN, snowHours, snowYearsFromResponse } from "@/lib/weather/snow";
import { hourlyLossAccumulator } from "@/lib/analysis/hourly-loss";

describe("kar derinliği ve güneş kaybında kar ayrımı", () => {
  it("Open-Meteo cevabı yıl belgelerine duvar saatiyle bölünür", () => {
    const docs = snowYearsFromResponse(
      7,
      38.7,
      35.5,
      { hourly: { time: ["2025-12-31T23:00", "2026-01-01T00:00", "2026-01-01T01:00"], snow_depth: [0.05, 0.02, null] } },
      "2026-10-21T00:00:00.000Z"
    );
    expect(docs.map((d) => d.year).sort()).toEqual([2025, 2026]);
    const y26 = docs.find((d) => d.year === 2026)!;
    expect(y26.depth[0]).toBe(0.02);
    expect(y26.depth[1]).toBeNull();
    expect(docs.find((d) => d.year === 2025)!.depth[8759]).toBe(0.05);
  });

  it("kar saatleri: yerde en az 1 cm", () => {
    const docs = snowYearsFromResponse(1, 0, 0, { hourly: { time: ["2026-01-01T10:00", "2026-01-01T11:00"], snow_depth: [SNOW_DEPTH_MIN, 0.005] } }, "x");
    expect(Array.from(snowHours(docs))).toEqual([Date.UTC(2026, 0, 1, 10)]);
  });

  it("aylık kayıp: plansız kaybın kar saatlerine düşen kısmı ayrıca, planlı kayıp kara sayılmaz", () => {
    const t = (h: number) => Date.UTC(2026, 0, 5, h);
    const hours = [10, 11, 12].map((h) => ({ t: t(h), uevm: 0, ptf: 1000 }));
    const lost = new Map([
      [t(10), "unplanned" as const],
      [t(11), "unplanned" as const],
      [t(12), "planned" as const],
    ]);
    const expected = new Map([
      [t(10), 10],
      [t(11), 20],
      [t(12), 30],
    ]);
    const [m] = monthlyLoss(hours, { lost, expected, steadyFrom: null }, { snow: new Set([t(11), t(12)]) });
    expect(m.unplannedLossMwh).toBe(30);
    expect(m.snowLossMwh).toBe(20);
    expect(m.snowHours).toBe(1);
    const [plain] = monthlyLoss(hours, { lost, expected, steadyFrom: null });
    expect(plain.snowLossMwh).toBeUndefined();
  });

  it("saatlik kayıp dosyası: kar saati kısıntı sayılmaz, ayrıca yazılır", () => {
    const acc = hourlyLossAccumulator("GES", [2026]);
    acc.add(Date.UTC(2026, 0, 1, 10), 5, "long");
    acc.excludeSnow(7);
    const f = acc.toFile();
    expect(f.snowMwh).toBe(7);
    expect(f.years["2026"].long[10]).toBe(5);
  });
});
