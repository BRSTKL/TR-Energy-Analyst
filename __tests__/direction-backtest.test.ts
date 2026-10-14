import { describe, it, expect } from "vitest";
import { HOUR_MS, type DirectionHour } from "../lib/analysis/direction-features";
import { runDirectionBacktest, scoreSet } from "../lib/analysis/direction-backtest";
import type { DirectionPrediction } from "../lib/analysis/direction-model";

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 2025-01-01'den itibaren `days` günlük saatler */
function series(days: number, deficit: (date: Date, r: number) => boolean): DirectionHour[] {
  const rand = lcg(42);
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length: days * 24 }, (_, i) => {
    const t = start + i * HOUR_MS;
    const d = deficit(new Date(t), rand());
    return { t, ptf: 2000, smf: d ? 2600 : 1400, deficit: d };
  });
}

describe("runDirectionBacktest", () => {
  // Hafta içi açık, hafta sonu fazla; akşam 18–21 her gün açık; %10 gürültü. Saat iklimi hafta gününü, kalıcılık
  // (iki gün önce) hafta başı ve sonu geçişlerini bilemez; model (saat + gün) ikisini de görür.
  const patterned = series(240, (date, r) => {
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const evening = date.getUTCHours() >= 18 && date.getUTCHours() <= 21;
    const truth = evening || !weekend;
    return r < 0.1 ? !truth : truth;
  });

  for (const infoTime of ["D-1", "H-2"] as const) {
    it(`${infoTime}: öğrenilebilir desende model iki rakibi de yener ve kapıyı geçer`, () => {
      const bt = runDirectionBacktest(patterned, { infoTime });
      expect(bt.gate.testMonths).toBeGreaterThanOrEqual(3);
      expect(bt.total.scores.model.brier).toBeLessThan(bt.total.scores.climatology.brier);
      expect(bt.total.scores.model.brier).toBeLessThan(bt.total.scores.persistence.brier);
      expect(bt.gate.passed).toBe(true);
    });
  }

  it("rastgele veride kapı geçilmez", () => {
    const random = series(240, (_d, r) => r < 0.55);
    const bt = runDirectionBacktest(random, { infoTime: "D-1" });
    expect(bt.gate.testMonths).toBeGreaterThan(0);
    expect(bt.gate.passed).toBe(false);
  });

  it("test ayları yalnız önceki aylarla eğitilir: sonraki ayların verisi değişse önceki ayların tahmini değişmez", () => {
    const bt = runDirectionBacktest(patterned, { infoTime: "D-1" });
    const cutoff = Date.UTC(2025, 5, 1); // Haziran ve sonrası ters çevrilir
    const flipped = patterned.map((h) => (h.t >= cutoff ? { ...h, deficit: !h.deficit, smf: h.ptf * 2 - h.smf } : h));
    const bt2 = runDirectionBacktest(flipped, { infoTime: "D-1" });
    const before = (b: typeof bt) => b.predictions.filter((p) => p.t < cutoff).map((p) => [p.model, p.climatology, p.persistence, p.modelSpread]);
    expect(before(bt).length).toBeGreaterThan(0);
    expect(before(bt2)).toEqual(before(bt));
    // Pencerenin ilk ayı (Ocak) tahmin edilmez: eğitim verisi yok
    expect(bt.months[0].month > "2025-01").toBe(true);
    // fromMonth / toMonth süzgeci
    const sub = runDirectionBacktest(patterned, { infoTime: "D-1", fromMonth: "2025-07", toMonth: "2025-07" });
    expect(sub.months.map((m) => m.month)).toEqual(["2025-07"]);
  });
});

describe("scoreSet", () => {
  it("Brier, isabet ve makas hatasını elle hesaplananla aynı verir", () => {
    const base = { t: 0, month: "2025-01", hour: 0, climatology: 0.5, persistence: 0.5, climatologySpread: 0, persistenceSpread: 0 };
    const preds: DirectionPrediction[] = [
      { ...base, y: 1, spread: 100, model: 0.8, modelSpread: 120 },
      { ...base, y: 0, spread: 50, model: 0.4, modelSpread: 20 },
    ];
    const s = scoreSet(preds, "model");
    expect(s.brier).toBeCloseTo((0.2 ** 2 + 0.4 ** 2) / 2, 12);
    expect(s.accuracy).toBe(1);
    expect(s.spreadMae).toBeCloseTo((20 + 30) / 2, 12);
    expect(scoreSet(preds, "climatology").brier).toBeCloseTo(0.25, 12);
  });
});
