import { describe, it, expect } from "vitest";
import {
  calculateImbalance,
  calculatePositiveImbalancePrice,
  calculateNegativeImbalancePrice,
  calculateImbalanceAmount,
  calculateDayAheadSalesAmount,
  calculateTotalRevenue,
  calculateUnitRevenue,
  calculateFictiveRevenue,
  calculateImbalanceCost,
  calculateUnitImbalanceCost,
  processHourlyRecord,
  processPlant,
} from "@/lib/calculations/engine";
import {
  DEFAULT_IMBALANCE_PROFILE,
  HourlyRecord,
  ImbalancePricingProfile,
  ImbalanceProfile,
  MarketPriceRecord,
  PlantHourlyInput,
} from "@/lib/calculations/types";

describe("SAF Hesaplama Motoru Birim Testleri", () => {
  const profile: ImbalancePricingProfile = {
    positiveSurplusCoef: 0.94,
    positiveOtherCoef: 0.97,
    negativeDeficitCoef: 1.06,
    negativeOtherCoef: 1.03,
  };

  describe("1. calculateImbalance", () => {
    it("actual > forecast durumunda pozitif dengesizlik döndürmelidir", () => {
      expect(calculateImbalance(120, 100)).toBe(20);
    });

    it("actual < forecast durumunda negatif dengesizlik döndürmelidir", () => {
      expect(calculateImbalance(80, 100)).toBe(-20);
    });

    it("actual == forecast durumunda 0 döndürmelidir", () => {
      expect(calculateImbalance(100, 100)).toBe(0);
    });
  });

  describe("2. calculatePositiveImbalancePrice", () => {
    it("sistem yönü SURPLUS ise min(ptf, smf) * positiveSurplusCoef (0.94) uygulamalıdır", () => {
      // ptf = 3000, smf = 2500 -> min = 2500
      // 2500 * 0.94 = 2350
      const price = calculatePositiveImbalancePrice(3000, 2500, "SURPLUS", profile);
      expect(price).toBe(2350);
    });

    it("sistem yönü DEFICIT ise min(ptf, smf) * positiveOtherCoef (0.97) uygulamalıdır", () => {
      // ptf = 2500, smf = 3200 -> min = 2500
      // 2500 * 0.97 = 2425
      const price = calculatePositiveImbalancePrice(2500, 3200, "DEFICIT", profile);
      expect(price).toBe(2425);
    });

    it("sistem yönü BALANCED ise min(ptf, smf) * positiveOtherCoef (0.97) uygulamalıdır", () => {
      // ptf = 2800, smf = 2800 -> min = 2800
      // 2800 * 0.97 = 2716
      const price = calculatePositiveImbalancePrice(2800, 2800, "BALANCED", profile);
      expect(price).toBe(2716);
    });
  });

  describe("3. calculateNegativeImbalancePrice", () => {
    it("sistem yönü DEFICIT ise max(ptf, smf) * negativeDeficitCoef (1.06) uygulamalıdır", () => {
      // ptf = 2500, smf = 3200 -> max = 3200
      // 3200 * 1.06 = 3392
      const price = calculateNegativeImbalancePrice(2500, 3200, "DEFICIT", profile);
      expect(price).toBe(3392);
    });

    it("sistem yönü SURPLUS ise max(ptf, smf) * negativeOtherCoef (1.03) uygulamalıdır", () => {
      // ptf = 3000, smf = 2400 -> max = 3000
      // 3000 * 1.03 = 3090
      const price = calculateNegativeImbalancePrice(3000, 2400, "SURPLUS", profile);
      expect(price).toBe(3090);
    });

    it("sistem yönü BALANCED ise max(ptf, smf) * negativeOtherCoef (1.03) uygulamalıdır", () => {
      // ptf = 2800, smf = 2800 -> max = 2800
      // 2800 * 1.03 = 2884
      const price = calculateNegativeImbalancePrice(2800, 2800, "BALANCED", profile);
      expect(price).toBe(2884);
    });
  });

  describe("EPİAŞ Asimetrik Fiyatlandırma 4 Ana Senaryo Doğrulaması", () => {
    it("Pozitif dengesizlik + SURPLUS → min(ptf,smf)*0.94 ile eşleşmeli", () => {
      const ptf = 2600;
      const smf = 2200;
      const price = calculatePositiveImbalancePrice(ptf, smf, "SURPLUS", profile);
      expect(price).toBe(Math.min(ptf, smf) * 0.94);
      expect(price).toBe(2200 * 0.94); // 2068
    });

    it("Pozitif dengesizlik + DEFICIT/BALANCED → min(ptf,smf)*0.97 ile eşleşmeli", () => {
      const ptf = 2400;
      const smf = 3000;
      const priceDeficit = calculatePositiveImbalancePrice(ptf, smf, "DEFICIT", profile);
      expect(priceDeficit).toBe(Math.min(ptf, smf) * 0.97);
      expect(priceDeficit).toBe(2400 * 0.97); // 2328

      const priceBalanced = calculatePositiveImbalancePrice(2500, 2500, "BALANCED", profile);
      expect(priceBalanced).toBe(Math.min(2500, 2500) * 0.97);
      expect(priceBalanced).toBe(2425);
    });

    it("Negatif dengesizlik + DEFICIT → max(ptf,smf)*1.06 ile eşleşmeli", () => {
      const ptf = 2500;
      const smf = 3200;
      const price = calculateNegativeImbalancePrice(ptf, smf, "DEFICIT", profile);
      expect(price).toBe(Math.max(ptf, smf) * 1.06);
      expect(price).toBe(3200 * 1.06); // 3392
    });

    it("Negatif dengesizlik + SURPLUS/BALANCED → max(ptf,smf)*1.03 ile eşleşmeli", () => {
      const ptf = 3000;
      const smf = 2200;
      const priceSurplus = calculateNegativeImbalancePrice(ptf, smf, "SURPLUS", profile);
      expect(priceSurplus).toBe(Math.max(ptf, smf) * 1.03);
      expect(priceSurplus).toBe(3000 * 1.03); // 3090

      const priceBalanced = calculateNegativeImbalancePrice(2800, 2800, "BALANCED", profile);
      expect(priceBalanced).toBe(Math.max(2800, 2800) * 1.03);
      expect(priceBalanced).toBe(2884);
    });
  });

  describe("4. calculateImbalanceAmount", () => {
    it("imbalance > 0 ise imbalance * positivePrice (pozitif alacak) hesaplamalıdır", () => {
      const amount = calculateImbalanceAmount(15, 2000, 3000);
      expect(amount).toBe(30000);
    });

    it("imbalance < 0 ise imbalance * negativePrice (negatif borç) hesaplamalıdır", () => {
      const amount = calculateImbalanceAmount(-10, 2000, 3000);
      expect(amount).toBe(-30000);
    });

    it("imbalance == 0 ise 0 döndürmelidir", () => {
      const amount = calculateImbalanceAmount(0, 2000, 3000);
      expect(amount).toBe(0);
    });
  });

  describe("5. calculateDayAheadSalesAmount", () => {
    it("forecastMwh * ptf sonucunu doğru döndürmelidir", () => {
      expect(calculateDayAheadSalesAmount(50, 2500)).toBe(125000);
    });
  });

  describe("6. calculateTotalRevenue", () => {
    it("GÖP satışı ve pozitif dengesizlik alacağını toplamalıdır", () => {
      expect(calculateTotalRevenue(100000, 25000)).toBe(125000);
    });

    it("GÖP satışı ve negatif dengesizlik borcunu netleştirmelidir", () => {
      expect(calculateTotalRevenue(100000, -30000)).toBe(70000);
    });
  });

  describe("7. calculateUnitRevenue", () => {
    it("actualMwh > 0 iken totalRevenue / actualMwh döndürmelidir", () => {
      expect(calculateUnitRevenue(100000, 50)).toBe(2000);
    });

    it("actualMwh == 0 iken sıfıra bölme hatası oluşturmayıp 0 döndürmelidir", () => {
      expect(calculateUnitRevenue(100000, 0)).toBe(0);
      expect(calculateUnitRevenue(-5000, 0)).toBe(0);
    });
  });

  describe("8. calculateFictiveRevenue", () => {
    it("actualMwh * ptf değerini doğru döndürmelidir", () => {
      expect(calculateFictiveRevenue(60, 2500)).toBe(150000);
    });
  });

  describe("9. calculateImbalanceCost", () => {
    it("fictiveRevenue - totalRevenue farkını döndürmelidir", () => {
      // Fiktif gelir 150.000 TL, Gerçekleşen toplam gelir 140.000 TL ise maliyet/kayıp = 10.000 TL
      expect(calculateImbalanceCost(150000, 140000)).toBe(10000);
    });
  });

  describe("10. calculateUnitImbalanceCost", () => {
    it("actualMwh > 0 iken imbalanceCost / actualMwh döndürmelidir", () => {
      expect(calculateUnitImbalanceCost(10000, 50)).toBe(200);
    });

    it("actualMwh == 0 iken sıfıra bölme hatası oluşturmayıp 0 döndürmelidir", () => {
      expect(calculateUnitImbalanceCost(10000, 0)).toBe(0);
    });
  });

  describe("processHourlyRecord Kapsamlı Senaryo Testleri", () => {
    const timestamp = new Date("2026-09-22T10:00:00Z");

    it("Senaryo 1: Pozitif Dengesizlik + Sistem Yönü Enerji Fazlası (SURPLUS)", () => {
      const hourlyRecord: HourlyRecord = {
        timestamp,
        actualMwh: 120,
        forecastMwh: 100, // +20 MWh dengesizlik
      };
      const marketPriceRecord: MarketPriceRecord = {
        timestamp,
        ptf: 3000,
        smf: 2500, // smf < ptf -> SURPLUS
        systemDirection: "SURPLUS",
      };

      const result = processHourlyRecord(hourlyRecord, marketPriceRecord, profile);

      expect(result.imbalanceMwh).toBe(20);
      // SURPLUS pozitif fiyat: min(3000, 2500) * 0.94 = 2350 TL/MWh
      expect(result.positivePrice).toBe(2350);
      // Dengesizlik tutarı: 20 * 2350 = 47000 TL
      expect(result.imbalanceAmount).toBe(47000);
      // GÖP satış tutarı: 100 * 3000 = 300000 TL
      expect(result.dayAheadSalesAmount).toBe(300000);
      // Toplam gelir: 300000 + 47000 = 347000 TL
      expect(result.totalRevenue).toBe(347000);
      // Birim gelir: 347000 / 120 = 2891.6666...
      expect(result.unitRevenue).toBeCloseTo(2891.666, 2);
      // Fiktif gelir (tam tahmin edilseydi): 120 * 3000 = 360000 TL
      expect(result.fictiveRevenue).toBe(360000);
      // Dengesizlik maliyeti: 360000 - 347000 = 13000 TL
      expect(result.imbalanceCost).toBe(13000);
      // Birim dengesizlik maliyeti: 13000 / 120 = 108.333...
      expect(result.unitImbalanceCost).toBeCloseTo(108.333, 2);
    });

    it("Senaryo 2: Pozitif Dengesizlik + Sistem Yönü Enerji Açığı (DEFICIT)", () => {
      const hourlyRecord: HourlyRecord = {
        timestamp,
        actualMwh: 110,
        forecastMwh: 100, // +10 MWh
      };
      const marketPriceRecord: MarketPriceRecord = {
        timestamp,
        ptf: 2500,
        smf: 3200, // smf > ptf -> DEFICIT
        systemDirection: "DEFICIT",
      };

      const result = processHourlyRecord(hourlyRecord, marketPriceRecord, profile);

      expect(result.imbalanceMwh).toBe(10);
      // DEFICIT pozitif fiyat: min(2500, 3200) * 0.97 = 2425 TL/MWh
      expect(result.positivePrice).toBe(2425);
      expect(result.imbalanceAmount).toBe(24250);
      expect(result.dayAheadSalesAmount).toBe(250000);
      expect(result.totalRevenue).toBe(274250);
      expect(result.fictiveRevenue).toBe(275000); // 110 * 2500
      expect(result.imbalanceCost).toBe(750); // 275000 - 274250
    });

    it("Senaryo 3: Pozitif Dengesizlik + Sistem Yönü Dengede (BALANCED)", () => {
      const hourlyRecord: HourlyRecord = {
        timestamp,
        actualMwh: 110,
        forecastMwh: 100,
      };
      const marketPriceRecord: MarketPriceRecord = {
        timestamp,
        ptf: 2500,
        smf: 2500,
        systemDirection: "BALANCED",
      };

      const result = processHourlyRecord(hourlyRecord, marketPriceRecord, profile);

      expect(result.imbalanceMwh).toBe(10);
      // BALANCED pozitif fiyat: min(2500, 2500) * 0.97 = 2425
      expect(result.positivePrice).toBe(2425);
      expect(result.imbalanceAmount).toBe(24250);
    });

    it("Senaryo 4: Negatif Dengesizlik + Sistem Yönü Enerji Açığı (DEFICIT)", () => {
      const hourlyRecord: HourlyRecord = {
        timestamp,
        actualMwh: 80,
        forecastMwh: 100, // -20 MWh
      };
      const marketPriceRecord: MarketPriceRecord = {
        timestamp,
        ptf: 2500,
        smf: 3500,
        systemDirection: "DEFICIT",
      };

      const result = processHourlyRecord(hourlyRecord, marketPriceRecord, profile);

      expect(result.imbalanceMwh).toBe(-20);
      // DEFICIT negatif fiyat: max(2500, 3500) * 1.06 = 3710 TL/MWh
      expect(result.negativePrice).toBe(3710);
      // Dengesizlik tutarı: -20 * 3710 = -74200 TL
      expect(result.imbalanceAmount).toBe(-74200);
      // GÖP satış tutarı: 100 * 2500 = 250000 TL
      expect(result.dayAheadSalesAmount).toBe(250000);
      // Toplam gelir: 250000 + (-74200) = 175800 TL
      expect(result.totalRevenue).toBe(175800);
      // Fiktif gelir: 80 * 2500 = 200000 TL
      expect(result.fictiveRevenue).toBe(200000);
      // Dengesizlik maliyeti: 200000 - 175800 = 24200 TL kayıp
      expect(result.imbalanceCost).toBe(24200);
      // Birim dengesizlik maliyeti: 24200 / 80 = 302.5 TL/MWh
      expect(result.unitImbalanceCost).toBe(302.5);
    });

    it("Senaryo 5: Negatif Dengesizlik + Sistem Yönü Enerji Fazlası (SURPLUS)", () => {
      const hourlyRecord: HourlyRecord = {
        timestamp,
        actualMwh: 90,
        forecastMwh: 100, // -10 MWh
      };
      const marketPriceRecord: MarketPriceRecord = {
        timestamp,
        ptf: 3000,
        smf: 2000,
        systemDirection: "SURPLUS",
      };

      const result = processHourlyRecord(hourlyRecord, marketPriceRecord, profile);

      expect(result.imbalanceMwh).toBe(-10);
      // SURPLUS negatif fiyat: max(3000, 2000) * 1.03 = 3090 TL/MWh
      expect(result.negativePrice).toBe(3090);
      expect(result.imbalanceAmount).toBe(-30900);
      expect(result.dayAheadSalesAmount).toBe(300000);
      expect(result.totalRevenue).toBe(269100);
      expect(result.fictiveRevenue).toBe(270000); // 90 * 3000
      expect(result.imbalanceCost).toBe(900);
    });

    it("Senaryo 6: Dengesizlik = 0 Durumu", () => {
      const hourlyRecord: HourlyRecord = {
        timestamp,
        actualMwh: 100,
        forecastMwh: 100, // 0 dengesizlik
      };
      const marketPriceRecord: MarketPriceRecord = {
        timestamp,
        ptf: 2500,
        smf: 2800,
        systemDirection: "DEFICIT",
      };

      const result = processHourlyRecord(hourlyRecord, marketPriceRecord, profile);

      expect(result.imbalanceMwh).toBe(0);
      expect(result.imbalanceAmount).toBe(0);
      expect(result.dayAheadSalesAmount).toBe(250000);
      expect(result.totalRevenue).toBe(250000);
      expect(result.fictiveRevenue).toBe(250000);
      expect(result.imbalanceCost).toBe(0);
      expect(result.unitImbalanceCost).toBe(0);
      expect(result.unitRevenue).toBe(2500);
    });

    it("Senaryo 7: actualMwh = 0 durumunda sıfıra bölme hatası oluşmamalıdır", () => {
      const hourlyRecord: HourlyRecord = {
        timestamp,
        actualMwh: 0,
        forecastMwh: 50, // -50 MWh
      };
      const marketPriceRecord: MarketPriceRecord = {
        timestamp,
        ptf: 2000,
        smf: 2600,
        systemDirection: "DEFICIT",
      };

      const result = processHourlyRecord(hourlyRecord, marketPriceRecord, profile);

      expect(result.actualMwh).toBe(0);
      expect(result.imbalanceMwh).toBe(-50);
      expect(result.unitRevenue).toBe(0);
      expect(result.unitImbalanceCost).toBe(0);
      expect(Number.isFinite(result.unitRevenue)).toBe(true);
      expect(Number.isFinite(result.unitImbalanceCost)).toBe(true);
    });
  });

  describe("processPlant Fonksiyonu", () => {
    it("Santral ID ve tarih aralığına göre kayıtları filtreleyip sıralı işlemelidir", () => {
      const records: PlantHourlyInput[] = [
        {
          plantId: "plant-1",
          hourlyRecord: {
            timestamp: "2026-09-22T08:00:00Z",
            actualMwh: 50,
            forecastMwh: 50,
          },
          marketPriceRecord: {
            timestamp: "2026-09-22T08:00:00Z",
            ptf: 2500,
            smf: 2500,
            systemDirection: "BALANCED",
          },
        },
        {
          plantId: "plant-2", // Farklı santral
          hourlyRecord: {
            timestamp: "2026-09-22T09:00:00Z",
            actualMwh: 30,
            forecastMwh: 30,
          },
          marketPriceRecord: {
            timestamp: "2026-09-22T09:00:00Z",
            ptf: 2600,
            smf: 2600,
            systemDirection: "BALANCED",
          },
        },
        {
          plantId: "plant-1",
          hourlyRecord: {
            timestamp: "2026-09-22T09:00:00Z",
            actualMwh: 55,
            forecastMwh: 50,
          },
          marketPriceRecord: {
            timestamp: "2026-09-22T09:00:00Z",
            ptf: 2600,
            smf: 2400,
            systemDirection: "SURPLUS",
          },
        },
        {
          plantId: "plant-1", // Tarih aralığı dışında
          hourlyRecord: {
            timestamp: "2026-09-23T12:00:00Z",
            actualMwh: 40,
            forecastMwh: 40,
          },
          marketPriceRecord: {
            timestamp: "2026-09-23T12:00:00Z",
            ptf: 2500,
            smf: 2500,
            systemDirection: "BALANCED",
          },
        },
      ];

      const results = processPlant(
        "plant-1",
        {
          start: "2026-09-22T00:00:00Z",
          end: "2026-09-22T23:59:59Z",
        },
        records,
        DEFAULT_IMBALANCE_PROFILE
      );

      // Sadece plant-1 ve belirtilen güne ait 2 kayıt işlenmeli
      expect(results.length).toBe(2);
      expect(results[0].timestamp).toBe("2026-09-22T08:00:00Z");
      expect(results[0].imbalanceMwh).toBe(0);
      expect(results[1].timestamp).toBe("2026-09-22T09:00:00Z");
      expect(results[1].imbalanceMwh).toBe(5);
    });
  });
});
