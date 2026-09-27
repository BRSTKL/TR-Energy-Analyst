import { describe, it, expect } from "vitest";
import { compareMarkets, summarizeMarket, type MarketHour } from "@/lib/analysis/market-summary";

const h = (iso: string, ptf: number, smf: number, systemDirection: string, gip?: [number, number]): MarketHour => ({
  t: Date.parse(iso),
  ptf,
  smf,
  systemDirection,
  gipPrice: gip?.[0] ?? null,
  gipVolumeMwh: gip?.[1] ?? null,
});

describe("Piyasa özeti", () => {
  const hours = [
    h("2026-05-01T12:00:00Z", 0, 400, "DEFICIT", [100, 10]),
    h("2026-05-01T13:00:00Z", 2000, 1500, "SURPLUS", [1900, 30]),
    h("2026-06-01T12:00:00Z", 800, 1000, "DEFICIT"),
    h("2026-06-01T20:00:00Z", 3000, 3100, "DEFICIT"),
  ];
  it("dağılım, makas, yön, sıfır ve düşük fiyat, GİP ve kırılımlar", () => {
    const s = summarizeMarket(hours)!;
    expect(s).toMatchObject({ start: "2026-05-01", end: "2026-06-01", hours: 4, zeroHours: 1, lowHours: 2 });
    expect(s.ptf.mean).toBe(1450);
    expect(s.spread.mean).toBe((400 + 500 + 200 + 100) / 4);
    // Yönlü makas: açıkta SMF − PTF (400, 200, 100), fazlada PTF − SMF (500)
    expect(s.directionalSpread.deficit).toBeCloseTo(700 / 3, 10);
    expect(s.directionalSpread.surplus).toBe(500);
    expect(s.direction.deficitPct).toBe(75);
    // GİP hacim ağırlıklı: (100×10 + 1900×30) / 40
    expect(s.gip).toMatchObject({ hours: 2, totalVolumeMwh: 40, avgHourlyVolumeMwh: 20 });
    expect(s.gip.weightedPrice).toBeCloseTo(1450, 10);
    expect(s.monthly.map((m) => [m.key, m.hours, m.zeroHours])).toEqual([["2026-05", 2, 1], ["2026-06", 2, 0]]);
    expect(s.hourProfile).toHaveLength(24);
    expect(s.hourProfile[12]).toMatchObject({ hours: 2, zeroHours: 1 });
    expect(summarizeMarket([])).toBeNull();
  });

  it("iki dönemin karşılaştırma cümleleri makasla başlar", () => {
    const prev = summarizeMarket([h("2025-05-01T12:00:00Z", 2500, 2900, "DEFICIT"), h("2025-05-01T13:00:00Z", 2400, 2000, "SURPLUS")])!;
    const cur = summarizeMarket(hours)!;
    const lines = compareMarkets(prev, cur, "2025", "2026");
    expect(lines[0]).toMatch(/^SMF–PTF makası %25 daraldı/);
    expect(lines.some((l) => l.startsWith("Ortalama PTF %41 düştü"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Sıfır fiyatlı saat 0 → 1"))).toBe(true);
  });
});
