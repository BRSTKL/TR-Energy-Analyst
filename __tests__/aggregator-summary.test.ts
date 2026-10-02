import { describe, expect, it } from "vitest";
import { aggregatorSummaryFacts, ownerShort, shortAggregatorName } from "@/lib/export/aggregator-summary-pptx";
import type { AggregatorBenchmarkRow } from "@/lib/analysis/aggregator-benchmark";
import type { AggregatorDetailResult } from "@/lib/services/aggregator-data";

const row = (id: number, mwh: number, index: number, value = 10): AggregatorBenchmarkRow => ({
  id, name: `A${id}`, listedPlants: 5, coveredPlants: 5, byType: {}, byTypeMwh: {}, productionMwh: mwh, plantLevelCostTl: 0,
  ownerLevelCostTl: 0, portfolioCostTl: 0, nettingValueTl: value, nettingPct: 50, nettedTlPerMwh: 50, expectedCostTl: 0, mixAdjustedIndex: index,
});

describe("toplayıcı özeti", () => {
  it("kısa ad: Türkçe büyük/küçük harf ve iki sözcüklü marka", () => {
    expect(shortAggregatorName("INAVITAS TOPLAYICILIK VE ENERJİ TİC. A.Ş. (TOPLAYICI)")).toBe("Inavitas");
    expect(shortAggregatorName("ENERJİSA MÜŞTERİ ÇÖZÜMLERİ A.Ş. (TOPLAYICI)")).toBe("Enerjisa Müşteri");
    expect(shortAggregatorName("GAİN TOPLAYICILIK A.Ş. (TOPLAYICI)")).toBe("Gain");
  });

  it("üretici adı unvanın başından, kelime ortasında kesilmeden", () => {
    expect(ownerShort("KOVANLIK ENERJİ ÜRETİM SAN. VE TİC. A.Ş.")).toBe("KOVANLIK ENERJİ ÜRETİM");
    expect(ownerShort("GALATA WIND ENERJİ A.Ş.")).toBe("GALATA WIND ENERJİ");
    expect(ownerShort("IĞDIR DGES")).toBe("IĞDIR DGES");
  });

  it("bulgular: sıra, en iyi/en kötü ay, pahalı santraller", () => {
    const self = { ...row(1, 2_000_000, 0.5, 20), byTypeMwh: { RES: 1_500_000, HES: 500_000 } };
    const d = {
      id: 1, year: 2026, name: "A1 (TOPLAYICI)", period: { start: "2026-01-01", end: "2026-08-31" }, membershipAsOf: "x", sectorMedians: {},
      summary: self,
      benchmarkRows: [self, row(2, 1_500_000, 0.6), row(3, 1_200_000, 0.4), row(4, 1_100_000, 0.7, 50), row(5, 100_000, 0.9)],
      months: [
        { month: "2026-01", productionMwh: 1, ownerLevelTl: 100, portfolioTl: 30, nettingTl: 70, nettingPct: 70, portfolioTlPerMwh: 1 },
        { month: "2026-02", productionMwh: 1, ownerLevelTl: 100, portfolioTl: 60, nettingTl: 40, nettingPct: 40, portfolioTlPerMwh: 1 },
      ],
      owners: [{ name: "X", plantCount: 1, productionMwh: 1, standaloneTlPerMwh: 1, contributionTl: 5, contributionTlPerMwh: 1 }],
      plants: [
        { epiasPlantId: 1, name: "P-40W000", type: "RES", owner: null, productionMwh: 100, standaloneTl: 0, standaloneTlPerMwh: 150, sectorMedianTlPerMwh: 100, vsMedianPct: 50 },
        { epiasPlantId: 2, name: "Q", type: "RES", owner: null, productionMwh: 100, standaloneTl: 0, standaloneTlPerMwh: 105, sectorMedianTlPerMwh: 100, vsMedianPct: 5 },
      ],
    } as unknown as AggregatorDetailResult;
    const f = aggregatorSummaryFacts(d);
    expect(f.periodLabel).toBe("Ocak–Ağustos 2026");
    expect(f.mix.map((m) => m.type)).toEqual(["RES", "HES"]);
    // 1.000 GWh üstü grup: 1, 2, 3, 4 (5 küçük); endekse göre 3 < 1 < 2 < 4 → 2. sıra; netleşme değerinde 4 önde
    expect(f.rank).toMatchObject({ index: 2, of: 4, value: 2 });
    expect(f.bestMonth).toEqual({ month: "Ocak", pct: 70 });
    expect(f.worstMonth).toEqual({ month: "Şubat", pct: 40 });
    expect(f.expensive).toEqual({ count: 1, excessTl: 5000, worstName: "P" });
  });
});
