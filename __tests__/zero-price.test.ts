import { describe, expect, it } from "vitest";
import {
  brier,
  buildZeroPriceRows,
  curtailedForecast,
  curtailmentRate,
  fitZeroPrice,
  MIN_ZERO_PRICE_ROWS,
  ZERO_PRICE_FEATURES,
  zeroPriceClimatology,
  zeroPricePersistence,
} from "@/lib/forecast/zero-price";
import { dayKind, hasReligiousCalendar, isHolidayHour } from "@/lib/forecast/tr-holidays";
import { decisionCutoff, marketFeature, ptfAvailableAt } from "@/lib/forecast/info-time";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const start = Date.UTC(2025, 0, 1);

// Tohumlu sözde rastgele (Park–Miller)
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Bilinen yapı: Nisan–Mayıs öğle saatlerinde (10–15) hafta sonu ya da tatilde sıfır fiyat olasılığı yüksek; ayrıca
// "rejim" günleri kalıcı (dün sıfırsa bugün de sıfır olma eğilimi). Diğer saatlerde fiyat 2.000–3.500 TL.
function synthPtf(days: number, seed = 7): Map<number, number> {
  const r = rng(seed);
  const ptf = new Map<number, number>();
  let regime = false;
  for (let d = 0; d < days; d++) {
    const day = start + d * DAY;
    const date = new Date(day);
    const m = date.getUTCMonth();
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const spring = m === 3 || m === 4;
    regime = spring && (regime ? r() < 0.7 : r() < 0.15);
    for (let h = 0; h < 24; h++) {
      const t = day + h * HOUR;
      const noon = h >= 10 && h <= 15;
      const pz = noon ? (spring ? (weekend || isHolidayHour(t) ? 0.85 : regime ? 0.6 : 0.05) : 0.01) : 0;
      ptf.set(t, r() < pz ? 0 : 2000 + 1500 * r());
    }
  }
  return ptf;
}

const ptf = synthPtf(2 * 365);
const allHours = Array.from(ptf.keys()).sort((a, b) => a - b);
const trainEnd = Date.UTC(2026, 0, 1);
const train = buildZeroPriceRows(
  allHours.filter((t) => t < trainEnd),
  ptf
);
const test = buildZeroPriceRows(
  allHours.filter((t) => t >= trainEnd),
  ptf
);

describe("tatil takvimi", () => {
  it("sabit ve dinî tatiller, arife yarım gün", () => {
    expect(dayKind(Date.UTC(2026, 9, 29, 10))).toBe("holiday");
    expect(dayKind(Date.UTC(2026, 9, 28, 10))).toBe("half");
    expect(dayKind(Date.UTC(2026, 2, 20, 10))).toBe("holiday"); // Ramazan Bayramı 1. gün
    expect(dayKind(Date.UTC(2026, 4, 30, 10))).toBe("holiday"); // Kurban Bayramı 4. gün
    expect(dayKind(Date.UTC(2026, 4, 31, 10))).toBe("normal");
    expect(isHolidayHour(Date.UTC(2026, 4, 26, 12))).toBe(false); // arife sabahı
    expect(isHolidayHour(Date.UTC(2026, 4, 26, 14))).toBe(true); // arife öğleden sonra
    expect(hasReligiousCalendar(2026)).toBe(true);
    expect(hasReligiousCalendar(2030)).toBe(false);
  });
});

