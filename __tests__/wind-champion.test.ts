import { describe, it, expect } from "vitest";
import { reviewChampion } from "@/lib/solar-engine/learning/self-learning";
import { WIND_BASE_MODEL, WIND_CORRECTION_MODEL } from "@/lib/wind-engine/registry";
const daily = (cost: number) =>
  Object.fromEntries(
    Array.from({ length: 28 }, (_, i) => [
      new Date(Date.UTC(2026, 8, i + 1)).toISOString().slice(0, 10),
      cost,
    ])
  );
const rules = {
  baseModel: WIND_BASE_MODEL,
  candidates: [WIND_BASE_MODEL, WIND_CORRECTION_MODEL],
};
describe("RES şampiyon kararı", () => {
  it("verisiz adaydan rüzgâr temeline döner", () => {
    expect(
      reviewChampion(1, WIND_CORRECTION_MODEL, { [WIND_BASE_MODEL]: daily(100) }, rules)
        ?.to
    ).toBe(WIND_BASE_MODEL);
  });
  it("izin listesi dışındaki ucuz sürümü terfi ettirmez", () => {
    expect(
      reviewChampion(
        1,
        WIND_BASE_MODEL,
        { [WIND_BASE_MODEL]: daily(100), unknown: daily(10) },
        rules
      )
    ).toBeNull();
  });
  it("kanıtlı düzeltmeyi seçer", () => {
    expect(
      reviewChampion(
        1,
        WIND_BASE_MODEL,
        { [WIND_BASE_MODEL]: daily(100), [WIND_CORRECTION_MODEL]: daily(80) },
        rules
      )?.to
    ).toBe(WIND_CORRECTION_MODEL);
  });
});
