import { describe, it, expect } from "vitest";
import { coverageState, MarketCoverage } from "../components/use-market-coverage";

const cov = (calendarHours: number, calendarVerifiedHours: number): MarketCoverage => ({
  totalHours: calendarHours * 4,
  verifiedHours: calendarVerifiedHours * 4,
  missingPriceHours: 0,
  epiasHours: calendarVerifiedHours * 4,
  fileHours: 0,
  lastSyncedAt: null,
  calendarHours,
  calendarVerifiedHours,
  months: [],
});

describe("Piyasa verisi göstergesi durumu", () => {
  it("Takvim saatlerine göre tam / kısmi / yok / boş", () => {
    expect(coverageState(cov(8760, 8760))).toBe("complete");
    expect(coverageState(cov(8760, 8000))).toBe("partial");
    expect(coverageState(cov(8760, 0))).toBe("none");
    expect(coverageState(cov(0, 0))).toBe("empty");
    expect(coverageState(null)).toBe("empty");
  });
});
