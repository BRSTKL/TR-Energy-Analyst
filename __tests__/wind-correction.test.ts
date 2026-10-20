import { describe, expect, it } from "vitest";
import { fitWindCorrection, MIN_WIND_CORRECTION_ROWS, windRecentError, type WindCorrectionInput } from "@/lib/wind-engine/models/correction";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CAP = 50;
let s = 23;
const r = () => (s = (s * 16807) % 2147483647) / 2147483647;

// Bilinen sistematik hata: gece kararlı katmanda (kesme üssü büyük) model %25 fazla tahmin ediyor
function rows(days: number, start: number) {
  const out: Array<WindCorrectionInput & { actual: number }> = [];
  for (let i = 0; i < days * 24; i++) {
    const t = start + i * HOUR;
    const night = new Date(t).getUTCHours() < 6 || new Date(t).getUTCHours() > 19;
    const ws = 3 + 11 * r();
    const alpha = night ? 0.4 : 0.1;
    const pred = Math.min(CAP, CAP * Math.max(0, (ws - 3) / 9) ** 3);
    out.push({ t, pred, pred3: null, pred6: null, ws, dir: 360 * r(), ws10: ws * Math.pow(0.1, alpha), temp: 15, recent: null, actual: night ? pred * 0.75 : pred });
  }
  return out;
}

describe("rüzgârda öğrenen düzeltme (23.5)", () => {
  const train = rows(150, Date.UTC(2025, 3, 1));
  const test = rows(30, Date.UTC(2025, 9, 1));
  const m = fitWindCorrection(train, CAP)!;
  const err = (f: (x: (typeof test)[number]) => number) => test.reduce((a, x) => a + Math.abs(f(x) - x.actual), 0);

  it("kararlılığa bağlı sistematik hatayı öğrenir; sınırlar korunur", () => {
    expect(m).not.toBeNull();
    expect(err((x) => m.apply(x))).toBeLessThan(err((x) => x.pred) * 0.5);
    for (const x of test.slice(0, 500)) {
      const v = m.apply(x);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(CAP);
    }
  });

  it("aynı veriyle aynı sonuç; az satırda kurulmaz; canlı saat eğitime giremez", () => {
    const m2 = fitWindCorrection(train, CAP)!;
    for (const x of test.slice(0, 100)) expect(m2.apply(x)).toBe(m.apply(x));
    expect(fitWindCorrection(train.slice(0, MIN_WIND_CORRECTION_ROWS - 1), CAP)).toBeNull();
    expect(() => fitWindCorrection([{ ...train[0], live: true }, ...train], CAP)).toThrow();
  });

  it("son günlerin hatası D-9 … D-3 penceresinden", () => {
    const t = Date.UTC(2025, 5, 20, 12);
    const series = new Map<number, { pred: number; actual: number }>();
    for (let k = 1; k <= 12; k++) for (let h = 0; h < 24; h++) series.set(Math.floor(t / DAY) * DAY - k * DAY + h * HOUR, { pred: 10, actual: k <= 2 ? 50 : 15 });
    expect(windRecentError(t, series, CAP)).toBeCloseTo(0.1, 9); // D-1, D-2 (50) pencere dışında
    // D-3 içeride, D-10 dışarıda (en az 48 saat gerekir: iki gün)
    const d0 = Math.floor(t / DAY) * DAY;
    const days = (...ks: number[]) => new Map(ks.flatMap((k) => Array.from({ length: 24 }, (_, h) => [d0 - k * DAY + h * HOUR, { pred: 10, actual: 20 }] as const)));
    expect(windRecentError(t, days(3, 4), CAP)).toBeCloseTo(0.2, 9);
    expect(windRecentError(t, days(10, 11), CAP)).toBeNull();
    expect(windRecentError(t, days(2, 1), CAP)).toBeNull();
  });
});