describe("sıfır fiyat olasılığı (22.6 a)", () => {
  const m = fitZeroPrice(train)!;

  it("bilinen yapıyı geri bulur ve iklim rakibini Brier'de yener", () => {
    expect(m).not.toBeNull();
    expect(train[0].x.length).toBe(ZERO_PRICE_FEATURES.length);
    const clim = zeroPriceClimatology(train);
    const labeled = test.filter((r) => r.y !== null) as Array<(typeof test)[number] & { y: 0 | 1 }>;
    const bModel = brier(labeled.map((r) => ({ p: m.predict(r), y: r.y })));
    const bClim = brier(labeled.map((r) => ({ p: clim(r.t), y: r.y })));
    expect(bModel).toBeLessThan(bClim);
    const pers = zeroPricePersistence(train);
    expect(bModel).toBeLessThan(brier(labeled.map((r) => ({ p: pers(r), y: r.y }))));
    // Nisan pazar öğlesi ≫ Nisan salı öğlesi ≫ Temmuz öğlesi
    const at = (t: number) => m.predict(test.find((r) => r.t === t)!);
    const sunday = Date.UTC(2026, 3, 12, 12);
    const tuesday = Date.UTC(2026, 3, 14, 12);
    const july = Date.UTC(2026, 6, 12, 12);
    expect(at(sunday)).toBeGreaterThan(at(tuesday));
    expect(at(tuesday)).toBeGreaterThan(at(july));
    for (const r of test) {
      const p = m.predict(r);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("aynı veriyle aynı sonucu verir", () => {
    const m2 = fitZeroPrice(buildZeroPriceRows(allHours.filter((t) => t < trainEnd), synthPtf(2 * 365)))!;
    expect(m2.model.beta).toEqual(m.model.beta);
  });

  it("canlı ya da etiketsiz saat eğitime giremez; az satırda kurulmaz", () => {
    const live = buildZeroPriceRows([trainEnd + 12 * HOUR], ptf, { liveFrom: trainEnd });
    expect(live[0].live).toBe(true);
    expect(live[0].y).toBeNull();
    expect(() => fitZeroPrice([...train, ...live])).toThrow();
    expect(fitZeroPrice(train.slice(0, MIN_ZERO_PRICE_ROWS - 1))).toBeNull();
  });

  it("hedef günün fiyatı özelliklere sızmaz; D-1 fiyatı kesimden önce bilinir", () => {
    const t = Date.UTC(2025, 3, 13, 12);
    const changed = new Map(ptf);
    for (let h = 0; h < 24; h++) changed.set(Math.floor(t / DAY) * DAY + h * HOUR, 99_999);
    const a = buildZeroPriceRows([t], ptf)[0];
    const b = buildZeroPriceRows([t], changed)[0];
    expect(b.x).toEqual(a.x);
    expect(ptfAvailableAt(t - DAY)).toBeLessThanOrEqual(decisionCutoff(t));
    expect(ptfAvailableAt(t)).toBeGreaterThan(decisionCutoff(t));
    expect(marketFeature("x", t).source).toBe("market");
  });

  it("dünün fiyatı yoksa satır kurulmaz; ek özellik null ise satır kurulmaz", () => {
    expect(buildZeroPriceRows([start + 5 * HOUR], ptf)).toHaveLength(0);
    const t = Date.UTC(2025, 5, 1, 12);
    expect(buildZeroPriceRows([t], ptf, { extra: () => null })).toHaveLength(0);
    expect(buildZeroPriceRows([t], ptf, { extra: () => [0.5] })[0].x).toHaveLength(ZERO_PRICE_FEATURES.length + 1);
  });
});

describe("kısma oranı ve beklenen kısıntı (22.6 b, c)", () => {
  it("santralin sıfır fiyatta kısma oranını bulur, az saatte sıfıra büzülür", () => {
    // 200 sıfır fiyatlı saat, beklenen 10 MWh, gerçekleşen 4 MWh → ham oran 0,6
    const hours = Array.from({ length: 200 }, (_, i) => ({ t: i * HOUR, ptf: 0, uevm: 4, expected: 10 }));
    const many = curtailmentRate([...hours, { t: 0, ptf: 3000, uevm: 0, expected: 10 }]);
    expect(many.raw).toBeCloseTo(0.6, 6);
    expect(many.rate).toBeCloseTo((0.6 * 200) / 220, 6);
    const few = curtailmentRate(hours.slice(0, 5));
    expect(few.rate).toBeLessThan(0.2);
    expect(curtailmentRate([]).rate).toBe(0);
    // Gerçekleşen beklenenden fazlaysa kayıp yok; oran [0, 1]
    expect(curtailmentRate(hours.map((h) => ({ ...h, uevm: 15 }))).rate).toBe(0);
    expect(curtailmentRate(hours.map((h) => ({ ...h, uevm: -5 }))).rate).toBeLessThanOrEqual(1);
  });

  it("beklenen kısıntı tahmini eksiye ve tahminin üstüne çıkarmaz", () => {
    expect(curtailedForecast(10, 0.5, 0.8)).toBeCloseTo(6, 9);
    expect(curtailedForecast(10, 2, 2)).toBe(0);
    expect(curtailedForecast(10, -1, 0.5)).toBe(10);
    expect(curtailedForecast(0, 0.9, 0.9)).toBe(0);
  });
});
