import { describe, expect, it } from "vitest";
import type { ForecastLog } from "@/lib/solar-engine/learning/forecast-log";
import { summarizeProject, sumLog, sumPortfolio } from "@/lib/services/portfolio-forecast";

const flat = (v: number) => Array<number>(24).fill(v);
const log = (
  tech: "GES" | "RES",
  plants: Array<{ id: number; status?: string; mwh?: number }>,
  over: Record<string, unknown> = {}
) =>
  ({
    schema: 1,
    tech,
    targetDate: "2026-11-03",
    issuedAt: "2026-11-02T08:08:00.000Z",
    onTime: true,
    plants: plants.map((p) => ({
      epiasPlantId: p.id,
      name: `P${p.id}`,
      status: p.status ?? "ok",
      hours: p.status && p.status !== "ok" ? undefined : flat(p.mwh ?? 1),
    })),
    ...over,
  }) as unknown as ForecastLog;

describe("sumLog", () => {
  it("yalnız verilen santralleri ve tahmini kurulanları toplar", () => {
    const l = log("GES", [{ id: 1, mwh: 2 }, { id: 2, mwh: 3 }, { id: 3, status: "no-data" }]);
    const s = sumLog(l, new Set([1, 3]), 2)!;
    expect(s.ok).toBe(1);
    expect(s.total).toBe(2);
    expect(s.hours).toEqual(flat(2));
    expect(s.mwh).toBe(48);
  });
  it("kayıt yoksa, santral yoksa ya da hiçbiri eşleşmezse null", () => {
    expect(sumLog(null, new Set([1]), 1)).toBeNull();
    expect(sumLog(log("GES", [{ id: 1 }]), new Set([1]), 0)).toBeNull();
    expect(sumLog(log("GES", [{ id: 1 }]), new Set([9]), 1)).toBeNull();
  });
});

describe("summarizeProject", () => {
  const plants = [
    { epiasPlantId: 1, type: "GES" },
    { epiasPlantId: 10, type: "RES" },
    { epiasPlantId: 11, type: "RES" },
    { epiasPlantId: 20, type: "HES" },
    { epiasPlantId: null, type: "GES" },
  ];
  it("güneş + rüzgâr toplanır; HES ve eşleşmeyenler kapsam dışı sayılır", () => {
    const s = summarizeProject(
      "p1",
      "Proje",
      plants,
      log("GES", [{ id: 1, mwh: 2 }]),
      log("RES", [{ id: 10, mwh: 5 }, { id: 11, status: "no-data" }])
    );
    expect(s.solar?.ok).toBe(1);
    expect(s.solar?.total).toBe(2); // konumsuz GES de projedeki GES sayısına girer
    expect(s.wind?.ok).toBe(1);
    expect(s.hours).toEqual(flat(7));
    expect(s.mwh).toBe(168);
    expect(s.uncovered).toBe(3); // HES, kimliksiz GES, verisiz RES
    expect(s.plantCount).toBe(5);
  });
  it("yalnız bir teknolojinin kaydı varsa onu verir; hiçbiri yoksa saat yok", () => {
    const onlyWind = summarizeProject("p", "P", plants, null, log("RES", [{ id: 10, mwh: 4 }]));
    expect(onlyWind.solar).toBeNull();
    expect(onlyWind.hours).toEqual(flat(4));
    const none = summarizeProject("p", "P", plants, null, null);
    expect(none.hours).toBeNull();
    expect(none.mwh).toBe(0);
  });
});

describe("sumPortfolio", () => {
  it("aynı santral iki projede olsa da bir kez sayılır", () => {
    const a = [{ epiasPlantId: 1, type: "GES" }];
    const b = [{ epiasPlantId: 1, type: "GES" }, { epiasPlantId: 2, type: "GES" }];
    const t = sumPortfolio([...a, ...b], log("GES", [{ id: 1, mwh: 2 }, { id: 2, mwh: 3 }]), null);
    expect(t.hours).toEqual(flat(5));
    expect(t.mwh).toBe(120);
  });
});
