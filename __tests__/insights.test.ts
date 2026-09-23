import { describe, it, expect } from "vitest";
import {
  findHighestCostHours,
  generateMitigationSuggestions,
  comparePlantProfitability,
  PlantInfo,
} from "@/lib/strategy/insights";
import { HourlyResult } from "@/lib/calculations/types";

describe("Kural Tabanlı Strateji ve İçgörü Motoru Birim Testleri", () => {
  // Test için zengin saatlik veri seti üreticisi
  const createMockHourlyRecords = (): HourlyResult[] => {
    return [
      // 1. Saat (13:00 - Öğle) - Yüksek Maliyetli, Enerji Açığı, Aşırı Tahmin (actual < forecast)
      {
        timestamp: "2026-06-15T13:00:00Z",
        actualMwh: 20,
        forecastMwh: 40, // 20 MWh eksik üretim (Aşırı tahmin)
        ptf: 2800,
        smf: 3500,
        systemDirection: "DEFICIT",
        imbalanceMwh: -20,
        positivePrice: 2716,
        negativePrice: 3675,
        imbalanceAmount: -73500,
        dayAheadSalesAmount: 112000,
        totalRevenue: 38500,
        unitRevenue: 1925,
        fictiveRevenue: 56000,
        imbalanceCost: 17500, // Yüksek maliyet
        unitImbalanceCost: 875,
      },
      // 2. Saat (14:00 - Öğle) - Yüksek Maliyetli, Enerji Açığı, Aşırı Tahmin
      {
        timestamp: "2026-06-15T14:00:00Z",
        actualMwh: 25,
        forecastMwh: 45,
        ptf: 2900,
        smf: 3600,
        systemDirection: "DEFICIT",
        imbalanceMwh: -20,
        positivePrice: 2813,
        negativePrice: 3780,
        imbalanceAmount: -75600,
        dayAheadSalesAmount: 130500,
        totalRevenue: 54900,
        unitRevenue: 2196,
        fictiveRevenue: 72500,
        imbalanceCost: 17600, // Yüksek maliyet
        unitImbalanceCost: 704,
      },
      // 3. Saat (15:00 - Öğle) - Yüksek Maliyetli, Enerji Açığı, Aşırı Tahmin
      {
        timestamp: "2026-06-15T15:00:00Z",
        actualMwh: 22,
        forecastMwh: 40,
        ptf: 3000,
        smf: 3800,
        systemDirection: "DEFICIT",
        imbalanceMwh: -18,
        positivePrice: 2910,
        negativePrice: 3990,
        imbalanceAmount: -71820,
        dayAheadSalesAmount: 120000,
        totalRevenue: 48180,
        unitRevenue: 2190,
        fictiveRevenue: 66000,
        imbalanceCost: 17820, // En yüksek maliyet
        unitImbalanceCost: 810,
      },
      // 4. Saat (08:00 - Sabah) - Düşük Maliyetli, Dengeli
      {
        timestamp: "2026-06-15T08:00:00Z",
        actualMwh: 30,
        forecastMwh: 30,
        ptf: 2500,
        smf: 2500,
        systemDirection: "BALANCED",
        imbalanceMwh: 0,
        positivePrice: 2425,
        negativePrice: 2575,
        imbalanceAmount: 0,
        dayAheadSalesAmount: 75000,
        totalRevenue: 75000,
        unitRevenue: 2500,
        fictiveRevenue: 75000,
        imbalanceCost: 0,
        unitImbalanceCost: 0,
      },
      // 5. Saat (02:00 - Gece) - Düşük Maliyetli, Enerji Fazlası
      {
        timestamp: "2026-06-15T02:00:00Z",
        actualMwh: 35,
        forecastMwh: 33,
        ptf: 2000,
        smf: 1800,
        systemDirection: "SURPLUS",
        imbalanceMwh: 2,
        positivePrice: 1746,
        negativePrice: 2060,
        imbalanceAmount: 3492,
        dayAheadSalesAmount: 66000,
        totalRevenue: 69492,
        unitRevenue: 1985.48,
        fictiveRevenue: 70000,
        imbalanceCost: 508,
        unitImbalanceCost: 14.51,
      },
    ];
  };

  describe("1. findHighestCostHours", () => {
    it("en yüksek maliyetli saatleri doğru bulmalı ve örüntüleri analiz etmelidir", () => {
      const records = createMockHourlyRecords();
      const analysis = findHighestCostHours(records, 3);

      expect(analysis.totalAnalyzedHours).toBe(5);
      expect(analysis.topNHours).toBe(3);

      // Top 3 saat 15:00 (17820 ₺), 14:00 (17600 ₺) ve 13:00 (17500 ₺) olmalı
      expect(analysis.topHours[0].imbalanceCost).toBe(17820);
      expect(analysis.topHours[1].imbalanceCost).toBe(17600);
      expect(analysis.topHours[2].imbalanceCost).toBe(17500);

      // Sistem Yönü: Top 3 saatin tamamı DEFICIT (Enerji Açığı) olmalı
      expect(analysis.directionDistribution.DEFICIT.percentage).toBe(100);
      expect(analysis.directionDistribution.dominantDirection).toBe("DEFICIT");

      // Zaman Dilimi: 13, 14, 15 saatleri AFTERNOON (Öğle) dilimindedir
      expect(analysis.dominantInterval.interval).toBe("AFTERNOON");
      expect(analysis.dominantInterval.percentage).toBe(100);

      // Sistematik Yanlılık: 3 saatin hepsinde actual < forecast -> OVER_FORECASTING
      expect(analysis.systematicBias).toBe("OVER_FORECASTING");

      // Tahmin Hatası Kıyaslaması: Top 3 saatteki hata oranı genel ortalamadan yüksek olmalı
      expect(analysis.topNMeanErrorRate).toBeGreaterThan(0.4);
      expect(analysis.errorRateRatio).toBeGreaterThan(1);
    });

    it("boş veri listesi verildiğinde güvenli varsayılanlar dönmelidir", () => {
      const analysis = findHighestCostHours([]);
      expect(analysis.totalAnalyzedHours).toBe(0);
      expect(analysis.topNHours).toBe(0);
      expect(analysis.topHours).toEqual([]);
      expect(analysis.dominantDirection).toBeUndefined();
    });
  });

  describe("2. generateMitigationSuggestions", () => {
    it("tespit edilen örüntülere ve RES santral tipine göre doğru kural tabanlı aksiyonlar üretmelidir", () => {
      const records = createMockHourlyRecords();
      const analysis = findHighestCostHours(records, 3);

      const resPlant: PlantInfo = {
        plantId: "res-1",
        plantName: "Karaburun RES",
        plantType: "RES",
        capacityMw: 50,
      };

      const suggestions = generateMitigationSuggestions(resPlant, analysis);

      expect(suggestions.length).toBeGreaterThanOrEqual(3);
      expect(suggestions.length).toBeLessThanOrEqual(5);

      // Kural 1: Öğle saatleri yoğunlaşması tetiklenmeli
      const timingSuggestion = suggestions.find((s) => s.category === "INTRADAY");
      expect(timingSuggestion).toBeDefined();
      expect(timingSuggestion?.triggerRule).toContain("Öğle");

      // Kural 2: Enerji açığı kuralı tetiklenmeli
      const deficitSuggestion = suggestions.find((s) => s.category === "MARKET_TIMING");
      expect(deficitSuggestion).toBeDefined();
      expect(deficitSuggestion?.triggerRule).toContain("enerji açığında");

      // Kural 3: Sistematik aşırı tahmin (Over-forecasting) kalibrasyonu tetiklenmeli
      const biasSuggestion = suggestions.find(
        (s) => s.id === "suggestion-bias-overforecast"
      );
      expect(biasSuggestion).toBeDefined();

      // Kural 4: RES teknolojisine özel meteoroloji kuralı tetiklenmeli
      const resSuggestion = suggestions.find((s) => s.id === "suggestion-tech-res");
      expect(resSuggestion).toBeDefined();
      expect(resSuggestion?.triggerRule).toContain("RES");
    });

    it("HES santrali için rezervuar ve debi optimizasyonu önerisi üretmelidir", () => {
      const records = createMockHourlyRecords();
      const analysis = findHighestCostHours(records, 3);

      const hesPlant: PlantInfo = {
        plantId: "hes-1",
        plantName: "Fırat HES",
        plantType: "HES",
        capacityMw: 100,
      };

      const suggestions = generateMitigationSuggestions(hesPlant, analysis);
      const hesSuggestion = suggestions.find((s) => s.id === "suggestion-tech-hes");

      expect(hesSuggestion).toBeDefined();
      expect(hesSuggestion?.title).toContain("HES Rezervuar/Debi Yönetimi");
      expect(hesSuggestion?.expectedImpact).toContain("YAL");
    });
  });

  describe("3. comparePlantProfitability", () => {
    it("aynı teknoloji tipindeki santralleri metriklerine göre sıralamalı, skor ve gerekçe üretmelidir", () => {
      const plants: PlantInfo[] = [
        {
          plantId: "res-a",
          plantName: "Verimli RES-A",
          plantType: "RES",
          capacityMw: 50,
        },
        {
          plantId: "res-b",
          plantName: "Yüksek Sapmalı RES-B",
          plantType: "RES",
          capacityMw: 50,
        },
      ];

      const mockResults = {
        "res-a": {
          hourly: [],
          monthly: [],
          yearly: {
            year: 2026,
            plantId: "res-a",
            totalDayAheadSalesAmount: 260000,
            totalImbalanceAmount: -5000,
            totalRevenue: 255000,
            totalActualMwh: 100,
            unitRevenue: 2550, // 2550 TL/MWh
            totalImbalanceCost: 5000,
            unitImbalanceCost: 50, // Birim dengesizlik maliyeti çok düşük (%1.96)
          },
        },
        "res-b": {
          hourly: [],
          monthly: [],
          yearly: {
            year: 2026,
            plantId: "res-b",
            totalDayAheadSalesAmount: 260000,
            totalImbalanceAmount: -25000,
            totalRevenue: 235000,
            totalActualMwh: 100,
            unitRevenue: 2350,
            totalImbalanceCost: 28000,
            unitImbalanceCost: 280, // Birim dengesizlik maliyeti yüksek (%11.9)
          },
        },
      };

      const comparisons = comparePlantProfitability(plants, mockResults);

      expect(comparisons.length).toBe(2);

      // res-a daha düşük dengesizlik maliyetine ve daha yüksek birim gelire sahip olduğu için 1. sırada olmalı
      expect(comparisons[0].plantId).toBe("res-a");
      expect(comparisons[0].score).toBeGreaterThan(comparisons[1].score);
      expect(comparisons[0].assessment).toBe("EXCELLENT");
      expect(comparisons[0].rationale).toContain("cazip ve düşük riskli");

      // res-b yüksek riskli veya daha düşük skorlu olmalı
      expect(comparisons[1].plantId).toBe("res-b");
      expect(comparisons[1].rationale).toContain("risk");
    });
  });
});
