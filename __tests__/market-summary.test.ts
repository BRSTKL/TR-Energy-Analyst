import { describe, it, expect } from "vitest";
import { compareMarkets, pairMonths, summarizeMarket, type MarketHour } from "@/lib/analysis/market-summary";

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
    // Mayıs: bir açık bir fazla saat, makas 400 ve 500, GİP (100×10 + 1900×30) / 40
    expect(s.monthly[0]).toMatchObject({ deficitPct: 50, surplusPct: 50, balancedPct: 0, spreadMean: 450, spreadP90: 490, gipWeightedPrice: 1450 });
    expect(s.monthly[1].gipWeightedPrice).toBeNull();
    expect(s.hourProfile[0]).toMatchObject({ hours: 0, balancedPct: 0, gipWeightedPrice: null });
    expect(summarizeMarket([])).toBeNull();
  });

  it("iki dönemin karşılaştırma cümleleri makasla başlar", () => {
    const prev = summarizeMarket([h("2025-05-01T12:00:00Z", 2500, 2900, "DEFICIT"), h("2025-05-01T13:00:00Z", 2400, 2000, "SURPLUS")])!;
    const cur = summarizeMarket(hours)!;
    const lines = compareMarkets(prev, cur, "2025", "2026");
    expect(lines[0]).toMatch(/^SMF–PTF makası %25 daraldı/);
    expect(lines.some((l) => l.startsWith("Ortalama PTF %41 düştü"))).toBe(true);
    expect(lines.some((l) => l === "Sıfır fiyatlı saat 0 → 1. 1.000 TL/MWh altındaki saat 0 → 2.")).toBe(true);
  });

  it("aylar bir önceki yılın aynı ayıyla eşlenir; makasın ay ay tutarlılığı cümlede", () => {
    const month = (y: number, m: string, spread: number) => [
      h(`${y}-${m}-01T10:00:00Z`, 2000, 2000 + spread, "DEFICIT"),
      h(`${y}-${m}-01T11:00:00Z`, 2000, 2000 - spread, "SURPLUS"),
    ];
    const prev = summarizeMarket([...month(2025, "01", 100), ...month(2025, "02", 300), ...month(2025, "03", 100)])!;
    const cur = summarizeMarket([...month(2026, "01", 200), ...month(2026, "02", 250), ...month(2026, "03", 300), ...month(2026, "04", 50)])!;
    expect(pairMonths(prev, cur).map((p) => [p.key, p.cur.spreadMean, p.prev?.spreadMean ?? null])).toEqual([
      ["2026-01", 200, 100],
      ["2026-02", 250, 300],
      ["2026-03", 300, 100],
      ["2026-04", 50, null],
    ]);
    expect(pairMonths(null, cur).every((p) => p.prev === null)).toBe(true);
    const lines = compareMarkets(prev, cur, "2025", "2026");
    // Makas: 1000/6 → 1600/8 TL, %20 açıldı; Ocak ve Mart geniş, Şubat dar, Nisan eşsiz
    expect(lines[0]).toMatch(/^SMF–PTF makası %20 açıldı: saat başına ortalama 167 TL'den 200 TL'ye/);
    expect(lines[1]).toBe("Makas, karşılaştırılan 3 aydan 2 ayda geçen yılın aynı ayından geniş.");
    const all = compareMarkets(prev, summarizeMarket([...month(2026, "01", 400), ...month(2026, "02", 400), ...month(2026, "03", 400)])!, "2025", "2026");
    expect(all[1]).toBe("Makas, karşılaştırılan 3 ayın hepsinde geçen yılın aynı ayından geniş.");
  });

  it("sıfır fiyatlı saat artışı 'kat' olarak yalnızca önceki dönemde sıfır saat varken yazılır", () => {
    const zeros = (y: number, n: number) => Array.from({ length: n }, (_, i) => h(`${y}-04-${String(1 + Math.floor(i / 10)).padStart(2, "0")}T${String(8 + (i % 10)).padStart(2, "0")}:00:00Z`, 0, 0, "SURPLUS"));
    const base = (y: number) => [h(`${y}-05-01T00:00:00Z`, 2000, 2100, "DEFICIT")];
    const a = summarizeMarket([...base(2025), ...zeros(2025, 10)])!;
    const b = summarizeMarket([...base(2026), ...zeros(2026, 25)])!;
    const none = summarizeMarket(base(2025))!;
    expect(compareMarkets(a, b, "2025", "2026").find((l) => l.startsWith("Sıfır"))).toMatch(/^Sıfır fiyatlı saat 10 → 25: 2,5 kat\./);
    expect(compareMarkets(none, b, "2025", "2026").find((l) => l.startsWith("Sıfır"))).toMatch(/^Sıfır fiyatlı saat 0 → 25\. /);
  });
});
