import { describe, it, expect } from "vitest";
import { coveragePct, hourOfDayProfile } from "@/lib/analysis/plant-profile";

const H = 3_600_000;
const day0 = Date.UTC(2026, 0, 1);
const at = (day: number, hour: number) => day0 + day * 24 * H + hour * H;

describe("hourOfDayProfile", () => {
  it("her zaman 24 satır; verisiz saat sıfır", () => {
    const p = hourOfDayProfile([{ t: at(0, 12), mwh: 10, ptf: 1000 }]);
    expect(p).toHaveLength(24);
    expect(p[3]).toMatchObject({ days: 0, avgMwh: 0, avgPtfTl: 0, mwhSharePct: 0, revenueSharePct: 0 });
  });
  it("elle hesaplanmış: iki gün, öğle ucuz akşam pahalı", () => {
    // Saat 12: iki gün, 10 ve 30 MWh, PTF 500 ve 1500 → ort. üretim 20, ort. PTF 1000, gelir 5.000 + 45.000 = 50.000
    // Saat 19: iki gün, 10 MWh ve 0 MWh, PTF 3000 ve 3000 → gelir 30.000
    const p = hourOfDayProfile([
      { t: at(0, 12), mwh: 10, ptf: 500 },
      { t: at(1, 12), mwh: 30, ptf: 1500 },
      { t: at(0, 19), mwh: 10, ptf: 3000 },
      { t: at(1, 19), mwh: 0, ptf: 3000 },
    ]);
    expect(p[12]).toMatchObject({ days: 2, avgMwh: 20, avgPtfTl: 1000 });
    expect(p[19]).toMatchObject({ days: 2, avgMwh: 5, avgPtfTl: 3000 });
    // Toplam üretim 50 MWh: saat 12 payı %80, saat 19 %20; toplam gelir 80.000: %62,5 ve %37,5
    expect(p[12].mwhSharePct).toBeCloseTo(80, 10);
    expect(p[19].mwhSharePct).toBeCloseTo(20, 10);
    expect(p[12].revenueSharePct).toBeCloseTo(62.5, 10);
    expect(p[19].revenueSharePct).toBeCloseTo(37.5, 10);
  });
  it("paylar toplamı %100 (üretim varsa)", () => {
    const p = hourOfDayProfile(Array.from({ length: 48 }, (_, i) => ({ t: day0 + i * H, mwh: i % 5, ptf: 1000 + i })));
    expect(p.reduce((s, r) => s + r.mwhSharePct, 0)).toBeCloseTo(100, 8);
    expect(p.reduce((s, r) => s + r.revenueSharePct, 0)).toBeCloseTo(100, 8);
  });
  it("üretim hiç yoksa paylar 0", () => {
    const p = hourOfDayProfile([{ t: at(0, 5), mwh: 0, ptf: 1000 }]);
    expect(p.every((r) => r.mwhSharePct === 0 && r.revenueSharePct === 0)).toBe(true);
  });
});

describe("coveragePct", () => {
  it("oran ve sınırlar", () => {
    expect(coveragePct(4380, 8760)).toBe(50);
    expect(coveragePct(9000, 8760)).toBe(100);
    expect(coveragePct(10, 0)).toBe(0);
  });
});
