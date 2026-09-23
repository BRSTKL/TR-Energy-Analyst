import { describe, it, expect } from "vitest";
import {
  determineSystemDirection,
  calculateImbalanceMwh,
  calculateImbalanceCost,
} from "@/lib/calculations/imbalance";

describe("TR-Energy Analyst Sanity Test Suite", () => {
  it("temel test altyapısının sorunsuz çalıştığını doğrular", () => {
    expect(true).toBe(true);
    expect(1 + 1).toBe(2);
  });

  describe("Sistem Yönü ve Dengesizlik Hesaplamaları", () => {
    it("SMF > PTF olduğunda Enerji Açığı (ENERGY_DEFICIT) tespit etmelidir", () => {
      const direction = determineSystemDirection(2500, 3100);
      expect(direction).toBe("ENERGY_DEFICIT");
    });

    it("SMF < PTF olduğunda Enerji Fazlası (ENERGY_SURPLUS) tespit etmelidir", () => {
      const direction = determineSystemDirection(2500, 1800);
      expect(direction).toBe("ENERGY_SURPLUS");
    });

    it("SMF == PTF olduğunda Dengede (IN_BALANCE) tespit etmelidir", () => {
      const direction = determineSystemDirection(2500, 2500);
      expect(direction).toBe("IN_BALANCE");
    });

    it("Dengesizlik miktarını (gerçekleşen - tahmin) doğru hesaplamalıdır", () => {
      expect(calculateImbalanceMwh(105.5, 100.0)).toBe(5.5);
      expect(calculateImbalanceMwh(92.2, 100.0)).toBe(-7.8);
    });

    it("Pozitif dengesizlik durumunda EPİAŞ kurallarına göre alacak ve maliyeti hesaplamalıdır", () => {
      // Tahmin: 100 MWh, Gerçekleşen: 110 MWh (+10 MWh dengesizlik)
      // PTF: 2000 TL, SMF: 2500 TL (Sistem Enerji Açığında)
      // Satış Birim Fiyatı = Min(2000, 2500) * (1 - 0.03) = 2000 * 0.97 = 1940 TL/MWh
      const result = calculateImbalanceCost({
        actualMwh: 110,
        forecastMwh: 100,
        ptf: 2000,
        smf: 2500,
        kFactor: 0.03,
      });

      expect(result.imbalanceMwh).toBe(10);
      expect(result.systemDirection).toBe("ENERGY_DEFICIT");
      expect(result.unitPriceTl).toBe(1940);
      expect(result.imbalanceAmountTl).toBe(19400);
      // İdealde GÖP'te satılsaydı 10 * 2000 = 20000 TL olacaktı, ceza kaybı = 600 TL
      expect(result.penaltyCostTl).toBe(600);
    });

    it("Negatif dengesizlik durumunda EPİAŞ kurallarına göre borç ve maliyeti hesaplamalıdır", () => {
      // Tahmin: 100 MWh, Gerçekleşen: 90 MWh (-10 MWh dengesizlik)
      // PTF: 2000 TL, SMF: 2800 TL (Enerji Açığı)
      // Alış Birim Fiyatı = Max(2000, 2800) * (1 + 0.03) = 2800 * 1.03 = 2884 TL/MWh
      const result = calculateImbalanceCost({
        actualMwh: 90,
        forecastMwh: 100,
        ptf: 2000,
        smf: 2800,
        kFactor: 0.03,
      });

      expect(result.imbalanceMwh).toBe(-10);
      expect(result.unitPriceTl).toBe(2884);
      expect(result.imbalanceAmountTl).toBe(-28840);
      // GÖP geliri 10 * 2000 = 20000 TL idi, geri ödenen 28840 TL -> ceza/net kayıp = 8840 TL
      expect(result.penaltyCostTl).toBe(8840);
    });
  });
});
