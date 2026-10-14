import { describe, it, expect } from "vitest";
import { makeConverter, monthsBetween, priceLevelRatio, realChangePct, type MacroSeries } from "@/lib/macro/price-units";
import { macroSeries } from "@/lib/macro/series";

const series: MacroSeries = {
  fetchedAt: "2026-10-14",
  usdTry: { "2025-01": 35, "2025-02": 36, "2026-01": 43 },
  cpi: { "2025-01": 100, "2025-02": 102, "2026-01": 130 },
  sources: { usdTry: "test", cpi: "test" },
};

describe("Fiyat birimleri", () => {
  it("nominal TL çarpanı 1", () => {
    expect(makeConverter(series, "TL").factor("2025-01-15T10:00:00Z")).toBe(1);
  });

  it("reel TL: son TÜFE ayı taban, değer × TÜFE[taban] / TÜFE[ay]", () => {
    const real = makeConverter(series, "REAL");
    expect(real.baseMonth).toBe("2026-01");
    expect(real.label).toBe("Ocak 2026 TL'si");
    expect(real.short).toBe("TL (Oca 2026)");
    expect(real.factor("2025-02-10T00:00:00Z")).toBeCloseTo(130 / 102, 12);
    expect(real.factor("2026-01-31T23:00:00Z")).toBe(1);
    expect(real.filled.size).toBe(0);
  });

  it("USD: değer / kur; serinin dışındaki ay en yakın aya bağlanır ve bildirilir", () => {
    const usd = makeConverter(series, "USD");
    expect(usd.factor("2025-02-01T00:00:00Z")).toBeCloseTo(1 / 36, 12);
    // 2025-06 yok → önceki en yakın 2025-02; 2024-12 yok → ilk ay 2025-01
    expect(usd.factor("2025-06-01T00:00:00Z")).toBeCloseTo(1 / 36, 12);
    expect(usd.factor("2024-12-01T00:00:00Z")).toBeCloseTo(1 / 35, 12);
    expect(Array.from(usd.filled).sort()).toEqual(["2024-12", "2025-06"]);
  });

  it("dönem fiyat oranı ve reel değişim", () => {
    expect(priceLevelRatio(series, ["2025-01", "2025-02"], ["2026-01"])).toBeCloseTo(130 / 101, 12);
    // Nominal +%30, fiyatlar ×1,3 → reel %0
    expect(realChangePct(30, 1.3)).toBeCloseTo(0, 10);
    expect(monthsBetween("2025-11-01", "2026-02-28")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("depodaki seri: TCMB'nin yayımladığı yıllık TÜFE değişimleriyle tutarlı (zincir hatası yok)", () => {
    const { cpi, usdTry } = macroSeries();
    // TCMB Tüketici Fiyatları tablosu, yıllık % değişim
    const official: Array<[string, string, number]> = [
      ["2023-12", "2024-12", 44.38],
      ["2024-12", "2025-12", 30.89],
      ["2025-09", "2026-09", 29.73],
    ];
    for (const [a, b, pct] of official) expect(Math.abs((cpi[b] / cpi[a] - 1) * 100 - pct)).toBeLessThan(0.05);
    for (let y = 2024; y <= 2026; y++) for (let m = 1; m <= (y === 2026 ? 9 : 12); m++) expect(usdTry[`${y}-${String(m).padStart(2, "0")}`]).toBeGreaterThan(25);
  });
});
