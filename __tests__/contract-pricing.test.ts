import { describe, it, expect } from "vitest";
import { contractFormBacktest, DEFAULT_MARGIN_SHARE, priceContract } from "@/lib/analysis/contract-pricing";

describe("Sözleşme fiyatı (16.1)", () => {
  it("üç çizgi, PTF oranı ve kötü senaryo: elle hesaplanmış örnek", () => {
    const p = priceContract({ fairUnitTl: 40, standaloneUnitTl: 100, capturePtfTl: 2000, worstRatio: 1.5 });
    expect(p.marginShare).toBe(DEFAULT_MARGIN_SHARE);
    expect(p.floorTl).toBe(40);
    expect(p.ceilingTl).toBe(100);
    expect(p.roomTl).toBe(60);
    expect(p.offerTl).toBe(70); // 40 + 0,5 × 60
    expect(p.marginTl).toBe(30);
    expect(p.offerPctOfPtf).toBeCloseTo(3.5, 9); // 70 / 2000
    expect(p.worst).toEqual({ ratio: 1.5, floorTl: 60, marginTl: 10 });
    expect(p.zeroFloored).toBe(false);
    expect(p.reason).toBeNull();
  });

  it("taban ≤ öneri ≤ tavan; marj payı 0–1 aralığına sıkıştırılır", () => {
    for (const share of [-1, 0, 0.25, 0.5, 1, 3]) {
      const p = priceContract({ fairUnitTl: 20, standaloneUnitTl: 80, capturePtfTl: null, worstRatio: null, marginShare: share });
      expect(p.offerTl!).toBeGreaterThanOrEqual(p.floorTl);
      expect(p.offerTl!).toBeLessThanOrEqual(p.ceilingTl);
    }
    expect(priceContract({ fairUnitTl: 20, standaloneUnitTl: 80, capturePtfTl: null, worstRatio: null, marginShare: 3 }).offerTl).toBe(80);
    expect(priceContract({ fairUnitTl: 20, standaloneUnitTl: 80, capturePtfTl: null, worstRatio: null, marginShare: -1 }).offerTl).toBe(20);
  });

  it("pazarlık alanı yoksa teklif yok ve nedeni yazılır", () => {
    const p = priceContract({ fairUnitTl: 120, standaloneUnitTl: 100, capturePtfTl: 2000, worstRatio: 1.5 });
    expect(p.offerTl).toBeNull();
    expect(p.marginTl).toBeNull();
    expect(p.offerPctOfPtf).toBeNull();
    expect(p.worst!.marginTl).toBeNull();
    expect(p.reason).toMatch(/kazandırmıyor/);
    const zero = priceContract({ fairUnitTl: -5, standaloneUnitTl: 0, capturePtfTl: 2000, worstRatio: null });
    expect(zero.offerTl).toBeNull();
    expect(zero.reason).toMatch(/alan yok/);
  });

  it("negatif taban: öneri 0'a çekilir ve işaretlenir; kötü senaryo hesaplanmaz", () => {
    const p = priceContract({ fairUnitTl: -50, standaloneUnitTl: 20, capturePtfTl: 2000, worstRatio: 1.5 });
    expect(p.roomTl).toBe(70);
    expect(p.offerTl).toBe(0); // −50 + 35 = −15 → 0
    expect(p.zeroFloored).toBe(true);
    expect(p.marginTl).toBe(50);
    expect(p.offerPctOfPtf).toBe(0);
    expect(p.worst).toBeNull();
  });

  it("PTF bilinmiyorsa oran yok", () => {
    expect(priceContract({ fairUnitTl: 40, standaloneUnitTl: 100, capturePtfTl: null, worstRatio: null }).offerPctOfPtf).toBeNull();
    expect(priceContract({ fairUnitTl: 40, standaloneUnitTl: 100, capturePtfTl: 0, worstRatio: null }).offerPctOfPtf).toBeNull();
  });
});

describe("Sözleşme biçimi sınaması (16.2)", () => {
  const plant = (predicted: number, actual: number, ptfFrom: number | null, ptfTo: number | null, type = "RES") => ({
    type,
    predictedTlPerMwh: predicted,
    actualTlPerMwh: actual,
    capturePtfFrom: ptfFrom,
    capturePtfTo: ptfTo,
  });

  it("sabit TL ve PTF yüzdesi: elle hesaplanmış karşılama ve zarar payı", () => {
    // A: tahmin 100, gerçek 125, PTF 2500 → 2000. Sabit 100/125 = 0,8; PTF payı 0,8 × 0,8 = 0,64
    // B: tahmin 100, gerçek 80,  PTF 2000 → 2500. Sabit 1,25; PTF payı 1,25 × 1,25 = 1,5625
    const r = contractFormBacktest([plant(100, 125, 2500, 2000), plant(100, 80, 2000, 2500)], [0, 0.5]);
    const all = r.ALL;
    expect(all.n).toBe(2);
    expect(all.ptfChangeMedian).toBeCloseTo((0.8 + 1.25) / 2, 9);
    expect(all.forms.fixed.cover.p50).toBeCloseTo((0.8 + 1.25) / 2, 9);
    expect(all.forms.ptfShare.cover.p50).toBeCloseTo((0.64 + 1.5625) / 2, 9);
    // m = 0: yalnız A zarar eder; m = 0,5: sabitte A kurtulur (1,2), PTF payında kurtulamaz (0,96 < 1)
    expect(all.forms.fixed.lossSharePct).toEqual({ "0": 50, "0.5": 0 });
    expect(all.forms.ptfShare.lossSharePct).toEqual({ "0": 50, "0.5": 50 });
    expect(r.RES.n).toBe(2);
  });

  it("eksik ya da sıfır değerli santral dışarıda; teknoloji ayrı gruplanır", () => {
    const r = contractFormBacktest([plant(100, 100, 2000, 2000, "GES"), plant(0, 50, 2000, 2000), plant(100, 50, null, 2000), plant(100, 50, 2000, 0)]);
    expect(r.ALL.n).toBe(1);
    expect(r.GES.n).toBe(1);
    expect(r.RES).toBeUndefined();
    expect(r.ALL.forms.fixed.lossSharePct["0"]).toBe(0);
  });
});
