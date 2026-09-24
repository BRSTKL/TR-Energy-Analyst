import { describe, it, expect } from "vitest";
import { processHourlyRecord } from "../lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, HourlyResult, SystemDirection } from "../lib/calculations/types";
import { evaluateRealisticClosing, realisticTradePrice } from "../lib/analysis/intraday-arbitrage";
import { idmContractToWallClock } from "../lib/services/epias-service";

/**
 * 2025 (sabit %3). Sistem fazlada: PTF 2500, SMF 1800 → pozitif fiyat 1800×0,97 = 1746,
 * negatif fiyat 2500×1,03 = 2575. GİP: ortalama 2100, en düşük 1500, en yüksek 2600.
 */
const hour = (
  plantId: string,
  forecast: number,
  actual: number,
  dir: SystemDirection = "SURPLUS",
  gip: Partial<Pick<HourlyResult, "gipVolumeMwh" | "gipMinPrice" | "gipMaxPrice">> = {},
  ts = "2025-04-12T11:00:00Z"
): HourlyResult => ({
  ...processHourlyRecord(
    { timestamp: ts, forecastMwh: forecast, actualMwh: actual },
    { timestamp: ts, ptf: 2500, smf: 1800, systemDirection: dir },
    DEFAULT_IMBALANCE_PROFILE
  ),
  plantId,
  gipPrice: 2100,
  gipVolumeMwh: 1000,
  gipMinPrice: 1500,
  gipMaxPrice: 2600,
  ...gip,
});
const P = { sharePercent: 25, volumeCapPercent: 10, stressHaircutPercent: 50 };

describe("Gerçekçi GİP kapatma senaryosu", () => {
  it("Zor saat: sistem fazladayken satış fiyatı en düşük eşleşme fiyatına doğru kayar", () => {
    const h = hour("A", 60, 100);
    expect(realisticTradePrice(h, "sell", 50)).toEqual({ price: 1800, stressed: true, hasRange: true });
    // Fazladayken alış zor değil: ortalama fiyat
    expect(realisticTradePrice(h, "buy", 50).price).toBe(2100);
    // Açıktayken alış zor: en yüksek fiyata doğru
    expect(realisticTradePrice({ ...h, systemDirection: "DEFICIT" }, "buy", 50).price).toBe(2350);
  });

  it("Fazla üretimi fazladaki saatte satmak: basit senaryonun çok altında kazanç", () => {
    // +40 MWh; %25 = 10 MWh. Basit: 10 × (2100 − 1746) = 3.540. Gerçekçi: 10 × (1800 − 1746) = 540
    const r = evaluateRealisticClosing([hour("A", 60, 100)], P);
    expect(r.simpleGainTl).toBeCloseTo(3540, 6);
    expect(r.realisticGainTl).toBeCloseTo(540, 6);
    expect(r.cappedHours).toBe(0);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0]).toMatchObject({ direction: "SURPLUS", side: "sell", closedMwh: 10 });
  });

  it("Hacim sınırı saatteki toplam isteği sınırlar ve santraller arasında orantılı böler", () => {
    // İki santral +40'ar MWh → istenen 20 MWh; hacim 50 → sınır %10 = 5 MWh → her santral 2,5 MWh
    const r = evaluateRealisticClosing([hour("A", 60, 100, "SURPLUS", { gipVolumeMwh: 50 }), hour("B", 60, 100, "SURPLUS", { gipVolumeMwh: 50 })], P);
    expect(r.desiredMwh).toBeCloseTo(20, 6);
    expect(r.closedMwh).toBeCloseTo(5, 6);
    expect(r.cappedHours).toBe(1);
    expect(r.realisticGainTl).toBeCloseTo(5 * (1800 - 1746), 6);
  });

  it("Sistem fazladayken eksik üretimi GİP'ten almak zor değildir: ortalama fiyat", () => {
    // −20 MWh; %25 = 5 MWh; kazanç 5 × (2575 − 2100) = 2.375 (basit ile aynı)
    const r = evaluateRealisticClosing([hour("A", 60, 40)], P);
    expect(r.realisticGainTl).toBeCloseTo(2375, 6);
    expect(r.simpleGainTl).toBeCloseTo(2375, 6);
  });

  it("Hacim veya min/maks fiyat yoksa sınır uygulanmaz, ortalama fiyat kullanılır ve sayılır", () => {
    const r = evaluateRealisticClosing([hour("A", 60, 100, "SURPLUS", { gipVolumeMwh: null, gipMinPrice: null })], P);
    expect(r.hoursWithoutVolume).toBe(1);
    expect(r.stressedHoursWithoutRange).toBe(1);
    expect(r.realisticGainTl).toBeCloseTo(r.simpleGainTl, 6);
  });

  it("GİP kontrat adı duvar saatine çevrilir; blok kontratlar atlanır", () => {
    expect(idmContractToWallClock("PH25061013")?.toISOString()).toBe("2025-06-10T13:00:00.000Z");
    expect(idmContractToWallClock("PB25061008-12")).toBeNull();
  });
});
