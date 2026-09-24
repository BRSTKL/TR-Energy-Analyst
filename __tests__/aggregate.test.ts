import { describe, it, expect } from "vitest";
import {
  aggregateMonthly,
  aggregateYearly,
  aggregateYearlyByPlant,
} from "@/lib/calculations/aggregate";
import { HourlyResult, MonthlyAggregate } from "@/lib/calculations/types";

describe("Agregasyon Motoru Birim Testleri", () => {
  describe("aggregateMonthly", () => {
    it("saatlik verileri santral ve ay bazında doğru toplamalı ve birim metrikleri üretmelidir", () => {
      const hourlyResults: HourlyResult[] = [
        // 2026 Ocak - Saat 1
        {
          timestamp: "2026-01-15T10:00:00Z",
          plantId: "res-1",
          plantName: "Ege RES-1",
          actualMwh: 40,
          forecastMwh: 50,
          ptf: 2000,
          smf: 2500,
          systemDirection: "DEFICIT",
          imbalanceMwh: -10,
          positivePrice: 1940,
          negativePrice: 2575,
          imbalanceAmount: -25750,
          dayAheadSalesAmount: 100000, // 50 * 2000
          totalRevenue: 74250, // 100000 - 25750
          unitRevenue: 1856.25, // 74250 / 40
          fictiveRevenue: 80000, // 40 * 2000
          imbalanceCost: 5750, // 80000 - 74250
          unitImbalanceCost: 143.75, // 5750 / 40
        },
        // 2026 Ocak - Saat 2
        {
          timestamp: "2026-01-15T11:00:00Z",
          plantId: "res-1",
          plantName: "Ege RES-1",
          actualMwh: 60,
          forecastMwh: 50,
          ptf: 2000,
          smf: 1800,
          systemDirection: "SURPLUS",
          imbalanceMwh: 10,
          positivePrice: 1746,
          negativePrice: 2060,
          imbalanceAmount: 17460,
          dayAheadSalesAmount: 100000, // 50 * 2000
          totalRevenue: 117460, // 100000 + 17460
          unitRevenue: 1957.67,
          fictiveRevenue: 120000, // 60 * 2000
          imbalanceCost: 2540, // 120000 - 117460
          unitImbalanceCost: 42.33,
        },
        // 2026 Şubat - Saat 1
        {
          timestamp: "2026-02-10T14:00:00Z",
          plantId: "res-1",
          plantName: "Ege RES-1",
          actualMwh: 50,
          forecastMwh: 50,
          ptf: 2200,
          smf: 2200,
          systemDirection: "BALANCED",
          imbalanceMwh: 0,
          positivePrice: 2134,
          negativePrice: 2266,
          imbalanceAmount: 0,
          dayAheadSalesAmount: 110000,
          totalRevenue: 110000,
          unitRevenue: 2200,
          fictiveRevenue: 110000,
          imbalanceCost: 0,
          unitImbalanceCost: 0,
        },
      ];

      const monthly = aggregateMonthly(hourlyResults);

      expect(monthly.length).toBe(2);

      // Ocak Ayı Doğrulaması
      const jan = monthly.find((m) => m.yearMonth === "2026-01");
      expect(jan).toBeDefined();
      expect(jan?.year).toBe(2026);
      expect(jan?.month).toBe(1);
      expect(jan?.plantId).toBe("res-1");
      expect(jan?.totalActualMwh).toBe(100); // 40 + 60
      expect(jan?.totalDayAheadSalesAmount).toBe(200000); // 100000 + 100000
      expect(jan?.totalImbalanceAmount).toBe(-8290); // -25750 + 17460
      expect(jan?.totalRevenue).toBe(191710); // 74250 + 117460
      // Birim Gelir = 191710 / 100 = 1917.10 TL/MWh
      expect(jan?.unitRevenue).toBe(1917.1);
      expect(jan?.totalImbalanceCost).toBe(8290); // 5750 + 2540
      // Birim Dengesizlik Maliyeti = 8290 / 100 = 82.90 TL/MWh
      expect(jan?.unitImbalanceCost).toBe(82.9);

      // Şubat Ayı Doğrulaması
      const feb = monthly.find((m) => m.yearMonth === "2026-02");
      expect(feb).toBeDefined();
      expect(feb?.totalActualMwh).toBe(50);
      expect(feb?.unitRevenue).toBe(2200);
      expect(feb && "imbalanceCost" in feb).toBe(false); // doğru alan adı totalImbalanceCost
      expect(feb?.totalImbalanceCost).toBe(0);
      expect(feb?.unitImbalanceCost).toBe(0);
    });

    it("totalActualMwh = 0 durumunda birim metriklerde sıfıra bölme hatası oluşturmamalıdır", () => {
      const zeroMwhRecords: HourlyResult[] = [
        {
          timestamp: "2026-03-01T00:00:00Z",
          plantId: "ges-1",
          actualMwh: 0,
          forecastMwh: 10,
          ptf: 2000,
          smf: 2500,
          systemDirection: "DEFICIT",
          imbalanceMwh: -10,
          positivePrice: 1940,
          negativePrice: 2575,
          imbalanceAmount: -25750,
          dayAheadSalesAmount: 20000,
          totalRevenue: -5750,
          unitRevenue: 0,
          fictiveRevenue: 0,
          imbalanceCost: 5750,
          unitImbalanceCost: 0,
        },
      ];

      const monthly = aggregateMonthly(zeroMwhRecords);
      expect(monthly[0].totalActualMwh).toBe(0);
      expect(monthly[0].unitRevenue).toBe(0);
      expect(monthly[0].unitImbalanceCost).toBe(0);
      expect(Number.isFinite(monthly[0].unitRevenue)).toBe(true);
      expect(Number.isFinite(monthly[0].unitImbalanceCost)).toBe(true);
    });

    it("boş liste verildiğinde boş dizi döndürmelidir", () => {
      expect(aggregateMonthly([])).toEqual([]);
    });

    it("ayı UTC alanındaki duvar saatinden okur; ayın son saati bilgisayarın saat diliminden bağımsız olarak o ayda kalır", () => {
      const base = { actualMwh: 1, forecastMwh: 1, dayAheadSalesAmount: 1, imbalanceAmount: 0, totalRevenue: 1, imbalanceCost: 0 };
      const monthly = aggregateMonthly([
        { ...base, timestamp: new Date("2025-12-31T23:00:00Z") },
        { ...base, timestamp: new Date("2025-01-01T00:00:00Z") },
      ] as unknown as HourlyResult[]);
      expect(monthly.map((m) => [m.year, m.month])).toEqual([
        [2025, 1],
        [2025, 12],
      ]);
    });
  });

  describe("aggregateYearly (Ağırlıklı Ortalama Doğrulaması)", () => {
    it("KRİTİK TEST: Yıllık birim metrikler aylık birimlerin basit ortalaması DEĞİL, üretim ağırlıklı hesaplanmalıdır", () => {
      // 1. Ay (Ocak): Yüksek üretim, düşük birim fiyat
      // 100 MWh üretim, 100.000 TL gelir -> Birim Gelir = 1.000 TL/MWh
      // Dengesizlik Maliyeti: 10.000 TL -> Birim Maliyet = 100 TL/MWh
      const month1: MonthlyAggregate = {
        plantId: "res-1",
        year: 2026,
        month: 1,
        yearMonth: "2026-01",
        totalDayAheadSalesAmount: 110000,
        totalImbalanceAmount: -10000,
        totalRevenue: 100000,
        totalActualMwh: 100,
        unitRevenue: 1000, // 100.000 / 100
        totalImbalanceCost: 10000,
        unitImbalanceCost: 100, // 10.000 / 100
      };

      // 2. Ay (Şubat): Düşük üretim, yüksek birim fiyat
      // 10 MWh üretim, 20.000 TL gelir -> Birim Gelir = 2.000 TL/MWh
      // Dengesizlik Maliyeti: 5.000 TL -> Birim Maliyet = 500 TL/MWh
      const month2: MonthlyAggregate = {
        plantId: "res-1",
        year: 2026,
        month: 2,
        yearMonth: "2026-02",
        totalDayAheadSalesAmount: 25000,
        totalImbalanceAmount: -5000,
        totalRevenue: 20000,
        totalActualMwh: 10,
        unitRevenue: 2000, // 20.000 / 10
        totalImbalanceCost: 5000,
        unitImbalanceCost: 500, // 5.000 / 10
      };

      // Basit aritmetik ortalama tuzağı:
      // (1000 + 2000) / 2 = 1500 TL/MWh (YANLIŞ!)
      // (100 + 500) / 2 = 300 TL/MWh (YANLIŞ!)

      // Doğru ağırlıklı hesap:
      // Toplam Gelir = 100.000 + 20.000 = 120.000 TL
      // Toplam Üretim = 100 + 10 = 110 MWh
      // Ağırlıklı Birim Gelir = 120.000 / 110 = 1.090,9091 TL/MWh
      // Toplam Dengesizlik Maliyeti = 10.000 + 5.000 = 15.000 TL
      // Ağırlıklı Birim Maliyet = 15.000 / 110 = 136,3636 TL/MWh

      const yearly = aggregateYearly([month1, month2]);

      expect(yearly.year).toBe(2026);
      expect(yearly.totalActualMwh).toBe(110);
      expect(yearly.totalRevenue).toBe(120000);
      expect(yearly.totalImbalanceCost).toBe(15000);

      // Yıllık birim gelirin 1500 OLMADIĞINI ve doğru ağırlıklı 1090.9091 olduğunu doğrula
      expect(yearly.unitRevenue).not.toBe(1500);
      expect(yearly.unitRevenue).toBeCloseTo(1090.9091, 2);

      // Yıllık birim dengesizlik maliyetinin 300 OLMADIĞINI ve doğru ağırlıklı 136.3636 olduğunu doğrula
      expect(yearly.unitImbalanceCost).not.toBe(300);
      expect(yearly.unitImbalanceCost).toBeCloseTo(136.3636, 2);
    });

    it("toplam üretim sıfır olduğunda birim değerler sıfır dönmeli ve hata vermemelidir", () => {
      const monthZero: MonthlyAggregate = {
        plantId: "res-1",
        year: 2026,
        month: 1,
        yearMonth: "2026-01",
        totalDayAheadSalesAmount: 0,
        totalImbalanceAmount: -5000,
        totalRevenue: -5000,
        totalActualMwh: 0,
        unitRevenue: 0,
        totalImbalanceCost: 5000,
        unitImbalanceCost: 0,
      };

      const yearly = aggregateYearly([monthZero]);
      expect(yearly.totalActualMwh).toBe(0);
      expect(yearly.unitRevenue).toBe(0);
      expect(yearly.unitImbalanceCost).toBe(0);
    });

    it("boş aylık agregasyon listesi verildiğinde sıfırlı yıllık nesne dönmelidir", () => {
      const yearly = aggregateYearly([]);
      expect(yearly.totalRevenue).toBe(0);
      expect(yearly.unitRevenue).toBe(0);
    });
  });

  describe("aggregateYearlyByPlant", () => {
    it("birden fazla santrale ait aylık verileri her santral için ayrı yıllık agregasyona dönüştürmelidir", () => {
      const monthlyList: MonthlyAggregate[] = [
        {
          plantId: "plant-1",
          plantName: "RES-1",
          year: 2026,
          month: 1,
          yearMonth: "2026-01",
          totalDayAheadSalesAmount: 100000,
          totalImbalanceAmount: 0,
          totalRevenue: 100000,
          totalActualMwh: 50,
          unitRevenue: 2000,
          totalImbalanceCost: 0,
          unitImbalanceCost: 0,
        },
        {
          plantId: "plant-2",
          plantName: "GES-1",
          year: 2026,
          month: 1,
          yearMonth: "2026-01",
          totalDayAheadSalesAmount: 60000,
          totalImbalanceAmount: 0,
          totalRevenue: 60000,
          totalActualMwh: 30,
          unitRevenue: 2000,
          totalImbalanceCost: 0,
          unitImbalanceCost: 0,
        },
        {
          plantId: "plant-1",
          plantName: "RES-1",
          year: 2026,
          month: 2,
          yearMonth: "2026-02",
          totalDayAheadSalesAmount: 120000,
          totalImbalanceAmount: 0,
          totalRevenue: 120000,
          totalActualMwh: 60,
          unitRevenue: 2000,
          totalImbalanceCost: 0,
          unitImbalanceCost: 0,
        },
      ];

      const byPlant = aggregateYearlyByPlant(monthlyList);
      expect(byPlant.length).toBe(2);

      const plant1 = byPlant.find((p) => p.plantId === "plant-1");
      expect(plant1?.totalActualMwh).toBe(110);
      expect(plant1?.totalRevenue).toBe(220000);

      const plant2 = byPlant.find((p) => p.plantId === "plant-2");
      expect(plant2?.totalActualMwh).toBe(30);
      expect(plant2?.totalRevenue).toBe(60000);
    });
  });
});
