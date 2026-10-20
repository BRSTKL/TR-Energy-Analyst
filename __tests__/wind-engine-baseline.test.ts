import { describe, expect, it } from "vitest";
import { airDensity, densityAdjustedSpeed, extrapolateSpeed, RHO_STANDARD, shearExponent, stationPressure } from "@/lib/wind-engine/physics/air-density";
import { fitWindBaseline, hourDensity, type WindEngineHour } from "@/lib/wind-engine/models/baseline";
import { fitWindForecast } from "@/lib/forecast/wind-forecast";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CAP = 50;

describe("rüzgâr fiziği", () => {
  it("standart atmosferde yoğunluk ≈ 1,225; soğuk hava yoğun; geçersiz girdide null", () => {
    expect(airDensity(15, 1013.25)).toBeCloseTo(RHO_STANDARD, 2);
    expect(airDensity(-10, 1013.25)!).toBeGreaterThan(airDensity(30, 1013.25)!);
    expect(airDensity(null, 1000)).toBeNull();
    expect(airDensity(10, 0)).toBeNull();
  });

  it("1.000 m rakımda basınç ≈ 899 hPa; eşdeğer hız küp kök oranıyla", () => {
    expect(stationPressure(1013.25, 1000, 8.5)).toBeGreaterThan(895);
    expect(stationPressure(1013.25, 1000, 8.5)).toBeLessThan(903);
    expect(densityAdjustedSpeed(10, RHO_STANDARD)).toBeCloseTo(10, 9);
    expect(densityAdjustedSpeed(10, RHO_STANDARD * 0.8)).toBeCloseTo(10 * Math.cbrt(0.8), 9);
    expect(densityAdjustedSpeed(10, null)).toBe(10);
  });

  it("kesme üssü ve yükseklik taşıması birbirinin tersi", () => {
    const a = shearExponent(5, 10, 7, 100)!;
    expect(extrapolateSpeed(5, 10, 100, a)).toBeCloseTo(7, 9);
    expect(shearExponent(0.2, 10, 7, 100)).toBeNull();
  });
});

// Sentetik santral: gerçek güç eşdeğer hızın (yoğunlukla) fonksiyonu; yoğunluk mevsimle ±%8 değişir
function powerOf(wsEq: number) {
  if (wsEq < 3 || wsEq > 25) return 0;
  return Math.min(CAP, CAP * ((wsEq - 3) / 9) ** 3);
}
function synth(days: number, startT: number, seed: number): WindEngineHour[] {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: WindEngineHour[] = [];
  for (let i = 0; i < days * 24; i++) {
    const t = startT + i * HOUR;
    const doy = (t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / DAY;
    const temp = 15 - 15 * Math.cos((2 * Math.PI * (doy - 15)) / 365);
    const pressure = 1013 + 6 * (r() - 0.5);
    const ws = 2 + 12 * r();
    const dir = 360 * r();
    const rho = airDensity(temp, pressure)!;
    out.push({
      t,
      uevm: powerOf(densityAdjustedSpeed(ws, rho)),
      kgupFirst: null,
      ptf: 2000,
      ws: { d1: ws, d2: ws },
      dir: { d1: dir, d2: dir },
      temp: { d1: temp, d2: temp },
      pressure: { d1: pressure, d2: pressure },
    });
  }
  return out;
}

describe("temel sürüm: güç eğrisi + yoğunluk (23.2)", () => {
  // Gerçek akıştaki gibi: eğitim test ayından 1 gün önce biter (D-2 üretimi D-1 12:00'da elde)
  const testStart = Date.UTC(2026, 0, 1);
  const trainingEnd = testStart - DAY;
  const train = synth(365, Date.UTC(2025, 0, 1), 3).filter((h) => h.t < trainingEnd);
  const test = synth(120, testStart, 5);
  const mae = (f: (h: WindEngineHour) => number | null) => {
    let e = 0;
    for (const h of test) e += Math.abs((f(h) ?? 0) - h.uevm!);
    return e;
  };

  it("yoğunluksuz sürüm mevcut eğriyle birebir aynı", () => {
    const base = fitWindBaseline(train, CAP, { lead: "d2", trainingEnd, density: false });
    const old = fitWindForecast(train, CAP, { lead: "d2", trainingEnd });
    for (const h of test.slice(0, 300)) expect(base.predict(h)).toBe(old.predict(h));
  });

  it("yoğunluğun bilinen etkisini geri bulur; aynı veriyle aynı sonuç; sınırlar korunur", () => {
    const withRho = fitWindBaseline(train, CAP, { lead: "d2", trainingEnd, density: true });
    const without = fitWindBaseline(train, CAP, { lead: "d2", trainingEnd, density: false });
    expect(mae(withRho.predict)).toBeLessThan(mae(without.predict));
    const again = fitWindBaseline(train, CAP, { lead: "d2", trainingEnd, density: true });
    for (const h of test.slice(0, 200)) expect(again.predict(h)).toBe(withRho.predict(h));
    for (const h of test) {
      const p = withRho.predict(h);
      if (p === null) continue;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(CAP);
    }
  });

  it("eğitimde kesimden sonraki saat ve kesim sonrası (d1) hava hata verir", () => {
    expect(() => fitWindBaseline([...train, ...synth(1, trainingEnd, 9)], CAP, { lead: "d2", trainingEnd, density: true })).toThrow();
    expect(() => fitWindBaseline(train, CAP, { lead: "d1", trainingEnd, density: true })).toThrow();
  });

  it("yüzey basıncı yoksa deniz seviyesi basıncı ve rakımla; ikisi de yoksa null", () => {
    const h = { ...test[0], pressure: undefined, msl: { d1: 1013, d2: 1013 } };
    expect(hourDensity(h, "d2", 1000)).toBeLessThan(hourDensity(h, "d2", 0)!);
    expect(hourDensity(h, "d2", null)).toBeNull();
  });
});
