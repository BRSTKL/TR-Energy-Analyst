import { describe, expect, it } from "vitest";
import { chooseBidQuantile, fitResidualQuantiles } from "@/lib/solar-engine/models/quantiles";

// Tohumlu: gerçekleşen = tahmin + gürültü; gürültü yüksek düzeyde daha geniş
let s = 11;
const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
const cap = 10;
const rows = Array.from({ length: 6000 }, () => {
  const pred = r() * cap;
  const width = pred > 6 ? 2 : 0.5;
  return { pred, actual: Math.max(0, pred + (r() - 0.5) * 2 * width) };
});

describe("olasılıksal tahmin", () => {
  const m = fitResidualQuantiles(rows, cap)!;

  it("P10–P90 bandı görmediği veride ≈ %80'i kapsar; geniş belirsizlikte bant geniş", () => {
    s = 99;
    const test = Array.from({ length: 4000 }, () => {
      const pred = 0.5 + r() * 9;
      const width = pred > 6 ? 2 : 0.5;
      return { pred, actual: Math.max(0, pred + (r() - 0.5) * 2 * width) };
    });
    const inBand = test.filter((t) => t.actual >= m.quantile(t.pred, 0.1) && t.actual <= m.quantile(t.pred, 0.9)).length / test.length;
    expect(inBand).toBeGreaterThan(0.75);
    expect(inBand).toBeLessThan(0.85);
    expect(m.quantile(7, 0.9) - m.quantile(7, 0.1)).toBeGreaterThan(2 * (m.quantile(3, 0.9) - m.quantile(3, 0.1)));
  });

  it("çeyreklikler sıralı, eksi ve tavan üstü yok; az satırda kurulmaz", () => {
    for (const p of [0.5, 3, 9.9]) {
      const v = [0.1, 0.5, 0.9].map((q) => m.quantile(p, q));
      expect(v[0]).toBeLessThanOrEqual(v[1]);
      expect(v[1]).toBeLessThanOrEqual(v[2]);
      expect(v[0]).toBeGreaterThanOrEqual(0);
      expect(v[2]).toBeLessThanOrEqual(cap);
    }
    expect(fitResidualQuantiles(rows.slice(0, 100), cap)).toBeNull();
  });

  it("teklif çeyrekliği: en ucuzu; eşitlikte 0,5'e en yakını", () => {
    expect(chooseBidQuantile((q) => (q - 0.4) ** 2).q).toBe(0.4);
    expect(chooseBidQuantile(() => 1).q).toBe(0.5);
  });
});
