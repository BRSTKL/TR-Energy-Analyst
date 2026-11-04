import { describe, expect, it } from "vitest";
import { monthRangeLabel } from "@/lib/format";

describe("monthRangeLabel", () => {
  it("aynı yıl içinde aralık", () => {
    expect(monthRangeLabel(["2026-03", "2026-01", "2026-09", "2026-02"])).toMatchObject({
      label: "Ocak–Eylül 2026",
      months: 4,
      missing: 5,
      last: "Eylül 2026",
    });
  });
  it("tek ay ve yıl aşan dönem", () => {
    expect(monthRangeLabel(["2026-09"])?.label).toBe("Eylül 2026");
    expect(monthRangeLabel(["2025-12", "2026-01"])).toMatchObject({ label: "Aralık 2025 – Ocak 2026", missing: 0 });
  });
  it("boş ya da bozuk liste", () => {
    expect(monthRangeLabel([])).toBeNull();
    expect(monthRangeLabel(["2026-1"])).toBeNull();
  });
});
