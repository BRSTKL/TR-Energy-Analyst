import { describe, expect, it } from "vitest";
import { fitGbm } from "@/lib/solar-engine/models/gbm";

// Tohumlu veri: y = 2·[x0 > 0,5] + x1² + gürültü; x2 ilgisiz
let s = 7;
const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const make = (n: number) => {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = [r(), r(), r()];
    X.push(x);
    y.push(2 * (x[0] > 0.5 ? 1 : 0) + x[1] * x[1] + (r() - 0.5) * 0.2);
  }
  return { X, y };
};

describe("gradient boosting", () => {
  const train = make(3000);
  const test = make(1000);
  const m = fitGbm(train.X, train.y, { trees: 200, depth: 3, learningRate: 0.1, minLeaf: 20 });
  const mae = (f: (x: number[]) => number) => test.X.reduce((a, x, i) => a + Math.abs(f(x) - test.y[i]), 0) / test.X.length;

  it("görmediği veride ortalamadan çok iyi; eşik ve eğriyi öğrenir", () => {
    expect(mae(m.predict)).toBeLessThan(0.15);
    expect(mae(() => m.base)).toBeGreaterThan(0.8);
    expect(m.predict([0.9, 0, 0.5]) - m.predict([0.1, 0, 0.5])).toBeGreaterThan(1.6);
  });

  it("aynı veri ve tohumla aynı model; ilgisiz özellik etkisiz", () => {
    const m2 = fitGbm(train.X, train.y, { trees: 200, depth: 3, learningRate: 0.1, minLeaf: 20 });
    expect(m2.predict([0.3, 0.6, 0.2])).toBe(m.predict([0.3, 0.6, 0.2]));
    expect(Math.abs(m.predict([0.3, 0.6, 0.05]) - m.predict([0.3, 0.6, 0.95]))).toBeLessThan(0.1);
  });

  it("aykırı değerler (Huber) modeli sürüklemez", () => {
    const y = train.y.map((v, i) => (i % 50 === 0 ? v - 30 : v));
    const robust = fitGbm(train.X, y, { trees: 200, depth: 3, learningRate: 0.1, minLeaf: 20 });
    expect(mae(robust.predict)).toBeLessThan(0.3);
  });
});
