import { describe, it, expect } from "vitest";
import { evaluateForecasts } from "@/lib/forecast/production-backtest";
import type { MarketPriceRecord } from "@/lib/calculations/types";

const H = 3_600_000;
const t0 = Date.UTC(2025, 5, 1, 12);
const market = new Map<number, MarketPriceRecord>(
  [0, 1, 2].map((i) => [t0 + i * H, { timestamp: new Date(t0 + i * H), ptf: 2000, smf: 2500, systemDirection: "DEFICIT", imbalancePosPrice: null, imbalanceNegPrice: null }])
);
const hours = [
  { t: t0, uevm: 10, ptf: 2000 },
  { t: t0 + H, uevm: 10, ptf: 2000 },
  { t: t0 + 2 * H, uevm: 10, ptf: 2000 },
  { t: t0 + 3 * H, uevm: 10, ptf: 2000 }, // piyasa fiyatı yok: sayılmaz
];

describe("Üretim tahmini maliyet kıyası (15.5)", () => {
  it("kusursuz tahmin 0 maliyet; sapan tahmin dönemin kuralıyla pozitif maliyet ve KÜPST; eşleştirilmiş saatler", () => {
    const r = evaluateForecasts(
      hours,
      {
        kusursuz: (h) => h.uevm,
        fazla: (h) => h.uevm! + 2,
        eksik: (h) => (h.t === t0 + 2 * H ? null : h.uevm! - 2), // bir saatte tahmin yok: o saat hiçbir adayda sayılmaz
      },
      market,
      "GES"
    );
    expect(r.kusursuz.hours).toBe(2);
    expect(r.fazla.hours).toBe(2);
    expect(r.kusursuz.totalTl).toBe(0);
    expect(r.fazla.imbalanceCostTl).toBeGreaterThan(0);
    expect(r.fazla.maeMwh).toBe(2);
    expect(r.fazla.maePct).toBeCloseTo(20, 9);
    expect(r.fazla.biasMwh).toBe(2);
    expect(r.eksik.biasMwh).toBe(-2);
    // Sistem açıkken eksik üretim (tahmin > gerçek) pahalı; 2025: negatif fiyat max(PTF, SMF) × 1,03
    expect(r.fazla.imbalanceCostTl).toBeCloseTo(2 * 2 * (2500 * 1.03 - 2000), 6);
    expect(Object.values(r.fazla.daily).reduce((a, b) => a + b, 0)).toBeCloseTo(r.fazla.totalTl, 6);
  });

  it("süzgeç: koşulu sağlamayan saatler sayılmaz", () => {
    const r = evaluateForecasts(hours, { a: (h) => h.uevm }, market, "GES", (h) => h.t !== t0);
    expect(r.a.hours).toBe(2);
  });
});
