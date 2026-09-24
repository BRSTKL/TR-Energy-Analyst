import { describe, it, expect } from "vitest";
import { processHourlyRecord } from "../lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, HourlyResult } from "../lib/calculations/types";
import {
  combineBacktests,
  intradayClosingStrategy,
  runBacktest,
  volumeRatioStrategy,
} from "../lib/analysis/backtest";

/**
 * 2025 saatleri (sabit %3). Her ayın ilk 7 günü × 24 saat = 168 saat; 4 aylık pencere 672 saat (≥ 500).
 * PTF = SMF = 2000, sistem dengede: 10 MWh eksik üretimin maliyeti 10 × (2060 − 2000) = 600 ₺.
 */
function month(m: number, ratio: number, gip: number | null = null): HourlyResult[] {
  const rows: HourlyResult[] = [];
  for (let d = 1; d <= 7; d++) {
    for (let h = 0; h < 24; h++) {
      const ts = `2025-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00Z`;
      rows.push({
        ...processHourlyRecord(
          { timestamp: ts, forecastMwh: 100, actualMwh: 100 * ratio },
          { timestamp: ts, ptf: 2000, smf: 2000, systemDirection: "BALANCED" },
          DEFAULT_IMBALANCE_PROFILE
        ),
        gipPrice: gip,
      });
    }
  }
  return rows;
}

describe("Geriye dönük test motoru (backtest)", () => {
  it("Test ayının verisi kendi kuralını etkilemez (ileriye bakma yok)", () => {
    // Ocak–Nisan: gerçekleşen tahminin 1,1 katı. Mayıs: 0,9 katı.
    const hourly = [1, 2, 3, 4].flatMap((m) => month(m, 1.1)).concat(month(5, 0.9));
    const r = runBacktest(hourly, DEFAULT_IMBALANCE_PROFILE, { strategies: [volumeRatioStrategy] });
    const s = r.strategies[0];

    expect(r.testMonths).toEqual(["2025-05"]);
    // Mayıs kuralı Ocak–Nisan'dan öğrenildi: k = 1,1 → tahmin 110, gerçekleşen 90 → 20 MWh eksik.
    // Saat başı maliyet 600 → 1200: 168 saat × −600 = −100.800 ₺
    expect(s.months[0].params).toBe("k = 1,10");
    expect(s.outOfSampleSavingTl).toBeCloseTo(-100800, 0);
    expect(s.positiveMonths).toBe(0);
    // Aynı dönem referansı Mayıs'tan öğrenir (k = 0,9) ve maliyeti sıfırlar: +100.800 ₺
    expect(s.inSampleSavingTl).toBeCloseTo(100800, 0);
  });

  it("Eğitim penceresinin bir ayı eksikse o ay test edilmez", () => {
    // Şubat yok: Mayıs'ın penceresi (Oca–Nis) eksik; Haziran'ınki (Şub–May) de eksik
    const hourly = [1, 3, 4, 5, 6].flatMap((m) => month(m, 1));
    const r = runBacktest(hourly, DEFAULT_IMBALANCE_PROFILE, { strategies: [volumeRatioStrategy] });
    expect(r.testMonths).toEqual([]);
  });

  it("Bir sonraki ay önerisi son dört aydan öğrenilir", () => {
    const hourly = [1, 2, 3, 4].flatMap((m) => month(m, 1.05));
    const r = runBacktest(hourly, DEFAULT_IMBALANCE_PROFILE, { strategies: [volumeRatioStrategy] });
    expect(r.strategies[0].nextMonthParams).toBe("k = 1,05");
  });

  it("GİP kapatma stratejisi pay × fırsat kadar tasarruf eder ve GİP'siz saatleri atlar", () => {
    // Mayıs: 10 MWh eksik, negatif fiyat 2060, GİP 2000 → saat başı fırsat 600; %25 → 150 ₺
    const hourly = [1, 2, 3, 4].flatMap((m) => month(m, 1)).concat(month(5, 0.9, 2000), month(6, 0.9, null));
    const r = runBacktest(hourly, DEFAULT_IMBALANCE_PROFILE, { strategies: [intradayClosingStrategy(25)] });
    const byMonth = Object.fromEntries(r.strategies[0].months.map((m) => [m.month, m.savingTl]));
    expect(byMonth["2025-05"]).toBeCloseTo(168 * 150, 6);
    expect(byMonth["2025-06"]).toBe(0);
  });

  it("2026 kurallarıyla yeniden fiyatlanan veri daha yüksek baz maliyet üretir (aynı yönde sapma %6)", () => {
    // Sistem açıkta ve santral eksik üretiyor: 2025'te %3, 2026 kurallarında %6
    const deficitMonth = (m: number) =>
      month(m, 0.9).map((h) => ({ ...h, systemDirection: "DEFICIT" as const }));
    const hourly = [1, 2, 3, 4, 5].flatMap(deficitMonth);
    const rule2026 = { ...DEFAULT_IMBALANCE_PROFILE, mode: "CUSTOM" as const };
    const regulatory = runBacktest(hourly, DEFAULT_IMBALANCE_PROFILE, { strategies: [volumeRatioStrategy] });
    const as2026 = runBacktest(hourly, rule2026, { strategies: [volumeRatioStrategy] });
    expect(regulatory.baselineCostTl).toBeCloseTo(168 * 600, 6);
    expect(as2026.baselineCostTl).toBeCloseTo(168 * 1200, 6);
  });

  it("Portföy birleştirmesi santral sonuçlarını strateji ve ay bazında toplar", () => {
    const a = runBacktest([1, 2, 3, 4].flatMap((m) => month(m, 1.1)).concat(month(5, 0.9)), DEFAULT_IMBALANCE_PROFILE, {
      strategies: [volumeRatioStrategy],
    });
    const b = runBacktest([1, 2, 3, 4, 5].flatMap((m) => month(m, 0.9)), DEFAULT_IMBALANCE_PROFILE, {
      strategies: [volumeRatioStrategy],
    });
    const c = combineBacktests([a, b])!;
    expect(c.baselineCostTl).toBeCloseTo(a.baselineCostTl + b.baselineCostTl, 6);
    expect(c.strategies[0].outOfSampleSavingTl).toBeCloseTo(
      a.strategies[0].outOfSampleSavingTl + b.strategies[0].outOfSampleSavingTl,
      6
    );
    expect(c.strategies[0].months[0].savingTl).toBeCloseTo(c.strategies[0].outOfSampleSavingTl, 6);
  });
});
