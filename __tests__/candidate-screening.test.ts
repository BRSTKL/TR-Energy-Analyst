import { describe, it, expect } from "vitest";
import { MIN_PER_MWH_SHARE, screenCandidates, type ScreeningCandidate, type ScreeningMember } from "@/lib/analysis/candidate-screening";
import { analyzeDsgScenario } from "@/lib/analysis/dsg-scenarios";
import { imbalanceCostOf, processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, type SystemDirection } from "@/lib/calculations/types";

const P = DEFAULT_IMBALANCE_PROFILE;
const t = (i: number, year = 2026) => new Date(Date.UTC(year, 2, 1, i));
const market = (i: number) => {
  const dir: SystemDirection = i % 3 === 0 ? "SURPLUS" : i % 3 === 1 ? "DEFICIT" : "BALANCED";
  const ptf = 2000 + 50 * (i % 5);
  return { ptf, smf: dir === "SURPLUS" ? ptf - 300 : dir === "DEFICIT" ? ptf + 400 : ptf, dir };
};
/** Saat i'de plan ve sapma (gerçekleşen − plan) */
const member = (key: string, deltas: number[]): ScreeningMember => ({
  key,
  name: key,
  plantType: "RES",
  hourly: deltas.map((d, i) => {
    const m = market(i);
    return processHourlyRecord({ timestamp: t(i), forecastMwh: 20, actualMwh: 20 + d }, { timestamp: t(i), ptf: m.ptf, smf: m.smf, systemDirection: m.dir }, P);
  }),
});
const candidate = (key: string, deltas: Array<number | null>): ScreeningCandidate => ({
  key,
  epiasPlantId: Number(key.replace(/\D/g, "")) || 1,
  name: key,
  type: "RES",
  organizationName: null,
  yekdem: null,
  rows: deltas.flatMap((d, i) => (d === null ? [] : [{ timestamp: t(i), forecastMwh: 10, actualMwh: 10 + d }])),
});

describe("imbalanceCostOf", () => {
  it("processHourlyRecord ile aynı maliyet (2025 ve 2026 kuralları, iki yön, üç sistem durumu)", () => {
    for (const year of [2025, 2026])
      for (let i = 0; i < 6; i++)
        for (const d of [-3.5, 0, 2.25]) {
          const m = market(i);
          const rec = { timestamp: t(i, year), ptf: m.ptf, smf: m.smf, systemDirection: m.dir };
          const ref = processHourlyRecord({ timestamp: t(i, year), forecastMwh: 10, actualMwh: 10 + d }, rec, P).imbalanceCost;
          expect(imbalanceCostOf(d, rec, P)).toBeCloseTo(ref, 9);
        }
  });
});

