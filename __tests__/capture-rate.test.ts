import { describe, it, expect } from "vitest";
import { captureStat, groupCapture, monthlyCapture, percentileOf } from "@/lib/analysis/capture-rate";

const H = 3_600_000;
const t0 = Date.UTC(2026, 0, 1);
// Dört saat: PTF 0, 1000, 3000, 4000 → baz 2000
const PTF = [0, 1000, 3000, 4000];
const hours = (mwh: number[]) => mwh.map((m, i) => ({ t: t0 + i * H, mwh: m, ptf: PTF[i] }));

describe("Capture rate (19.1)", () => {
  it("düz üretim = %100; profil kaybı 0", () => {
    const s = captureStat(hours([10, 10, 10, 10]));
    expect(s.baseloadPtfTl).toBe(2000);
    expect(s.capturePriceTl).toBe(2000);
    expect(s.ratePct).toBe(100);
    expect(s.profileLossTl).toBe(0);
  });

  it("ucuz saatlerde yoğun üretim < %100: elle hesaplanmış", () => {
    // Üretim 30, 10, 0, 0 → capture = (30·0 + 10·1000) / 40 = 250; oran %12,5; kayıp = 40·2000 − 10.000 = 70.000
    const s = captureStat(hours([30, 10, 0, 0]));
    expect(s.capturePriceTl).toBe(250);
    expect(s.ratePct).toBeCloseTo(12.5, 12);
    expect(s.profileLossTl).toBe(70000);
    expect(s.zeroSharePct).toBe(75); // PTF 0 saatindeki 30 MWh
    expect(s.lowSharePct).toBe(75); // düşük fiyat PTF < 1000: tam 1000 TL'lik saat sayılmaz, yalnız 0 TL'lik saat
  });

  it("baz PTF her saat bir kez (aynı saat iki santralden gelse de); üretim yoksa oran null", () => {
    const two = [...hours([10, 0, 0, 0]), ...hours([0, 0, 0, 10])];
    const s = captureStat(two);
    expect(s.hours).toBe(4);
    expect(s.baseloadPtfTl).toBe(2000);
    expect(s.capturePriceTl).toBe(2000); // (10·0 + 10·4000) / 20
    expect(captureStat(hours([0, 0, 0, 0])).ratePct).toBeNull();
  });

  it("aylara ve gruplara göre; dağılım küçük santralleri dışarıda bırakır; yüzdelik", () => {
    const feb = Date.UTC(2026, 1, 1);
    const m = monthlyCapture([...hours([10, 10, 10, 10]), { t: feb, mwh: 5, ptf: 500 }]);
    expect(m.map((x) => [x.month, x.ratePct])).toEqual([
      ["2026-01", 100],
      ["2026-02", 100],
    ]);
    const g = groupCapture(
      [
        { key: "a", group: "GES", hours: hours([0, 10, 0, 0]) }, // capture 1000 → %50
        { key: "b", group: "GES", hours: hours([0, 0, 0, 10]) }, // 4000 → %200
        { key: "c", group: "GES", hours: hours([0.1, 0, 0, 0]) }, // 0,1 MWh: dağılım dışı
        { key: "d", group: "RES", hours: hours([10, 10, 10, 10]) },
      ],
      1
    );
    const ges = g.find((x) => x.key === "GES")!;
    expect(ges.plants).toBe(3);
    expect(ges.distribution).toEqual({ n: 2, p10: 65, p50: 125, p90: 185 });
    expect(ges.pooled.capturePriceTl).toBeCloseTo((10 * 1000 + 10 * 4000) / 20.1, 9);
    expect(g.find((x) => x.key === "RES")!.pooled.ratePct).toBe(100);
    expect(percentileOf(125, [50, 100, 150, 200])).toBe(50);
    expect(percentileOf(100, [50, 100, 150, 200])).toBe(37.5);
    expect(percentileOf(1, [])).toBeNull();
  });
});
