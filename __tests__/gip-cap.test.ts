import { describe, it, expect } from "vitest";
import { capTradeMwh } from "@/lib/analysis/intraday-arbitrage";
import { directionHourCost } from "@/lib/analysis/direction-strategy";
import { costWithMultiplier, type PricedHour } from "@/lib/analysis/backtest";
import type { HourlyResult } from "@/lib/calculations/types";

describe("GİP işlem sınırı (18.2)", () => {
  it("saatlik hacmin %10'u; işaret korunur; hacim yoksa sınır yok", () => {
    expect(capTradeMwh(50, 2000)).toBe(50);
    expect(capTradeMwh(300, 2000)).toBe(200);
    expect(capTradeMwh(-300, 2000)).toBe(-200);
    expect(capTradeMwh(300, 2000, 13)).toBe(260);
    expect(capTradeMwh(300, null)).toBe(300);
    expect(capTradeMwh(300, undefined)).toBe(300);
  });

  it("gün içi plan ayarında sınır bağlarsa çarpan 1'e doğru kısılır (portföy serisi)", () => {
    // Plan 2.000 MWh, k = 0,90 → Δ = 200 MWh; GİP hacmi 1.000 → sınır 100 MWh → etkin k = 0,95
    const source = {
      timestamp: new Date(Date.UTC(2026, 0, 1, 12)),
      forecastMwh: 2000,
      actualMwh: 1800,
      ptf: 2000,
      smf: 2400,
      gipPrice: 2100,
      gipVolumeMwh: 1000,
    } as unknown as HourlyResult;
    const h = { source, month: "2026-01", hour: 12, baselineCost: 0, positivePrice: 1940, negativePrice: 2472, prev: () => undefined } as PricedHour;
    const none = () => 0;
    const capped = directionHourCost(h, 0.9, "H-2", none);
    const expected = costWithMultiplier(h, 0.95) + 100 * (2100 - 2000);
    expect(capped).toBeCloseTo(expected, 6);
    // Gün öncesi (D-1) GİP'te değil: sınır uygulanmaz
    expect(directionHourCost(h, 0.9, "D-1", none)).toBeCloseTo(costWithMultiplier(h, 0.9), 6);
    // Hacim bilinmiyorsa sınır yok
    const free = { ...h, source: { ...source, gipVolumeMwh: null } as unknown as HourlyResult };
    expect(directionHourCost(free, 0.9, "H-2", none)).toBeCloseTo(costWithMultiplier(free, 0.9) + 200 * 100, 6);
  });
});
