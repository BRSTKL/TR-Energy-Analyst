import { describe, it, expect } from "vitest";
import { buildOutageIndex, wallClockMs } from "../lib/analysis/outage-capacity";
import { buildFeatureRows, featureNames, HOUR_MS, type DirectionHour } from "../lib/analysis/direction-features";

const H = HOUR_MS;
const wall = (s: string) => Date.parse(`${s}Z`); // duvar saati (UTC alanlarında)

describe("buildOutageIndex", () => {
  const idx = buildOutageIndex([
    // 10:00–14:00 Türkiye: 100 − 40 = 60 MW
    { id: 1, caseStartDate: "2025-03-01T10:00:00+03:00", caseEndDate: "2025-03-01T14:00:00+03:00", operatorPower: 100, capacityAtCaseTime: 40 },
    // 12:00–20:00: 500 MW
    { id: 2, caseStartDate: "2025-03-01T12:00:00+03:00", caseEndDate: "2025-03-01T20:00:00+03:00", operatorPower: 500, capacityAtCaseTime: 0 },
    // Aynı kimlik ikinci kez: sayılmaz
    { id: 2, caseStartDate: "2025-03-01T12:00:00+03:00", caseEndDate: "2025-03-01T20:00:00+03:00", operatorPower: 500, capacityAtCaseTime: 0 },
    // Kayıp yok (kapasite güçten büyük) ve bitişsiz: atlanır
    { id: 3, caseStartDate: "2025-03-01T12:00:00+03:00", caseEndDate: "2025-03-01T13:00:00+03:00", operatorPower: 10, capacityAtCaseTime: 20 },
    { id: 4, caseStartDate: "2025-03-01T12:00:00+03:00", caseEndDate: null, operatorPower: 10, capacityAtCaseTime: 0 },
  ]);

  it("süren kapasite: başlangıç dahil, bitiş hariç; Türkiye saati duvar saatine çevrilir", () => {
    expect(idx.activeMw(wall("2025-03-01T09:59:59"))).toBe(0);
    expect(idx.activeMw(wall("2025-03-01T10:00:00"))).toBe(60);
    expect(idx.activeMw(wall("2025-03-01T13:00:00"))).toBe(560);
    expect(idx.activeMw(wall("2025-03-01T14:00:00"))).toBe(500);
    expect(idx.activeMw(wall("2025-03-01T20:00:00"))).toBe(0);
    expect(idx.used).toBe(2);
    expect(idx.skipped).toBe(2);
  });

  it("+03:00 zamanı duvar saatine çevirir", () => {
    expect(wallClockMs("2025-03-01T10:00:00+03:00")).toBe(wall("2025-03-01T10:00:00"));
    expect(wallClockMs(null)).toBeNull();
  });
});

describe("buildFeatureRows + arıza girdisi", () => {
  const start = Date.UTC(2025, 0, 1);
  const hours: DirectionHour[] = Array.from({ length: 70 * 24 }, (_, i) => ({ t: start + i * H, ptf: 2000, smf: i % 3 ? 2500 : 1500, deficit: i % 3 !== 0 }));
  const seen: number[] = [];
  const outage = { activeMw: (t: number) => (seen.push(t), 1000), from: start };

  for (const infoTime of ["D-1", "H-2"] as const) {
    it(`${infoTime}: arıza girdisi yalnız karar anında ve öncesinde sorgulanır`, () => {
      seen.length = 0;
      const { rows } = buildFeatureRows(hours, infoTime, { outage });
      expect(rows.length).toBeGreaterThan(0);
      const names = featureNames(infoTime, { outage });
      expect(names.slice(-2)).toEqual(["outageGw", "outageGwChange7d"]);
      for (const r of rows) {
        expect(r.x).toHaveLength(names.length);
        expect(r.x.at(-2)).toBe(1);
        expect(r.x.at(-1)).toBe(0);
      }
      const maxDecision = Math.max(...rows.map((r) => r.decisionT));
      expect(Math.max(...seen)).toBeLessThanOrEqual(maxDecision);
      // Her sorgu bir satırın karar anına ya da 7 gün öncesine denk gelir
      const allowed = new Set(rows.flatMap((r) => [r.decisionT, r.decisionT - 7 * 24 * H]));
      expect(seen.every((t) => allowed.has(t))).toBe(true);
    });
  }

  it("bildirim verisinin ilk iki haftasına dayanan satırlar kurulmaz", () => {
    const late = { activeMw: () => 0, from: start + 30 * 24 * H };
    const withOutage = buildFeatureRows(hours, "H-2", { outage: late });
    const without = buildFeatureRows(hours, "H-2");
    const first = Math.min(...withOutage.rows.map((r) => r.decisionT));
    expect(first - 7 * 24 * H).toBeGreaterThanOrEqual(late.from + 7 * 24 * H);
    expect(withOutage.rows.length).toBeLessThan(without.rows.length);
  });
});
