import { describe, expect, it } from "vitest";
import {
  calculateUnitRevenue,
  calculateUnitImbalanceCost,
  validateHourlyInput,
  detectMissingHours,
  processHourlyRecord,
} from "../lib/calculations/engine";
import {
  aggregateMonthly,
  aggregateYearly,
} from "../lib/calculations/aggregate";
import {
  findHighestCostHours,
  generateMitigationSuggestions,
  comparePlantProfitability,
} from "../lib/strategy/insights";
import { DEFAULT_IMBALANCE_PROFILE } from "../lib/calculations/types";

describe("Edge Cases & Hata Dayanıklılığı Testleri", () => {
  describe("1. Sıfır Bölme ve Sayısal Sınırlar", () => {
    it("Üretim 0 olduğunda birim gelir ve birim maliyet NaN veya Infinity değil, 0 dönmelidir", () => {
      expect(calculateUnitRevenue(150000, 0)).toBe(0);
      expect(calculateUnitImbalanceCost(25000, 0)).toBe(0);
      expect(calculateUnitRevenue(0, 0)).toBe(0);
      expect(calculateUnitImbalanceCost(0, 0)).toBe(0);
    });

    it("Üretim negatif verildiğinde sıfır bölme koruması çalışmalı ve 0 dönmelidir", () => {
      expect(calculateUnitRevenue(150000, -10)).toBe(0);
      expect(calculateUnitImbalanceCost(25000, -5)).toBe(0);
    });

    it("NaN veya sonsuz değerler verildiğinde çökmeden 0 dönmelidir", () => {
      expect(calculateUnitRevenue(NaN, 10)).toBe(0);
      expect(calculateUnitRevenue(Infinity, 10)).toBe(0);
      expect(calculateUnitImbalanceCost(NaN, 0)).toBe(0);
    });
  });

  describe("2. Girdi Doğrulama ve Sanitization", () => {
    it("Negatif MWh değerlerini yakalamalı, sıfırlamalı ve anlamlı uyarılar üretmelidir", () => {
      const result = validateHourlyInput(-15, -5, 2500, 2600);
      expect(result.isValid).toBe(false);
      expect(result.sanitized.actualMwh).toBe(0);
      expect(result.sanitized.forecastMwh).toBe(0);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
      expect(result.warnings[0]).toContain("negatif olamaz");
    });

    it("NaN ve geçersiz fiyatları yakalamalı ve taban fiyata çekmelidir", () => {
      const result = validateHourlyInput(NaN, 20, -500, NaN);
      expect(result.isValid).toBe(false);
      expect(result.sanitized.actualMwh).toBe(0);
      expect(result.sanitized.ptf).toBe(0);
      expect(result.sanitized.smf).toBe(0);
      expect(result.warnings.some((w) => w.includes("PTF geçersiz"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("SMF geçersiz"))).toBe(true);
    });

    it("Tamamen geçerli girdilerde hiçbir uyarı üretmemelidir", () => {
      const result = validateHourlyInput(40, 45, 2400, 2600);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.sanitized.actualMwh).toBe(40);
      expect(result.sanitized.forecastMwh).toBe(45);
    });
  });

  describe("3. Eksik Saat Tespiti (Missing Hours)", () => {
    it("Ardışık 24 saatlik veride eksik saat bulmamalıdır", () => {
      const times = Array.from({ length: 24 }, (_, i) =>
        new Date(Date.UTC(2026, 0, 1, i, 0, 0))
      );
      const res = detectMissingHours(times);
      expect(res.hasMissingHours).toBe(false);
      expect(res.missingHoursCount).toBe(0);
      expect(res.missingGaps).toHaveLength(0);
    });

    it("Atlanan saatleri ve eksik saat miktarını tam olarak tespit etmelidir", () => {
      // 00:00, 01:00, (02, 03 atlandı), 04:00, 05:00
      const times = [
        new Date("2026-01-01T00:00:00Z"),
        new Date("2026-01-01T01:00:00Z"),
        new Date("2026-01-01T04:00:00Z"),
        new Date("2026-01-01T05:00:00Z"),
      ];
      const res = detectMissingHours(times);
      expect(res.hasMissingHours).toBe(true);
      expect(res.missingHoursCount).toBe(2);
      expect(res.missingGaps).toHaveLength(1);
      expect(res.missingGaps[0].hoursMissing).toBe(2);
      expect(res.missingGaps[0].expected.toISOString()).toBe("2026-01-01T02:00:00.000Z");
    });
  });

  describe("4. Boş Veri Kümelerinde Agregasyon ve Strateji Motoru", () => {
    it("aggregateMonthly boş dizi aldığında çökmeden boş dizi dönmelidir", () => {
      const res = aggregateMonthly([]);
      expect(res).toEqual([]);
    });

    it("aggregateYearly boş dizi aldığında sıfır dolu güvenli özet dönmelidir", () => {
      const res = aggregateYearly([]);
      expect(res.totalActualMwh).toBe(0);
      expect(res.totalRevenue).toBe(0);
      expect(res.unitRevenue).toBe(0);
      expect(res.unitImbalanceCost).toBe(0);
    });

    it("findHighestCostHours boş dizi aldığında çökmeden sıfırlı analiz dönmelidir", () => {
      const res = findHighestCostHours([]);
      expect(res.totalAnalyzedHours).toBe(0);
      expect(res.topHours).toHaveLength(0);
      expect(res.errorRateRatio).toBe(1);
    });

    it("generateMitigationSuggestions boş analizde çökmeden boş veya temel öneri dönmelidir", () => {
      const emptyAnalysis = findHighestCostHours([]);
      const suggestions = generateMitigationSuggestions(
        { plantId: "p1", plantName: "Test Plant", plantType: "RES", capacityMw: 50 },
        emptyAnalysis,
        []
      );
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it("comparePlantProfitability boş veri eşlemesinde çökmeden sonuç üretmelidir", () => {
      const comparisons = comparePlantProfitability([], {});
      expect(comparisons).toEqual([]);
    });
  });
});
