import { describe, it, expect } from "vitest";
import {
  calculateArbitrageOpportunity,
  aggregateArbitrageOpportunity,
  rankTopArbitrageHours,
  evaluateIntradayArbitrage,
  intradayClosingScenario,
} from "@/lib/analysis/intraday-arbitrage";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { HourlyResult } from "@/lib/calculations/types";

describe("Gün İçi Piyasası (GİP) Arbitraj Analiz Motoru Birim Testleri", () => {
  describe("1. calculateArbitrageOpportunity", () => {
    it("GİP verisi null veya undefined olduğunda çökmeden 0 döndürmelidir", () => {
      expect(calculateArbitrageOpportunity(10, null, 2500, 3000)).toBe(0);
      expect(calculateArbitrageOpportunity(-10, undefined, 2500, 3000)).toBe(0);
      expect(calculateArbitrageOpportunity(10, NaN, 2500, 3000)).toBe(0);
    });

    it("Dengesizlik miktarı 0 olduğunda 0 döndürmelidir", () => {
      expect(calculateArbitrageOpportunity(0, 2800, 2500, 3000)).toBe(0);
    });

    describe("Pozitif dengesizlik (imbalance > 0, fazla üretim) senaryoları", () => {
      it("GİP fiyatı pozitif dengesizlik fiyatından yüksekse pozitif fırsat üretmelidir", () => {
        // 10 MWh fazla üretim
        // GİP Satış Fiyatı: 2.800 ₺, EPİAŞ Pozitif Dengesizlik Alım Fiyatı: 2.500 ₺
        // Kaçırılan Fırsat = (2.800 - 2.500) * 10 = +3.000 ₺
        const opportunity = calculateArbitrageOpportunity(10, 2800, 2500, 3100);
        expect(opportunity).toBe(3000);
      });

      it("GİP fiyatı pozitif dengesizlik fiyatından düşükse negatif fırsat üretmeli ve sıfırlanmamalıdır", () => {
        // 10 MWh fazla üretim
        // GİP Fiyatı: 2.200 ₺, EPİAŞ Dengesizlik Fiyatı: 2.500 ₺
        // Fırsat = (2.200 - 2.500) * 10 = -3.000 ₺ (GİP'e gitmeyip dengesizlikte kalmak doğru karardı)
        const opportunity = calculateArbitrageOpportunity(10, 2200, 2500, 3100);
        expect(opportunity).toBe(-3000);
      });
    });

    describe("Negatif dengesizlik (imbalance < 0, enerji açığı) senaryoları", () => {
      it("GİP fiyatı negatif dengesizlik ceza fiyatından ucuzsa pozitif fırsat üretmelidir", () => {
        // -15 MWh enerji açığı
        // EPİAŞ Negatif Dengesizlik Ceza Fiyatı: 3.200 ₺, GİP'ten Alım Fiyatı: 2.700 ₺
        // Kaçırılan Fırsat = (3.200 - 2.700) * 15 = +7.500 ₺
        const opportunity = calculateArbitrageOpportunity(-15, 2700, 2400, 3200);
        expect(opportunity).toBe(7500);
      });

      it("GİP fiyatı negatif dengesizlik cezasından daha pahalıysa negatif fırsat üretmelidir", () => {
        // -15 MWh enerji açığı
        // EPİAŞ Ceza Fiyatı: 3.200 ₺, GİP Fiyatı: 3.500 ₺
        // Fırsat = (3.200 - 3.500) * 15 = -4.500 ₺ (GİP'ten almamak ve cezayı ödemek daha avantajlıydı)
        const opportunity = calculateArbitrageOpportunity(-15, 3500, 2400, 3200);
        expect(opportunity).toBe(-4500);
      });
    });
  });

  describe("2. aggregateArbitrageOpportunity", () => {
    const mockHourlyResults: HourlyResult[] = [
      {
        timestamp: "2025-05-10T10:00:00.000Z",
        actualMwh: 100,
        forecastMwh: 90, // +10 MWh surplus
        ptf: 2600,
        smf: 2400,
        systemDirection: "SURPLUS",
        imbalanceMwh: 10,
        positivePrice: 2256, // min * 0.94
        negativePrice: 2678,
        imbalanceAmount: 22560,
        dayAheadSalesAmount: 234000,
        totalRevenue: 256560,
        unitRevenue: 2565.6,
        fictiveRevenue: 260000,
        imbalanceCost: 3440,
        unitImbalanceCost: 34.4,
        gipPrice: 2556, // 300 TL/MWh higher than positivePrice -> +3,000 TL
      },
      {
        timestamp: "2025-05-10T11:00:00.000Z",
        actualMwh: 80,
        forecastMwh: 90, // -10 MWh deficit
        ptf: 2600,
        smf: 3000,
        systemDirection: "DEFICIT",
        imbalanceMwh: -10,
        positivePrice: 2522,
        negativePrice: 3180, // max * 1.06
        imbalanceAmount: -31800,
        dayAheadSalesAmount: 234000,
        totalRevenue: 202200,
        unitRevenue: 2527.5,
        fictiveRevenue: 208000,
        imbalanceCost: 5800,
        unitImbalanceCost: 72.5,
        gipPrice: 2780, // 400 TL/MWh cheaper than negativePrice -> +4,000 TL
      },
      {
        timestamp: "2025-05-10T12:00:00.000Z",
        actualMwh: 100,
        forecastMwh: 90, // +10 MWh surplus
        ptf: 2600,
        smf: 2400,
        systemDirection: "SURPLUS",
        imbalanceMwh: 10,
        positivePrice: 2256,
        negativePrice: 2678,
        imbalanceAmount: 22560,
        dayAheadSalesAmount: 234000,
        totalRevenue: 256560,
        unitRevenue: 2565.6,
        fictiveRevenue: 260000,
        imbalanceCost: 3440,
        unitImbalanceCost: 34.4,
        gipPrice: 2056, // 200 TL/MWh LOWER than positivePrice -> -2,000 TL
      },
      {
        timestamp: "2025-05-10T13:00:00.000Z",
        actualMwh: 90,
        forecastMwh: 90, // 0 imbalance
        ptf: 2600,
        smf: 2600,
        systemDirection: "BALANCED",
        imbalanceMwh: 0,
        positivePrice: 2522,
        negativePrice: 2678,
        imbalanceAmount: 0,
        dayAheadSalesAmount: 234000,
        totalRevenue: 234000,
        unitRevenue: 2600,
        fictiveRevenue: 234000,
        imbalanceCost: 0,
        unitImbalanceCost: 0,
        gipPrice: 2600,
      },
    ];

    it("KRİTİK TEST: Pozitif fırsatları 'Kaçırılan Fırsat' ve negatifleri 'Doğru Verilen Kararlar' olarak AYRI AYRI raporlamalı, birbirine netleştirmemelidir", () => {
      const aggregates = aggregateArbitrageOpportunity(mockHourlyResults, "month");
      expect(aggregates).toHaveLength(1);

      const mayAgg = aggregates[0];
      expect(mayAgg.period).toBe("2025-05");

      // Pozitif fırsatlar: Saat 10 (+3,000) + Saat 11 (+4,000) = 7,000 ₺
      expect(mayAgg.missedOpportunityTl).toBe(7000);

      // Negatif fırsatlar (Doğru Kararlar): Saat 12 (-2,000) -> mutlak değer 2,000 ₺
      expect(mayAgg.correctDecisionsTl).toBe(2000);

      // İkisi birbirine netleştirilip 5.000 yapılmamalıdır
      expect(mayAgg.missedOpportunityTl).not.toBe(5000);

      expect(mayAgg.positiveHoursCount).toBe(2);
      expect(mayAgg.negativeHoursCount).toBe(1);
      expect(mayAgg.neutralHoursCount).toBe(1);
    });

    it("Boş dizi verildiğinde çökmeden boş dizi döndürmelidir", () => {
      expect(aggregateArbitrageOpportunity([])).toEqual([]);
    });
  });

  describe("3. rankTopArbitrageHours", () => {
    it("En yüksek pozitif fırsata sahip saatleri azalan sırada döndürmelidir", () => {
      const hours: HourlyResult[] = [
        {
          timestamp: "2025-05-10T10:00:00.000Z",
          actualMwh: 100,
          forecastMwh: 90,
          ptf: 2500,
          smf: 2500,
          systemDirection: "SURPLUS",
          imbalanceMwh: 10,
          positivePrice: 2350,
          negativePrice: 2600,
          imbalanceAmount: 23500,
          dayAheadSalesAmount: 225000,
          totalRevenue: 248500,
          unitRevenue: 2485,
          fictiveRevenue: 250000,
          imbalanceCost: 1500,
          unitImbalanceCost: 15,
          gipPrice: 2450, // (2450 - 2350) * 10 = +1,000 TL
        },
        {
          timestamp: "2025-05-10T11:00:00.000Z",
          actualMwh: 70,
          forecastMwh: 90,
          ptf: 2500,
          smf: 3000,
          systemDirection: "DEFICIT",
          imbalanceMwh: -20,
          positivePrice: 2400,
          negativePrice: 3180,
          imbalanceAmount: -63600,
          dayAheadSalesAmount: 225000,
          totalRevenue: 161400,
          unitRevenue: 2305.7,
          fictiveRevenue: 175000,
          imbalanceCost: 13600,
          unitImbalanceCost: 194.3,
          gipPrice: 2680, // (3180 - 2680) * 20 = +10,000 TL
        },
        {
          timestamp: "2025-05-10T12:00:00.000Z",
          actualMwh: 100,
          forecastMwh: 90,
          ptf: 2500,
          smf: 2500,
          systemDirection: "SURPLUS",
          imbalanceMwh: 10,
          positivePrice: 2350,
          negativePrice: 2600,
          imbalanceAmount: 23500,
          dayAheadSalesAmount: 225000,
          totalRevenue: 248500,
          unitRevenue: 2485,
          fictiveRevenue: 250000,
          imbalanceCost: 1500,
          unitImbalanceCost: 15,
          gipPrice: 2100, // Negatif fırsat -> sıralamaya girmemeli
        },
        {
          timestamp: "2025-05-10T13:00:00.000Z",
          actualMwh: 100,
          forecastMwh: 90,
          ptf: 2500,
          smf: 2500,
          systemDirection: "SURPLUS",
          imbalanceMwh: 10,
          positivePrice: 2350,
          negativePrice: 2600,
          imbalanceAmount: 23500,
          dayAheadSalesAmount: 225000,
          totalRevenue: 248500,
          unitRevenue: 2485,
          fictiveRevenue: 250000,
          imbalanceCost: 1500,
          unitImbalanceCost: 15,
          gipPrice: null, // GİP yok -> sıralamaya girmemeli
        },
      ];

      const ranked = rankTopArbitrageHours(hours, 10);
      expect(ranked).toHaveLength(2); // Sadece 2 pozitif fırsat

      // 1. sıra: Saat 11 (+10,000 ₺)
      expect(ranked[0].opportunityTl).toBe(10000);
      expect(ranked[0].hourStr).toBe("11:00");
      expect(ranked[0].direction).toBe("DEFICIT");

      // 2. sıra: Saat 10 (+1,000 ₺)
      expect(ranked[1].opportunityTl).toBe(1000);
      expect(ranked[1].hourStr).toBe("10:00");
      expect(ranked[1].direction).toBe("SURPLUS");
    });
  });

  describe("4. evaluateIntradayArbitrage", () => {
    it("GİP verisi hiç olmadığında hasGipData = false dönmeli ve çökmemelidir", () => {
      const recordsWithoutGip: HourlyResult[] = [
        {
          timestamp: "2025-05-10T10:00:00.000Z",
          actualMwh: 100,
          forecastMwh: 90,
          ptf: 2500,
          smf: 2500,
          systemDirection: "SURPLUS",
          imbalanceMwh: 10,
          positivePrice: 2350,
          negativePrice: 2600,
          imbalanceAmount: 23500,
          dayAheadSalesAmount: 225000,
          totalRevenue: 248500,
          unitRevenue: 2485,
          fictiveRevenue: 250000,
          imbalanceCost: 1500,
          unitImbalanceCost: 15,
          gipPrice: null,
        },
      ];

      const overview = evaluateIntradayArbitrage(recordsWithoutGip);
      expect(overview.hasGipData).toBe(false);
      expect(overview.totalMissedOpportunityTl).toBe(0);
      expect(overview.monthlyAggregates).toHaveLength(0);
      expect(overview.topHours).toHaveLength(0);
    });
  });

  describe("5. Net etki, tavan ve kapatma senaryosu", () => {
    // Elle hesaplanabilir iki saat (2025, sabit %3 rejimi):
    // Saat A: +10 MWh fazla, PTF 2000 SMF 2000 → pozitif fiyat 1940; GİP 2100 → fırsat (2100−1940)×10 = +1600
    //         maliyet = 10 × (2000 − 1940) = 600
    // Saat B: −10 MWh açık, PTF 2000 SMF 2000 → negatif fiyat 2060; GİP 2200 → fırsat (2060−2200)×10 = −1400
    //         maliyet = 10 × (2060 − 2000) = 600
    const mk = (h: number, forecast: number, actual: number, gip: number | null) => ({
      ...processHourlyRecord(
        { timestamp: `2025-03-01T${String(h).padStart(2, "0")}:00:00Z`, forecastMwh: forecast, actualMwh: actual },
        { timestamp: `2025-03-01T${String(h).padStart(2, "0")}:00:00Z`, ptf: 2000, smf: 2000, systemDirection: "BALANCED" },
        { mode: "REGULATORY", positiveSurplusCoef: 0.94, positiveOtherCoef: 0.97, negativeDeficitCoef: 1.06, negativeOtherCoef: 1.03 }
      ),
      gipPrice: gip,
    });

    it("Tavanı, dezavantajlı saatleri ve net etkiyi elle hesaplanan değerlerle üretir", () => {
      const o = evaluateIntradayArbitrage([mk(10, 40, 50, 2100), mk(11, 50, 40, 2200)] as HourlyResult[]);
      expect(o.totalMissedOpportunityTl).toBeCloseTo(1600, 6);
      expect(o.totalCorrectDecisionsTl).toBeCloseTo(1400, 6);
      expect(o.netIfAlwaysClosedTl).toBeCloseTo(200, 6);
      expect(o.imbalanceCostWithGipTl).toBeCloseTo(1200, 6);
      expect(o.ceilingShareOfCostPercent).toBeCloseTo(133.3, 1);
      expect(o.netShareOfCostPercent).toBeCloseTo(16.7, 1);
      // Net etki / toplam |dengesizlik| = 200 / 20
      expect(o.avgOpportunityPerMwh).toBeCloseTo(10, 6);
    });

    it("GİP verisi olmayan saatler oranların paydasına girmez", () => {
      const o = evaluateIntradayArbitrage([mk(10, 40, 50, 2100), mk(12, 40, 60, null)] as HourlyResult[]);
      expect(o.imbalanceCostWithGipTl).toBeCloseTo(600, 6);
      expect(o.avgOpportunityPerMwh).toBeCloseTo(160, 6);
    });

    it("Kapatma senaryosu kapatılan payla doğrusal ölçeklenir ve payı 0–100 aralığında sınırlar", () => {
      const base = { netIfAlwaysClosedTl: 200, imbalanceCostWithGipTl: 1200 };
      expect(intradayClosingScenario(base, 25)).toEqual({ sharePercent: 25, gainTl: 50, shareOfCostPercent: 4.2 });
      expect(intradayClosingScenario(base, 150).gainTl).toBe(200);
      expect(intradayClosingScenario(base, -5).gainTl).toBe(0);
      expect(intradayClosingScenario({ netIfAlwaysClosedTl: -300, imbalanceCostWithGipTl: 1200 }, 50).gainTl).toBe(-150);
    });
  });
});
