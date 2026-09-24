import { describe, it, expect } from "vitest";
import { processHourlyRecord } from "../lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, HourlyResult } from "../lib/calculations/types";
import { persistenceTradeGain } from "../lib/analysis/intraday-arbitrage";
import { persistenceStrategy, runBacktest } from "../lib/analysis/backtest";

// 2025 (sabit %3), sistem dengede, PTF = SMF = GİP = 2000: pozitif fiyat 1940, negatif fiyat 2060
const hour = (ts: string, forecast: number, actual: number, extra: Partial<HourlyResult> = {}): HourlyResult => ({
  ...processHourlyRecord(
    { timestamp: ts, forecastMwh: forecast, actualMwh: actual },
    { timestamp: ts, ptf: 2000, smf: 2000, systemDirection: "BALANCED" },
    DEFAULT_IMBALANCE_PROFILE
  ),
  gipPrice: 2000,
  gipVolumeMwh: 1000,
  ...extra,
});

describe("Gün içi kalıcılık kuralı", () => {
  it("Hata sürerse kazanç: 5 MWh 1.940 yerine 2.000'den satılır → +300 ₺", () => {
    const h = hour("2025-03-01T11:00:00Z", 50, 60);
    const r = persistenceTradeGain(h, { forecastMwh: 50, actualMwh: 60 }, 0.5, DEFAULT_IMBALANCE_PROFILE);
    expect(r.tradeMwh).toBe(5);
    expect(r.gainTl).toBeCloseTo(300, 6);
  });

  it("Hata yön değiştirirse zarar: satılan 5 MWh eksiği büyütür → −300 ₺", () => {
    const h = hour("2025-03-01T11:00:00Z", 50, 40);
    const r = persistenceTradeGain(h, { forecastMwh: 50, actualMwh: 60 }, 0.5, DEFAULT_IMBALANCE_PROFILE);
    expect(r.gainTl).toBeCloseTo(-300, 6);
  });

  it("İşlem miktarı saatlik GİP hacminin sınırını aşamaz", () => {
    const h = hour("2025-03-01T11:00:00Z", 50, 60, { gipVolumeMwh: 20 });
    const r = persistenceTradeGain(h, { forecastMwh: 50, actualMwh: 60 }, 1, DEFAULT_IMBALANCE_PROFILE);
    expect(r.tradeMwh).toBe(2); // %10 × 20 MWh
  });

  // Ocak–Mayıs 2025, her ayın ilk 7 günü, her saat. Mayıs test ayı.
  const series = (errorAt: (i: number) => number) => {
    const rows: HourlyResult[] = [];
    let i = 0;
    for (let m = 1; m <= 5; m++)
      for (let d = 1; d <= 7; d++)
        for (let h = 0; h < 24; h++) {
          const ts = `2025-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00Z`;
          rows.push(hour(ts, 50, 50 + errorAt(i++)));
        }
    return rows;
  };

  it("Hata sürekli aynı yöndeyse geçmişten yüksek oran öğrenilir ve test ayında kazandırır", () => {
    const r = runBacktest(series(() => 10), DEFAULT_IMBALANCE_PROFILE, { strategies: [persistenceStrategy(1)] });
    const s = r.strategies[0];
    expect(r.testMonths).toEqual(["2025-05"]);
    expect(s.months[0].params).toBe("%100 kapat");
    expect(s.outOfSampleSavingTl).toBeGreaterThan(0);
  });

  it("Hata her saat yön değiştiriyorsa kural zarar ettirir; öğrenilen karar 'işlem yok' olur", () => {
    const r = runBacktest(series((i) => (i % 2 === 0 ? 10 : -10)), DEFAULT_IMBALANCE_PROFILE, {
      strategies: [persistenceStrategy(1)],
    });
    const s = r.strategies[0];
    expect(s.months[0].params).toBe("işlem yok");
    expect(s.outOfSampleSavingTl).toBeCloseTo(0, 6);
  });
});
