import { describe, it, expect } from "vitest";
import {
  findHighestCostHours,
  generateMitigationSuggestions,
  comparePlantProfitability,
  PlantInfo,
} from "@/lib/strategy/insights";
import { DEFAULT_IMBALANCE_PROFILE, HourlyResult, SystemDirection } from "@/lib/calculations/types";
import { processHourlyRecord } from "@/lib/calculations/engine";

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
      expect(analysis.directionDistribution.dominantDirection).toBe("BALANCED");
    });
  });

  describe("2. generateMitigationSuggestions", () => {
    // 2025 saatleri (sabit %3 rejimi) motorla üretilir; böylece simülasyonlar gerçek hesapla tutarlıdır.
    const hr = (
      day: number,
      hour: number,
      forecastMwh: number,
      actualMwh: number,
      ptf: number,
      smf: number,
      systemDirection: SystemDirection,
      gipPrice: number | null = null
    ): HourlyResult => {
      const timestamp = `2025-06-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`;
      return {
        ...processHourlyRecord(
          { timestamp, forecastMwh, actualMwh },
          { timestamp, ptf, smf, systemDirection },
          DEFAULT_IMBALANCE_PROFILE
        ),
        gipPrice,
      };
    };

    // İki gün × 24 saat. Öğle (12-16) saatlerinde enerji açığı, yüksek PTF ve 10 MWh fazla tahmin;
    // diğer saatlerde düşük fiyat ve küçük, iki yönlü hatalar. GİP fiyatı PTF'ye eşit.
    const concentratedDeficit = (): HourlyResult[] => {
      const rows: HourlyResult[] = [];
      for (const day of [1, 2]) {
        for (let h = 0; h < 24; h++) {
          if (h >= 12 && h < 17) rows.push(hr(day, h, 40, 30, 4000, 4500, "DEFICIT", 4000));
          else rows.push(hr(day, h, 20, h % 2 === 0 ? 21 : 19, 1500, 1500, "BALANCED", 1500));
        }
      }
      return rows;
    };

    const res: PlantInfo = { plantId: "res-1", plantName: "Karaburun RES", plantType: "RES", capacityMw: 50 };
    const hes: PlantInfo = { plantId: "hes-1", plantName: "Fırat HES", plantType: "HES", capacityMw: 100 };
    const suggest = (plant: PlantInfo, rows: HourlyResult[]) =>
      generateMitigationSuggestions(plant, findHighestCostHours(rows, 20), rows, DEFAULT_IMBALANCE_PROFILE);

    it("Maliyet yoğunlaşmasını tüm saatler üzerinden tespit eder ve etkileri simülasyonla hesaplar", () => {
      const suggestions = suggest(res, concentratedDeficit());

      const timing = suggestions.find((s) => s.id === "suggestion-intraday-timing");
      expect(timing?.triggerRule).toContain("Öğle");
      // GİP = PTF ve açık saatlerinde negatif fiyat MAX(PTF,SMF)×1,03 = 4635:
      // 10 saat × 10 MWh × %25 × (4635 − 4000) = 15.875 ₺
      expect(timing?.impact?.savingTl).toBeCloseTo(15875, 0);
      expect(timing?.recommended).toBe(true);

      const deficit = suggestions.find((s) => s.id === "suggestion-deficit-protection");
      expect(deficit?.impact?.savingTl).toBeGreaterThan(0);

      const bias = suggestions.find((s) => s.id === "suggestion-bias-overforecast");
      expect(bias).toBeDefined();
      expect(bias?.impact?.method).toContain("çarpıldı");

      const tech = suggestions.find((s) => s.id === "suggestion-tech-res");
      expect(tech?.impact).toBeNull();
      expect(tech?.recommended).toBeNull();
      expect(tech?.expectedImpact).toContain("etki tahmini yok");

      // Hiçbir etki metni sabit bir yüzde vaadi içermez; hepsi simülasyondan veya "tahmin yok"tan gelir
      for (const s of suggestions) {
        expect(s.expectedImpact).toMatch(/Geçmiş veride|etki tahmini yok/);
      }
    });

    it("Maliyet saatlere eşit dağılmışsa zaman dilimi kuralı tetiklenmez", () => {
      const rows: HourlyResult[] = [];
      for (let h = 0; h < 24; h++) rows.push(hr(1, h, 20, 25, 2000, 2000, "BALANCED"));
      const suggestions = suggest(res, rows);
      expect(suggestions.find((s) => s.id === "suggestion-intraday-timing")).toBeUndefined();
    });

    it("Enerji açığı kuralı bilinçli düşük bildirim önermez; eksik üretimi GİP'te kapatmayı önerir", () => {
      // Tüm saatler enerji açığında ve santral eksik üretiyor: maliyetin tamamı açık saatlerinde
      const rows: HourlyResult[] = [];
      for (let h = 0; h < 24; h++) rows.push(hr(1, h, 40, 30, h >= 18 ? 5000 : 2000, 5500, "DEFICIT"));
      const suggestions = suggest(res, rows);

      const deficit = suggestions.find((s) => s.id === "suggestion-deficit-protection");
      expect(deficit?.title).toContain("GİP");
      // Planı bilerek düşük bildirmek piyasa gözetimi ve KÜPST riski taşır: hiçbir öneride yer almaz
      for (const s of suggestions) {
        expect([s.title, s.description, ...s.actionItems].join(" ")).not.toMatch(/düşük bildir/i);
      }
    });

    it("GİP verisi yoksa GİP'e dayalı önerinin etkisi hesaplanmaz", () => {
      const rows = concentratedDeficit().map((r) => ({ ...r, gipPrice: null }));
      const timing = suggest(res, rows).find((s) => s.id === "suggestion-intraday-timing");
      expect(timing?.impact).toBeNull();
    });

    it("HES santrali için rezervuar önerisi üretir ve etki vaadinde bulunmaz", () => {
      const hesSuggestion = suggest(hes, concentratedDeficit()).find((s) => s.id === "suggestion-tech-hes");
      expect(hesSuggestion?.title).toContain("HES Rezervuar/Debi Yönetimi");
      expect(hesSuggestion?.impact).toBeNull();
    });
  });

  describe("3. comparePlantProfitability", () => {
    it("santralleri birim dengesizliğe göre sıralar; puan sektör karnesindeki yer (yoksa proje içi sıra)", () => {
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

      // Sektör karnesi yoksa proje içi sıra: en düşük birim dengesizlik 100, en yüksek 0
      const comparisons = comparePlantProfitability(plants, mockResults);
      expect(comparisons.length).toBe(2);
      expect(comparisons.map((c) => c.plantId)).toEqual(["res-a", "res-b"]);
      expect(comparisons[0]).toMatchObject({ score: 100, scoreBasis: "project", assessment: "EXCELLENT", rankInType: 1 });
      expect(comparisons[1]).toMatchObject({ score: 0, assessment: "HIGH_RISK", rankInType: 2 });
      expect(comparisons[0].rationale).toContain("sektör karnesi yok");

      // Sektör karnesi varsa puan sektördeki yerdir: [40, 60, 100, 300] içinde 50 → altında 1 değer → %75'ten iyi
      const withSector = comparePlantProfitability(plants, mockResults, {
        label: "2026 (Ocak–Ağustos)",
        byType: { RES: { values: [40, 60, 100, 300], median: 80 } },
      });
      expect(withSector[0]).toMatchObject({ score: 75, scoreBasis: "sector", assessment: "EXCELLENT" });
      expect(withSector[0].rationale).toContain("sektörün %75 kadarından iyi");
      expect(withSector[1]).toMatchObject({ score: 25, assessment: "MODERATE" });
    });
  });
});
