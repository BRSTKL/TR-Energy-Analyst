import { describe, it, expect } from "vitest";
import { simulateForecastScaling } from "@/lib/analysis/scaling-impact";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, SystemDirection } from "@/lib/calculations/types";

const hour = (h: number, forecastMwh: number, actualMwh: number, ptf: number, smf: number, dir: SystemDirection) =>
  processHourlyRecord(
    { timestamp: new Date(Date.UTC(2025, 0, 1, h)), forecastMwh, actualMwh },
    { timestamp: new Date(Date.UTC(2025, 0, 1, h)), ptf, smf, systemDirection: dir },
    DEFAULT_IMBALANCE_PROFILE
  );

describe("Tahmin ölçeklemesinin maliyet etkisi (scaling-impact)", () => {
  it("Tahmin gerçekleşenin sabit oranıysa ölçekleme maliyeti sıfırlamalıdır", () => {
    const r = simulateForecastScaling([hour(0, 5, 10, 2000, 1800, "SURPLUS"), hour(1, 3, 6, 2500, 2600, "DEFICIT")]);
    expect(r.scaleFactor).toBe(2);
    expect(r.baselineImbalanceCost).toBeGreaterThan(0);
    expect(r.scaledImbalanceCost).toBeCloseTo(0, 6);
    expect(r.changeRatio).toBeCloseTo(-1, 6);
  });

  it("Ölçekleme maliyeti artırıyorsa artışı sabitlemeden (pozitif) döndürmelidir", () => {
    // Net sapma sıfıra yakın ama ters yönlü: ölçekleme sistem açığındaki saatte eksik üretimi büyütür
    const r = simulateForecastScaling([
      hour(0, 10, 12, 2000, 1900, "SURPLUS"), // +2 fazla, ucuz saat
      hour(1, 10, 9, 3000, 3400, "DEFICIT"), // -1 eksik, pahalı açık saati
    ]);
    // k = 21/20: 00:00 → +1.5 (maliyet düşer), 01:00 → -1.5 (cezalı saat büyür)
    expect(r.scaleFactor).toBeCloseTo(1.05, 10);
    expect(r.changeTl).toBeGreaterThan(0);
  });

  it("Boş girdide sıfır dönmelidir", () => {
    const r = simulateForecastScaling([]);
    expect(r.scaleFactor).toBe(1);
    expect(r.changeTl).toBe(0);
    expect(r.changeRatio).toBe(0);
  });
});
