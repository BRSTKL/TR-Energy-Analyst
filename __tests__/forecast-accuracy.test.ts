import { describe, it, expect } from "vitest";
import { computeAccuracyStats, analyzePlantAccuracy, diagnoseAccuracy } from "@/lib/analysis/forecast-accuracy";

const rec = (iso: string, forecastMwh: number, actualMwh: number) => ({
  timestamp: new Date(iso),
  forecastMwh,
  actualMwh,
});

describe("Fiyattan Bağımsız Tahmin Doğruluğu (forecast-accuracy)", () => {
  it("Bias, WAPE, MAE ve saat paylarını hesaplamalıdır", () => {
    const s = computeAccuracyStats([
      rec("2025-01-01T00:00:00Z", 10, 12), // +2 eksik tahmin
      rec("2025-01-01T01:00:00Z", 10, 7), // -3 aşırı tahmin
      rec("2025-01-01T02:00:00Z", 10, 10), // 0
      rec("2025-01-01T03:00:00Z", 10, 11), // +1
    ]);
    expect(s.netErrorMwh).toBe(0);
    expect(s.absErrorMwh).toBe(6);
    expect(s.biasRatio).toBe(0);
    expect(s.wape).toBeCloseTo(6 / 40, 10);
    expect(s.maeMwh).toBe(1.5);
    expect(s.systematicShare).toBe(0);
    expect(s.underForecastHourShare).toBe(0.5);
    expect(s.overForecastHourShare).toBe(0.25);
  });

  it("Tamamen tek yönlü hatada sistematik payı 1 olmalıdır", () => {
    const s = computeAccuracyStats([
      rec("2025-01-01T00:00:00Z", 10, 12),
      rec("2025-01-01T01:00:00Z", 10, 13),
    ]);
    expect(s.systematicShare).toBe(1);
    expect(s.biasRatio).toBeCloseTo(5 / 20, 10);
  });

  it("Boş girdide sıfıra bölme hatası vermemelidir", () => {
    const s = computeAccuracyStats([]);
    expect(s.wape).toBe(0);
    expect(s.biasRatio).toBe(0);
    expect(s.systematicShare).toBe(0);
  });

  it("Ay ve günün saati kırılımlarını duvar saati UTC alanlarına göre gruplamalı, en büyük sapmaları sıralamalıdır", () => {
    const r = analyzePlantAccuracy({ plantId: "p", plantName: "RES_1", plantType: "RES" }, [
      rec("2025-01-31T23:00:00Z", 5, 9),
      rec("2025-02-01T00:00:00Z", 5, 1),
      rec("2025-02-01T23:00:00Z", 5, 6),
    ], 2);

    expect(r.monthly.map((m) => [m.key, m.netErrorMwh])).toEqual([
      ["2025-01", 4],
      ["2025-02", -3],
    ]);
    expect(r.hourOfDay.map((h) => [h.key, h.hours])).toEqual([
      ["00", 1],
      ["23", 2],
    ]);
    expect(r.worstHours.map((w) => w.errorMwh)).toEqual([4, -4]);
  });
});

describe("Ölçekleme sonrası WAPE ve yorum (diagnoseAccuracy)", () => {
  it("Tahmini Σgerçekleşen/Σtahmin ile ölçekleyince oluşacak WAPE'yi hesaplamalıdır", () => {
    // Tahmin her saat gerçekleşenin tam yarısı: ölçekleme (×2) hatayı sıfırlar
    const s = computeAccuracyStats([
      rec("2025-01-01T00:00:00Z", 5, 10),
      rec("2025-01-01T01:00:00Z", 3, 6),
    ]);
    expect(s.wape).toBeCloseTo(8 / 16, 10);
    expect(s.wapeAfterScaling).toBeCloseTo(0, 10);
  });

  it("Ölçekleme WAPE'yi düşürmüyorsa 'indirir' dememelidir", () => {
    // Net sapma var ama saat bazında ters yönlü büyük hatalar: ölçekleme mutlak hatayı artırır
    const s = computeAccuracyStats([
      rec("2025-01-01T00:00:00Z", 10, 0),
      rec("2025-01-01T01:00:00Z", 0, 20),
    ]);
    expect(s.wapeAfterScaling).toBeGreaterThanOrEqual(s.wape);
    const text = diagnoseAccuracy(s);
    expect(text).toContain("düşürmez");
    expect(text).not.toContain("indirir");
  });

  it("Yüksek sistematik payda tek yönlü payı ve ölçekleme etkisini belirtmelidir", () => {
    const s = computeAccuracyStats([
      rec("2025-01-01T00:00:00Z", 5, 10),
      rec("2025-01-01T01:00:00Z", 3, 6),
    ]);
    const text = diagnoseAccuracy(s);
    expect(text).toContain("tek yönlü payı %100");
    expect(text).toContain("yukarı ölçeklemek");
    expect(text).toContain("indirir");
  });
});
