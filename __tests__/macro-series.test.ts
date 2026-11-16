import { describe, it, expect } from "vitest";
import { pickNewer } from "@/lib/macro/series";
import type { MacroSeries } from "@/lib/macro/price-units";

const s = (last: string): MacroSeries =>
  ({ fetchedAt: "x", usdTry: { [last]: 1 }, cpi: { "2026-01": 100, [last]: 110 }, sources: { cpi: "", usdTry: "" } }) as MacroSeries;

describe("kur / TÜFE serisinin kaynağı", () => {
  it("son TÜFE ayı daha yeni olan seri kullanılır; veri dizininde dosya yoksa depodaki", () => {
    expect(pickNewer(s("2026-10"), s("2026-09")).cpi["2026-10"]).toBe(110);
    expect(pickNewer(s("2026-08"), s("2026-09")).cpi["2026-09"]).toBe(110);
    expect(pickNewer(null, s("2026-09")).cpi["2026-09"]).toBe(110);
  });
});