describe("Aday santral taraması", () => {
  const pf = [member("A", [3, -2, 4, -1, 2, -3])];

  it("ters sapan aday tam netleşir, aynı yönde sapan hiç kazandırmaz; sıralama kazanca göre", () => {
    const r = screenCandidates(pf, [candidate("same1", [3, -2, 4, -1, 2, -3]), candidate("opp2", [-3, 2, -4, 1, -2, 3])], P);
    const [first, second] = r.candidates;
    expect(first.key).toBe("opp2");
    // Tam ters: portföy + aday = 0 → kazanç = iki tek başına maliyetin toplamı
    expect(first.gainTl).toBeCloseTo(r.portfolio.costTl + first.standaloneCostTl, 6);
    expect(first.offsettingPct).toBe(100);
    expect(second.key).toBe("same1");
    expect(second.gainTl).toBeCloseTo(0, 9);
    expect(second.offsettingPct).toBe(0);
    expect(first.gainPerMwhTl).toBeCloseTo(first.gainTl / first.actualMwh, 9);
  });

  it("portföy saatlerinin %90'ından azında verisi olan aday elenir", () => {
    const r = screenCandidates(pf, [candidate("gap3", [1, 1, null, 1, 1, 1]), candidate("ok4", [1, 1, 1, 1, 1, 1])], P);
    expect(r.candidates.map((c) => c.key)).toEqual(["ok4"]);
    expect(r.skippedForCoverage).toBe(1);
  });

  it("adil pay: Shapley, dsg-scenarios ile aynı; KÜPST dahil MWh başına prim", () => {
    const members = [member("A", [3, -2, 4, -1, 2, -3]), member("B", [-1, -1, 2, 2, -2, 1])];
    const cand = candidate("c5", [-2, 3, -3, 0.5, 1, 2]);
    const r = screenCandidates(members, [cand], P, { top: 1 });
    const fair = r.candidates[0].fair!;
    expect(fair.method).toBe("shapley");
    const candHourly = member("c5", [-2, 3, -3, 0.5, 1, 2]).hourly;
    const ref = analyzeDsgScenario(
      [...members.map((m) => ({ plantId: m.key, plantName: m.name, plantType: "RES", hourly: m.hourly })), { plantId: "c5", plantName: "c5", plantType: "RES", hourly: candHourly }],
      ["A", "B", "c5"],
      P
    ).allocation!.find((a) => a.id === "shapley")!.shares.find((s) => s.plantId === "c5")!;
    expect(fair.allocatedCostTl).toBeCloseTo(ref.allocatedCost, 6);
    const mwh = r.candidates[0].actualMwh;
    expect(fair.fairUnitTl).toBeCloseTo((fair.allocatedCostTl + fair.kupstTl) / mwh, 9);
    expect(fair.standaloneUnitTl).toBeCloseTo((r.candidates[0].standaloneCostTl + fair.kupstTl) / mwh, 9);
  });

  it("üye sayısı tam Shapley sınırını aşarsa iki oyunculu pay: tek başına maliyet − kazanç / 2", () => {
    const members = Array.from({ length: 8 }, (_, i) => member(`M${i}`, [1, -1, 1, -1, 1, -1].map((d) => d * (i + 1))));
    const r = screenCandidates(members, [candidate("c6", [-2, 2, -2, 2, -2, 2])], P, { top: 1 });
    const c = r.candidates[0];
    expect(c.fair!.method).toBe("two-player");
    expect(c.fair!.allocatedCostTl).toBeCloseTo(c.standaloneCostTl - c.gainTl / 2, 9);
  });

  it("MWh başına sıralama: büyük adaylar kazanç/MWh'a göre, portföyün %5'inden küçük üretimli aday sonda", () => {
    const small = (key: string, deltas: number[]): ScreeningCandidate => ({
      ...candidate(key, []),
      rows: deltas.map((d, i) => ({ timestamp: t(i), forecastMwh: 0.8, actualMwh: 0.8 + d })),
    });
    const cands = [
      candidate("big7", [-3, 2, -4, 1, -2, 3]), // tam ters, büyük kazanç
      candidate("mid8", [-1, 1, -1, 0, -1, 1]), // kısmen ters
      small("tiny9", [-0.7, 0.7, -0.7, 0.7, -0.7, 0.7]),
    ];
    const total = screenCandidates(pf, cands, P);
    expect(total.sortBy).toBe("total");
    expect(total.minActualMwh).toBeNull();
    expect(total.candidates[0].key).toBe("big7");

    const r = screenCandidates(pf, cands, P, { sortBy: "perMwh" });
    expect(r.minActualMwh).toBeCloseTo(r.portfolio.actualMwh * MIN_PER_MWH_SHARE, 9);
    const tiny = r.candidates.find((c) => c.key === "tiny9")!;
    expect(tiny.actualMwh).toBeLessThan(r.minActualMwh!);
    // Küçük aday MWh başına en yüksek kazanca sahip olsa bile sonda
    expect(tiny.gainPerMwhTl).toBeGreaterThan(Math.max(...r.candidates.filter((c) => c !== tiny).map((c) => c.gainPerMwhTl)));
    expect(r.candidates[r.candidates.length - 1].key).toBe("tiny9");
    const bigOnes = r.candidates.slice(0, -1);
    for (let i = 1; i < bigOnes.length; i++) expect(bigOnes[i - 1].gainPerMwhTl).toBeGreaterThanOrEqual(bigOnes[i].gainPerMwhTl);
  });
});
