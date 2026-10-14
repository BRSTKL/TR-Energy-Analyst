import { describe, it, expect } from "vitest";
import { fitLogistic, fitRidge, predictLogistic, predictRidge, solveSpd } from "../lib/analysis/direction-model";

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("solveSpd", () => {
  it("küçük simetrik sistemi çözer", () => {
    // [4 2; 2 3] x = [2; 1] → x = [0,5; 0]
    const x = solveSpd(
      [
        [4, 2],
        [2, 3],
      ],
      [2, 1]
    );
    expect(x[0]).toBeCloseTo(0.5, 10);
    expect(x[1]).toBeCloseTo(0, 10);
  });
});

describe("fitLogistic", () => {
  it("gerçek olasılık modelini yakalar", () => {
    // P(y = 1) = sigmoid(2·x1 − 1)
    const rand = lcg(3);
    const xs: number[][] = [];
    const ys: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const x1 = rand() * 4 - 2;
      xs.push([x1, rand()]);
      ys.push(rand() < 1 / (1 + Math.exp(-(2 * x1 - 1))) ? 1 : 0);
    }
    const m = fitLogistic(xs, ys, 0.01);
    for (const x1 of [-1.5, 0, 0.5, 1.5]) {
      expect(predictLogistic(m, [x1, 0.5])).toBeCloseTo(1 / (1 + Math.exp(-(2 * x1 - 1))), 1);
    }
  });

  it("ayrılabilir veride sonlu kalır (düzenleme)", () => {
    const xs = [[-1], [-0.5], [0.5], [1]];
    const m = fitLogistic(xs, [0, 0, 1, 1], 1);
    expect(predictLogistic(m, [1])).toBeGreaterThan(0.5);
    expect(predictLogistic(m, [-1])).toBeLessThan(0.5);
    expect(m.beta.every(Number.isFinite)).toBe(true);
  });
});

describe("fitRidge", () => {
  it("doğrusal ilişkiyi yakalar", () => {
    const rand = lcg(11);
    const xs: number[][] = [];
    const ys: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const a = rand() * 10;
      const b = rand();
      xs.push([a, b]);
      ys.push(3 + 2 * a - b + (rand() - 0.5) * 0.01);
    }
    const m = fitRidge(xs, ys, 0.001);
    expect(predictRidge(m, [5, 0.5])).toBeCloseTo(3 + 10 - 0.5, 1);
  });
});
