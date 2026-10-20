import { describe, expect, it } from "vitest";
import { buildRampRows, fitRampModel, fitWindQuantiles, rampClimatology, type RampHour } from "@/lib/wind-engine/models/probabilistic";
import { brier } from "@/lib/forecast/zero-price";
import { blendValue, fitBlendWeight, weakForecasters } from "@/lib/wind-engine/models/blend";

const HOUR = 3_600_000;
const CAP = 40;
let s = 17;
const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());

describe("rüzgârda P10 / P50 / P90 (23.6 a)", () => {
  // Hata hız dilimine bağlı: dik bölgede (7–13 m/s) geniş, düşük hızda dar
  const gen = (n: number) =>
    Array.from({ length: n }, () => {
      const ws = 14 * r();
      const pred = Math.min(CAP, CAP * Math.max(0, (ws - 3) / 9) ** 3);
      const sd = ws > 7 && ws < 13 ? 0.15 * CAP : 0.03 * CAP;
      return { pred, ws, actual: Math.min(CAP, Math.max(0, pred + sd * gauss())) };
    });
  const m = fitWindQuantiles(gen(8000), CAP)!;

  it("görmediği veride ≈ %80 kapsar; dik bölgede bant geniş; sınırlar korunur", () => {
    const test = gen(4000);
    const inside = test.filter((t) => t.actual >= m.quantile(t.pred, t.ws, 0.1) && t.actual <= m.quantile(t.pred, t.ws, 0.9)).length / test.length;
    expect(inside).toBeGreaterThan(0.74);
    expect(inside).toBeLessThan(0.88);
    const w = (ws: number) => m.quantile(20, ws, 0.9) - m.quantile(20, ws, 0.1);
    expect(w(10)).toBeGreaterThan(2 * w(5));
    for (const t of test.slice(0, 300)) {
      expect(m.quantile(t.pred, t.ws, 0.1)).toBeGreaterThanOrEqual(0);
      expect(m.quantile(t.pred, t.ws, 0.9)).toBeLessThanOrEqual(CAP);
    }
  });

  it("az satırda kurulmaz; canlı saat eğitime giremez", () => {
    expect(fitWindQuantiles(gen(100), CAP)).toBeNull();
    expect(() => fitWindQuantiles([{ pred: 1, ws: 5, actual: 1, live: true }, ...gen(500)], CAP)).toThrow();
  });
});

describe("rampa olasılığı (23.6 b)", () => {
  // Rampa: tahminin 3 saatlik değişimi büyükse gerçekleşen de büyük değişir (+ zamanlama gürültüsü)
  const series = (days: number, start: number): RampHour[] => {
    const out: RampHour[] = [];
    let level = 0.5;
    for (let i = 0; i < days * 24; i++) {
      if (r() < 0.08) level = r();
      const pred = level * CAP;
      out.push({ t: start + i * HOUR, pred, ws: 3 + 10 * level, spreadMs: 1 + 2 * r(), actual: Math.min(CAP, Math.max(0, pred + 0.08 * CAP * gauss())) });
    }
    return out;
  };
  const train = buildRampRows(series(240, Date.UTC(2025, 0, 1)), CAP);
  const test = buildRampRows(series(60, Date.UTC(2026, 0, 1)), CAP);
  const m = fitRampModel(train)!;

  it("iklim rakibini Brier'de yener; aynı gün dışındaki çift kurulmaz", () => {
    const clim = rampClimatology(train);
    const lab = test.filter((x): x is typeof x & { y: 0 | 1 } => x.y !== null);
    expect(brier(lab.map((x) => ({ p: m.predict(x), y: x.y })))).toBeLessThan(brier(lab.map((x) => ({ p: clim(x.t), y: x.y }))));
    expect(test.every((x) => new Date(x.t).getUTCHours() <= 20)).toBe(true);
  });

  it("aynı veriyle aynı sonuç; canlı saat eğitime giremez", () => {
    expect(fitRampModel(train)!.model.beta).toEqual(m.model.beta);
    const live = buildRampRows([{ t: 0, pred: 1, ws: 5, actual: null, live: true }, { t: 3 * HOUR, pred: 30, ws: 12, actual: null, live: true }], CAP);
    expect(live[0].y).toBeNull();
    expect(() => fitRampModel([...train, ...live])).toThrow();
  });
});

describe("şirket planıyla karışım (23.8)", () => {
  it("zayıf tahmincide model ağırlığı büyük, güçlüde küçük", () => {
    const rows = (kgupSd: number) =>
      Array.from({ length: 2000 }, () => {
        const actual = CAP * r();
        return { actual, pred: actual + 3 * gauss(), kgup: actual + kgupSd * gauss() };
      });
    const weak = fitBlendWeight(rows(10))!;
    const strong = fitBlendWeight(rows(1))!;
    expect(weak.w).toBeGreaterThanOrEqual(0.7);
    expect(strong.w).toBeLessThanOrEqual(0.2);
    expect(weakForecasters([{ id: 1, w: weak.w }, { id: 2, w: strong.w }]).map((p) => p.id)).toEqual([1]);
    expect(fitBlendWeight(rows(1).slice(0, 10))).toBeNull();
    expect(blendValue(0.3, 10, 20)).toBeCloseTo(17, 9);
  });
});
