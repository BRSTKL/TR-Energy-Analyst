import { describe, it, expect } from "vitest";
import { processHourlyRecord } from "../lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, type HourlyResult } from "../lib/calculations/types";
import { persistenceStrategy, priceHours, runBacktest } from "../lib/analysis/backtest";
import {
  directionBiasStrategy,
  directionHourCost,
  directionPersistenceStrategy,
  kupstDeltaFor,
  persistenceClass,
  plantKupstDelta,
} from "../lib/analysis/direction-strategy";

/**
 * 2025 saatleri (sabit %3). Sistem hep açık: PTF 2000, SMF 3000. Plan 100; gerçekleşen sırayla 120 / 80
 * (±20 hata). Eksik üretim pahalı (20 × (3000 × 1,03 − 2000) = 21.800 ₺), fazla üretim ucuz (20 × 60 = 1.200 ₺).
 */
function month(m: number, gip: number | null = 2500): HourlyResult[] {
  const rows: HourlyResult[] = [];
  for (let d = 1; d <= 7; d++) {
    for (let h = 0; h < 24; h++) {
      const ts = `2025-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00Z`;
      rows.push({
        ...processHourlyRecord(
          { timestamp: ts, forecastMwh: 100, actualMwh: h % 2 === 0 ? 120 : 80 },
          { timestamp: ts, ptf: 2000, smf: 3000, systemDirection: "DEFICIT" },
          DEFAULT_IMBALANCE_PROFILE
        ),
        gipPrice: gip,
        plantId: "p1",
      });
    }
  }
  return rows;
}

describe("plantKupstDelta", () => {
  it("planı k ile çarpınca KÜPST farkını elle hesaplananla aynı verir", () => {
    const h = month(1)[0]; // plan 100, gerçekleşen 120, rüzgâr toleransı %17 (2025), katsayı 0,03
    // k = 1: |120 − 100| − 17 = 3 MWh → 3 × 3000 × 0,03 = 270 ₺; k = 0,8: |120 − 80| − 13,6 = 26,4 → 2.376 ₺
    expect(plantKupstDelta(h, "RES", 0.8)).toBeCloseTo(2376 - 270, 6);
    expect(plantKupstDelta(h, "RES", 1)).toBe(0);
  });
});

describe("directionBiasStrategy", () => {
  const hourly = [1, 2, 3, 4, 5, 6].flatMap((m) => month(m));
  const kupst = kupstDeltaFor([{ plantType: "RES", hourly }]);
  const probs = new Map(hourly.map((h) => [new Date(h.timestamp).getTime(), 0.9]));

  it("D-1: açık beklenen saatlerde planı aşağı çeker ve örneklem dışında KÜPST dahil tasarruf eder", () => {
    const bt = runBacktest(hourly, DEFAULT_IMBALANCE_PROFILE, { strategies: [directionBiasStrategy(probs, "D-1", kupst)] });
    const s = bt.strategies[0];
    expect(s.testMonths).toBe(2);
    expect(s.outOfSampleSavingTl).toBeGreaterThan(0);
    expect(s.nextMonthParams).toMatch(/k = 0,[89]/);
  });

  it("olasılığı olmayan saatte ve GİP fiyatı olmayan saatte (H-2) plan değişmez", () => {
    const noGip = [1, 2, 3, 4, 5, 6].flatMap((m) => month(m, null));
    const bt = runBacktest(noGip, DEFAULT_IMBALANCE_PROFILE, {
      strategies: [directionBiasStrategy(probs, "H-2", kupstDeltaFor([{ plantType: "RES", hourly: noGip }]))],
    });
    expect(bt.strategies[0].outOfSampleSavingTl).toBeCloseTo(0, 6);

    const none = runBacktest(hourly, DEFAULT_IMBALANCE_PROFILE, { strategies: [directionBiasStrategy(new Map(), "D-1", kupst)] });
    expect(none.strategies[0].outOfSampleSavingTl).toBeCloseTo(0, 6);
  });

  it("H-2: GİP işlem maliyeti Δ × (GİP − PTF) eklenir", () => {
    const [h] = priceHours([month(1)[0]], DEFAULT_IMBALANCE_PROFILE);
    const noKupst = () => 0;
    // k = 0,8: Δ = 20 MWh GİP'ten geri alınır, maliyet 20 × (2500 − 2000) = 10.000 ₺ fazladan
    expect(directionHourCost(h, 0.8, "H-2", noKupst) - directionHourCost(h, 0.8, "D-1", noKupst)).toBeCloseTo(10_000, 6);
  });
});

describe("directionPersistenceStrategy", () => {
  it("işlem sınıfı: açık beklenirken eksiği kapatmak (alış) pahalı tarafı kapatır", () => {
    expect(persistenceClass(-10, 0.8, 0.5)).toBe("aligned");
    expect(persistenceClass(10, 0.8, 0.5)).toBe("opposed");
    expect(persistenceClass(10, 0.2, 0.5)).toBe("aligned");
    expect(persistenceClass(-10, 0.2, 0.5)).toBe("opposed");
    expect(persistenceClass(10, undefined, 0.5)).toBe("unknown");
    expect(persistenceClass(0, 0.9, 0.5)).toBe("unknown");
  });

  /** Hata 6 saatlik bloklarla süren saatler (2 saat önceki hata çoğunlukla sürer): gerçekleşen 100 ± 20, GİP hacmi bol */
  function persistentMonth(m: number): HourlyResult[] {
    return month(m).map((h, i) => {
      const err = Math.floor(i / 6) % 2 === 0 ? 20 : -20;
      return {
        ...processHourlyRecord(
          { timestamp: h.timestamp, forecastMwh: 100, actualMwh: 100 + err },
          { timestamp: h.timestamp, ptf: 2000, smf: 3000, systemDirection: "DEFICIT" },
          DEFAULT_IMBALANCE_PROFILE
        ),
        gipPrice: 2100,
        gipVolumeMwh: 10_000,
        gipMinPrice: 1900,
        gipMaxPrice: 2300,
        plantId: "p1",
      };
    });
  }
  const hourly = [1, 2, 3, 4, 5, 6].flatMap((m) => persistentMonth(m));

  it("olasılık yoksa düz kalıcılık kuralıyla aynı sonucu verir", () => {
    const bt = runBacktest(hourly, DEFAULT_IMBALANCE_PROFILE, {
      strategies: [persistenceStrategy(2), directionPersistenceStrategy(new Map(), 2)],
    });
    const [plain, combined] = bt.strategies;
    expect(plain.outOfSampleSavingTl).toBeGreaterThan(0);
    expect(combined.outOfSampleSavingTl).toBeCloseTo(plain.outOfSampleSavingTl, 6);
    expect(combined.inSampleSavingTl).toBeCloseTo(plain.inSampleSavingTl, 6);
  });

  it("eğitim döneminde düz kalıcılıktan kötü olamaz (eşit paylar seçilebilir)", () => {
    const probs = new Map(hourly.map((h, i) => [new Date(h.timestamp).getTime(), i % 5 === 0 ? 0.2 : 0.9]));
    const bt = runBacktest(hourly, DEFAULT_IMBALANCE_PROFILE, {
      strategies: [persistenceStrategy(2), directionPersistenceStrategy(probs, 2)],
    });
    const [plain, combined] = bt.strategies;
    expect(combined.inSampleSavingTl).toBeGreaterThanOrEqual(plain.inSampleSavingTl - 1e-6);
  });
});
