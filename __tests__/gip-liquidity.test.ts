import { describe, it, expect } from "vitest";
import { capImpact, liquidityProfile, participationStats, portfolioTradeHours, quantiles } from "@/lib/analysis/gip-liquidity";

describe("GİP katılımı (18.1)", () => {
  it("portföy içinde netleşen düzeltme piyasaya çıkmaz; son planı olmayan santral-saat sayılmaz", () => {
    const t1 = 1;
    const t2 = 2;
    const a = new Map([
      [t1, { firstPlan: 10, finalPlan: 7 }], // −3 MWh satış iptali: +3
      [t2, { firstPlan: 10, finalPlan: 12 }], // −2
    ]);
    const b = new Map([
      [t1, { firstPlan: 5, finalPlan: 8 }], // −3: a ile netleşir
      [t2, { firstPlan: 5, finalPlan: null }], // son plan yok
    ]);
    const volume = new Map([
      [t1, 100],
      [t2, 40],
    ]);
    const r = portfolioTradeHours([a, b], volume);
    expect(r.coveragePct).toBe(75);
    expect(r.hours).toEqual([
      { t: t1, tradeMwh: 0, gipVolumeMwh: 100, share: 0 },
      { t: t2, tradeMwh: 2, gipVolumeMwh: 40, share: 0.05 },
    ]);
  });

  it("GİP hacmi olmayan saat dışarıda", () => {
    const r = portfolioTradeHours([new Map([[1, { firstPlan: 3, finalPlan: 1 }]])], new Map([[1, 0]]));
    expect(r.hours).toEqual([]);
    expect(r.coveragePct).toBe(0);
  });

  it("dağılım ve sınırın etkisi: elle hesaplanmış", () => {
    const hours = [0.01, 0.02, 0.05, 0.2].map((share, i) => ({ t: i, tradeMwh: share * 100, gipVolumeMwh: 100, share }));
    const s = participationStats(hours);
    expect(s.hours).toBe(4);
    expect(s.share.max).toBe(0.2);
    expect(s.share.p50).toBeCloseTo(0.035, 12);
    expect(s.activePct).toBe(100);
    // Sınır %5: yalnız 20 MWh'lik saat bağlar, 15 MWh kesilir (toplam 28 MWh'in %53,6'sı)
    const c = capImpact(hours, 0.05);
    expect(c.bindingPct).toBe(25);
    expect(c.cutTradePct).toBeCloseTo((15 / 28) * 100, 9);
    expect(quantiles([]).p90).toBe(0);
  });
});

describe("GİP likidite profili (18.1)", () => {
  it("aya ve saate göre medyan; hacme göre fiyat aralığı", () => {
    const h = (iso: string, volumeMwh: number, price: number, min: number, max: number) => ({
      t: Date.parse(iso),
      volumeMwh,
      price,
      minPrice: min,
      maxPrice: max,
    });
    const p = liquidityProfile([
      h("2026-01-01T00:00:00Z", 100, 1000, 900, 1100),
      h("2026-01-01T01:00:00Z", 300, 1000, 980, 1020),
      h("2026-02-01T00:00:00Z", 200, 1000, 950, 1050),
      h("2026-02-01T01:00:00Z", 0, 1000, 1000, 1000), // hacimsiz: dışarıda
      h("2026-02-01T02:00:00Z", 400, 1000, 990, 1010),
    ]);
    expect(p.byMonth.map((m) => [m.month, m.hours, m.median])).toEqual([
      ["2026-01", 2, 200],
      ["2026-02", 2, 300],
    ]);
    expect(p.byHour.find((x) => x.hour === 0)!.median).toBe(150);
    // Hacim arttıkça aralık daralıyor: en düşük hacimli saat %20, en yüksek %2
    expect(p.rangeByVolume[0].rangePct).toBeCloseTo(20, 9);
    expect(p.rangeByVolume[p.rangeByVolume.length - 1].rangePct).toBeCloseTo(2, 9);
  });
});
