import { describe, it, expect } from "vitest";
import {
  calculateEfficiencyRatio,
  rankPeriodsByEfficiency,
  detectForecastBias,
  simulateBiasCorrectedForecast,
  calculatePotentialUplift,
} from "../lib/analysis/planning-efficiency";
import { processHourlyRecord } from "../lib/calculations/engine";
import {
  HourlyRecord,
  HourlyResult,
  MarketPriceRecord,
  DEFAULT_IMBALANCE_PROFILE,
} from "../lib/calculations/types";

describe("Planlama Verimliliği & 'Ne Olurdu?' Simülasyon Motoru Birim Testleri", () => {
  describe("1. calculateEfficiencyRatio", () => {
    it("Mükemmel tahmin senaryosunda (totalRevenue == fictiveRevenue) efficiency ratio tam 1.0 olmalıdır", () => {
      const ratio = calculateEfficiencyRatio(250000, 250000);
      expect(ratio).toBe(1.0);
    });

    it("Dengesizlik kaybı olduğunda (totalRevenue < fictiveRevenue) ratio < 1.0 olmalıdır", () => {
      // 200.000 TL fiili gelir / 250.000 TL fiktif gelir = 0.80
      const ratio = calculateEfficiencyRatio(200000, 250000);
      expect(ratio).toBe(0.8);
    });

    it("fictiveRevenue 0 veya negatif ise sıfıra bölme hatası vermeden 0 döndürmelidir", () => {
      expect(calculateEfficiencyRatio(100000, 0)).toBe(0);
      expect(calculateEfficiencyRatio(0, 0)).toBe(0);
      expect(calculateEfficiencyRatio(50000, -100)).toBe(0);
      expect(calculateEfficiencyRatio(NaN, 100)).toBe(0);
    });
  });

  describe("2. rankPeriodsByEfficiency", () => {
    // 2 farklı güne ait 4 saatlik veri
    const mockHourlyResults: HourlyResult[] = [
      // Gün 1: 2026-05-10 (Büyük kayıp)
      {
        timestamp: "2026-05-10T10:00:00Z",
        actualMwh: 20,
        forecastMwh: 50, // -30 MWh dengesizlik
        ptf: 2500,
        smf: 3200,
        systemDirection: "DEFICIT",
        imbalanceMwh: -30,
        positivePrice: 2425,
        negativePrice: 3392,
        imbalanceAmount: -101760,
        dayAheadSalesAmount: 125000,
        totalRevenue: 23240,
        unitRevenue: 1162,
        fictiveRevenue: 50000,
        imbalanceCost: 26760,
        unitImbalanceCost: 1338,
        plantId: "p1",
        plantName: "Test RES",
      },
      {
        timestamp: "2026-05-10T11:00:00Z",
        actualMwh: 30,
        forecastMwh: 50,
        ptf: 2500,
        smf: 3000,
        systemDirection: "DEFICIT",
        imbalanceMwh: -20,
        positivePrice: 2425,
        negativePrice: 3180,
        imbalanceAmount: -63600,
        dayAheadSalesAmount: 125000,
        totalRevenue: 61400,
        unitRevenue: 2046.6,
        fictiveRevenue: 75000,
        imbalanceCost: 13600,
        unitImbalanceCost: 453.3,
        plantId: "p1",
        plantName: "Test RES",
      },
      // Gün 2: 2026-05-11 (Küçük kayıp / neredeyse kusursuz)
      {
        timestamp: "2026-05-11T10:00:00Z",
        actualMwh: 50,
        forecastMwh: 50,
        ptf: 2500,
        smf: 2500,
        systemDirection: "BALANCED",
        imbalanceMwh: 0,
        positivePrice: 2425,
        negativePrice: 2575,
        imbalanceAmount: 0,
        dayAheadSalesAmount: 125000,
        totalRevenue: 125000,
        unitRevenue: 2500,
        fictiveRevenue: 125000,
        imbalanceCost: 0,
        unitImbalanceCost: 0,
        plantId: "p1",
        plantName: "Test RES",
      },
    ];

    it("Günlük granülaritede en yüksek kayba sahip günü ilk sıraya yerleştirmelidir", () => {
      const dailyRank = rankPeriodsByEfficiency(mockHourlyResults, "day");
      expect(dailyRank.length).toBe(2);

      // 2026-05-10 en yüksek kayba sahip gün olmalı
      expect(dailyRank[0].period).toBe("2026-05-10");
      expect(dailyRank[0].lossTl).toBeGreaterThan(dailyRank[1].lossTl);
      expect(dailyRank[0].lossTl).toBe(26760 + 13600); // 40360 TL kayıp
      expect(dailyRank[0].hourCount).toBe(2);
      expect(dailyRank[0].dominantSystemDirection).toBe("DEFICIT");

      // 2026-05-11 0 kayıp ile ikinci olmalı
      expect(dailyRank[1].period).toBe("2026-05-11");
      expect(dailyRank[1].lossTl).toBe(0);
      expect(dailyRank[1].efficiencyRatio).toBe(1.0);
    });

    it("Aylık granülaritede doğru şekilde 2026-05 ayında toplamalıdır", () => {
      const monthlyRank = rankPeriodsByEfficiency(mockHourlyResults, "month");
      expect(monthlyRank.length).toBe(1);
      expect(monthlyRank[0].period).toBe("2026-05");
      expect(monthlyRank[0].hourCount).toBe(3);
      expect(monthlyRank[0].lossTl).toBe(40360);
    });

    it("Boş dizi verildiğinde çökmeden boş dizi döndürmelidir", () => {
      expect(rankPeriodsByEfficiency([])).toEqual([]);
    });
  });

  describe("3. detectForecastBias", () => {
    it("Sürekli aşırı tahmin eden sentetik bir veri setinde OVER_FORECAST tespit etmelidir", () => {
      // 10 saatin 9'unda forecast > actual olan sentetik aşırı tahmin serisi
      const overForecastRecords: HourlyResult[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2026, 3, 1, i, 0, 0)),
        actualMwh: 30,
        forecastMwh: i === 0 ? 30 : 40, // 9 saat %33 aşırı tahmin
        ptf: 2400,
        smf: 2200,
        systemDirection: "SURPLUS",
        imbalanceMwh: i === 0 ? 0 : -10,
        positivePrice: 2068,
        negativePrice: 2472,
        imbalanceAmount: 0,
        dayAheadSalesAmount: 96000,
        totalRevenue: 96000,
        unitRevenue: 2400,
        fictiveRevenue: 72000,
        imbalanceCost: 5000,
        unitImbalanceCost: 166.7,
        plantId: "plant-res",
        plantName: "Rüzgar Santrali",
      }));

      const bias = detectForecastBias(overForecastRecords, "plant-res");
      expect(bias.direction).toBe("OVER_FORECAST");
      expect(bias.consistency).toBe(0.9); // %90 tutarlılık
      expect(bias.avgBiasPercent).toBeGreaterThan(25);
      expect(bias.explanation).toContain("plan gerçekleşenden yüksek");
    });

    it("Sürekli eksik tahmin eden seride UNDER_FORECAST tespit etmelidir", () => {
      const underForecastRecords: HourlyResult[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2026, 3, 1, i, 0, 0)),
        actualMwh: 50,
        forecastMwh: 35, // Her saat eksik tahmin
        ptf: 2400,
        smf: 2600,
        systemDirection: "DEFICIT",
        imbalanceMwh: 15,
        positivePrice: 2328,
        negativePrice: 2756,
        imbalanceAmount: 34920,
        dayAheadSalesAmount: 84000,
        totalRevenue: 118920,
        unitRevenue: 2378.4,
        fictiveRevenue: 120000,
        imbalanceCost: 1080,
        unitImbalanceCost: 21.6,
      }));

      const bias = detectForecastBias(underForecastRecords);
      expect(bias.direction).toBe("UNDER_FORECAST");
      expect(bias.consistency).toBe(1.0); // %100 tutarlılık
      expect(bias.avgBiasPercent).toBeLessThan(0);
      expect(bias.explanation).toContain("plan gerçekleşenden düşük");
    });

    it("Dengeli tahminlerde NEUTRAL tespit etmelidir", () => {
      const neutralRecords: HourlyResult[] = [
        {
          timestamp: "2026-01-01T00:00:00Z",
          actualMwh: 40,
          forecastMwh: 50, // +10
          ptf: 2400,
          smf: 2400,
          systemDirection: "BALANCED",
          imbalanceMwh: -10,
          positivePrice: 2328,
          negativePrice: 2472,
          imbalanceAmount: -24720,
          dayAheadSalesAmount: 120000,
          totalRevenue: 95280,
          unitRevenue: 2382,
          fictiveRevenue: 96000,
          imbalanceCost: 720,
          unitImbalanceCost: 18,
        },
        {
          timestamp: "2026-01-01T01:00:00Z",
          actualMwh: 50,
          forecastMwh: 40, // -10
          ptf: 2400,
          smf: 2400,
          systemDirection: "BALANCED",
          imbalanceMwh: 10,
          positivePrice: 2328,
          negativePrice: 2472,
          imbalanceAmount: 23280,
          dayAheadSalesAmount: 96000,
          totalRevenue: 119280,
          unitRevenue: 2385.6,
          fictiveRevenue: 120000,
          imbalanceCost: 720,
          unitImbalanceCost: 14.4,
        },
      ];

      const bias = detectForecastBias(neutralRecords);
      expect(bias.direction).toBe("NEUTRAL");
    });
  });

  describe("4. simulateBiasCorrectedForecast ve calculatePotentialUplift", () => {
    it("KRİTİK TEST: Sistematik yanlılık giderildiğinde potansiyel gelir artışı (uplift) sıfır veya pozitif olmalı, asla gerçek sonuçtan daha kötü çıkmamalıdır", () => {
      // 24 saatlik sentetik aşırı tahmin veri seti
      // Santral 40 MWh üretirken model ısrarla 55 MWh tahmin ediyor
      const actualHours: HourlyResult[] = [];

      for (let h = 0; h < 24; h++) {
        const timestamp = new Date(Date.UTC(2026, 4, 15, h, 0, 0));
        const ptf = 2400 + (h % 5) * 50;
        const smf = ptf + 300; // DEFICIT -> sistem açığı
        const actualMwh = 40.0;
        const forecastMwh = 55.0; // Her saat 15 MWh aşırı tahmin (büyük negatif dengesizlik)

        const hr: HourlyRecord = { timestamp, actualMwh, forecastMwh, plantId: "plant-1" };
        const mr: MarketPriceRecord = {
          timestamp,
          ptf,
          smf,
          systemDirection: "DEFICIT",
        };

        actualHours.push(processHourlyRecord(hr, mr, DEFAULT_IMBALANCE_PROFILE));
      }

      // 1. Yanlılık tespiti
      const bias = detectForecastBias(actualHours, "plant-1");
      expect(bias.direction).toBe("OVER_FORECAST");
      expect(bias.consistency).toBe(1.0);

      // 2. Düzeltilmiş tahmin simülasyonu
      const simulatedHours = simulateBiasCorrectedForecast(
        actualHours,
        bias,
        DEFAULT_IMBALANCE_PROFILE
      );

      expect(simulatedHours.length).toBe(actualHours.length);

      // 3. Uplift Hesaplama
      const uplift = calculatePotentialUplift(actualHours, simulatedHours);

      // KURAL: Düzeltme sonucu asla gerçek durumdan kötü olamaz
      expect(uplift.totalUpliftTl).toBeGreaterThan(0);
      expect(uplift.upliftPercent).toBeGreaterThan(0);
      expect(uplift.simulatedTotalRevenue).toBeGreaterThan(uplift.actualTotalRevenue);
      expect(uplift.simulatedImbalanceCost).toBeLessThan(uplift.actualImbalanceCost);
      expect(uplift.costReductionTl).toBeGreaterThan(0);
    });

    it("Yanlılık olmayan nötr seride simulateBiasCorrectedForecast veri serisini bozmamalı ve uplift 0 olmalıdır", () => {
      const neutralBias = {
        direction: "NEUTRAL" as const,
        avgBiasPercent: 0,
        consistency: 0.5,
        avgBiasMwh: 0,
        totalActualMwh: 100,
        totalForecastMwh: 100,
        explanation: "Dengeli",
      };

      const mockHours: HourlyResult[] = [
        {
          timestamp: "2026-06-01T00:00:00Z",
          actualMwh: 50,
          forecastMwh: 50,
          ptf: 2500,
          smf: 2500,
          systemDirection: "BALANCED",
          imbalanceMwh: 0,
          positivePrice: 2425,
          negativePrice: 2575,
          imbalanceAmount: 0,
          dayAheadSalesAmount: 125000,
          totalRevenue: 125000,
          unitRevenue: 2500,
          fictiveRevenue: 125000,
          imbalanceCost: 0,
          unitImbalanceCost: 0,
        },
      ];

      const simulated = simulateBiasCorrectedForecast(
        mockHours,
        neutralBias,
        DEFAULT_IMBALANCE_PROFILE
      );
      const uplift = calculatePotentialUplift(mockHours, simulated);

      expect(uplift.totalUpliftTl).toBe(0);
      expect(uplift.upliftPercent).toBe(0);
      expect(simulated[0].forecastMwh).toBe(50);
    });
      it("Düzeltme maliyeti artırıyorsa negatif sonuç 0'a kırpılmadan döndürülmelidir", () => {
      // Saat A: tahmin mükemmel, fiyat yüksek. Saat B: 50 MWh fazla tahmin, fiyat düşük.
      // Toplamda fazla tahmin var (150 / 100), ama tek oranla ölçeklemek pahalı saat A'yı bozar.
      const hours: HourlyResult[] = [
        processHourlyRecord(
          { timestamp: "2025-06-01T12:00:00Z", actualMwh: 100, forecastMwh: 100 },
          { timestamp: "2025-06-01T12:00:00Z", ptf: 5000, smf: 5000, systemDirection: "BALANCED" },
          DEFAULT_IMBALANCE_PROFILE
        ),
        processHourlyRecord(
          { timestamp: "2025-06-01T03:00:00Z", actualMwh: 0, forecastMwh: 50 },
          { timestamp: "2025-06-01T03:00:00Z", ptf: 100, smf: 100, systemDirection: "BALANCED" },
          DEFAULT_IMBALANCE_PROFILE
        ),
      ];

      const bias = detectForecastBias(hours);
      expect(bias.direction).toBe("OVER_FORECAST");

      const simulated = simulateBiasCorrectedForecast(hours, bias, DEFAULT_IMBALANCE_PROFILE);
      const uplift = calculatePotentialUplift(hours, simulated);

      expect(uplift.totalUpliftTl).toBeLessThan(0);
      expect(uplift.upliftPercent).toBeLessThan(0);
      expect(uplift.costReductionTl).toBeLessThan(0);
      // Gerçekleşen üretim değişmediği için gelir farkı maliyet farkına eşittir
      expect(uplift.totalUpliftTl).toBeCloseTo(uplift.costReductionTl, 1);
    });
  });
});
