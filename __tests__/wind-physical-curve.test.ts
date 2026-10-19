import { describe, expect, it } from "vitest";
import { curvePower, CUT_OUT, fitPhysicalCurve, hubSpeed } from "@/lib/wind-engine/models/physical-curve";
import type { WindEngineHour } from "@/lib/wind-engine/models/baseline";
import { fitWindForecast } from "@/lib/forecast/wind-forecast";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CAP = 30;
// Gerçek santral: v_ci 3, v_r 11, tavan 27 (bir türbin bakımda), göbek 120 m; doğudan (90°) esen rüzgârı arazi %15 hızlandırır
const TRUE = { ceiling: 27, vCutIn: 3, vRated: 11 };

function synth(days: number, startT: number, seed: number): WindEngineHour[] {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: WindEngineHour[] = [];
  for (let i = 0; i < days * 24; i++) {
    const t = startT + i * HOUR;
    const ws100 = 1 + 15 * r();
    const night = new Date(t).getUTCHours() < 6 || new Date(t).getUTCHours() > 19;
    const alpha = night ? 0.35 : 0.1;
    const ws10 = ws100 * Math.pow(10 / 100, alpha);
    const dir = 360 * r();
    const terrain = Math.abs(dir - 90) < 22.5 ? 1.15 : 1;
    const hub = ws100 * Math.pow(120 / 100, alpha) * terrain;
    out.push({ t, uevm: curvePower(hub, TRUE) * (0.95 + 0.1 * r()), kgupFirst: null, ptf: 2000, ws: { d1: null, d2: ws100 }, dir: { d1: null, d2: dir }, ws10: { d1: null, d2: ws10 } });
  }
  return out;
}

describe("fiziksel güç eğrisi (23.3)", () => {
  const testStart = Date.UTC(2026, 0, 1);
  const trainingEnd = testStart - DAY;
  const train = synth(150, Date.UTC(2025, 7, 1), 5).filter((h) => h.t < trainingEnd);
  const test = synth(40, testStart, 9);
  const m = fitPhysicalCurve(train, CAP, { trainingEnd });
  const err = (f: (h: WindEngineHour) => number | null) => test.reduce((a, h) => a + Math.abs((f(h) ?? 0) - h.uevm!), 0);

  it("bilinen eğriyi, göbek yüksekliğini ve yön etkisini geri bulur; medyan eğriden iyi", () => {
    expect(m.params.hubM).toBe(120);
    expect(m.params.vCutIn).toBeGreaterThanOrEqual(2.5);
    expect(m.params.vCutIn).toBeLessThanOrEqual(3.5);
    expect(m.params.vRated).toBeGreaterThanOrEqual(10);
    expect(m.params.vRated).toBeLessThanOrEqual(12);
    expect(m.params.ceiling).toBeLessThanOrEqual(CAP);
    expect(m.params.sectorK[2]).toBeGreaterThan(1.05); // doğu dilimi
    const median = fitWindForecast(train, CAP, { lead: "d2", trainingEnd });
    expect(err(m.predict)).toBeLessThan(err(median.predict));
  });

  it("aynı veriyle aynı sonuç; sınırlar korunur", () => {
    const m2 = fitPhysicalCurve(train, CAP, { trainingEnd });
    expect(m2.params).toEqual(m.params);
    for (const h of test) {
      const p = m.predict(h)!;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(CAP);
    }
  });

  it("durma: 25 m/s üstünde 0, hız 22'nin altına inene kadar 0 kalır", () => {
    const base = test[0];
    const at = (k: number, ws: number): WindEngineHour => ({ ...base, t: base.t + k * HOUR, ws: { d1: null, d2: ws }, ws10: { d1: null, d2: null }, dir: { d1: null, d2: 200 } });
    const series = m.predictSeries([at(0, 15), at(1, CUT_OUT + 2), at(2, 23), at(3, 15)]);
    expect(series[0]).toBeGreaterThan(0);
    expect(series[1]).toBe(0);
    expect(series[2]).toBe(0);
    expect(series[3]).toBeGreaterThan(0);
  });

  it("eğitimde kesimden sonraki üretim hata verir; göbek taşıma 100 m'de aynen", () => {
    expect(() => fitPhysicalCurve([...train, ...synth(1, trainingEnd, 3)], CAP, { trainingEnd })).toThrow();
    expect(hubSpeed(8, 5, 100)).toBe(8);
    expect(hubSpeed(8, null, 120)).toBeCloseTo(8 * Math.pow(1.2, 1 / 7), 9);
  });
});
