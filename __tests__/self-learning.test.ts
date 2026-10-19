import { describe, expect, it } from "vitest";
import { BASE_MODEL, BIAS_INSAMPLE_MODEL, BIAS_MAX, BIAS_MIN, LIVE_SERIES, MIN_COMMON_DAYS, applyBias, biasFactors, comparePair, reviewChampion } from "@/lib/solar-engine/learning/self-learning";

const T = (d: number, h: number) => Date.UTC(2026, 9, d, h);
const days = (n: number, f: (i: number) => number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`2026-10-${String(i + 1).padStart(2, "0")}`, f(i)]));

describe("günlük hata düzeltmesi", () => {
  it("öğle saatinde sürekli %10 fazla tahmin: çarpan 1'in altında, az veride 1'e yakın", () => {
    const many = Array.from({ length: 30 }, (_, d) => ({ t: T(d + 1, 12), forecast: 110, actual: 100 }));
    const f = biasFactors(many)[12];
    expect(f).toBeLessThan(0.95);
    expect(f).toBeGreaterThan(100 / 110 - 0.01);
    const few = biasFactors(many.slice(0, 2))[12];
    expect(few).toBeGreaterThan(f);
    expect(few).toBeLessThan(1);
    // Örnek olmayan saat 1
    expect(biasFactors(many)[9]).toBe(1);
  });

  it("sınırlar ve gece saatleri: aşırı oran kırpılır, sıfıra yakın tahmin sayılmaz", () => {
    const s = [
      ...Array.from({ length: 50 }, (_, d) => ({ t: T((d % 28) + 1, 12), forecast: 100, actual: 300 })),
      ...Array.from({ length: 50 }, (_, d) => ({ t: T((d % 28) + 1, 6), forecast: 1, actual: 20 })),
    ];
    const f = biasFactors(s);
    expect(f[12]).toBe(BIAS_MAX);
    expect(f[6]).toBe(1);
    expect(biasFactors(Array.from({ length: 50 }, (_, d) => ({ t: T((d % 28) + 1, 12), forecast: 100, actual: 0 })))[12]).toBe(BIAS_MIN);
    expect(applyBias([null, 10], [1, 0.9, ...Array(22).fill(1)])).toEqual([null, 9]);
  });
});

describe("şampiyon kararı", () => {
  it("tutarlı %10 iyileşme 28 günde terfi eder; aynı girdi aynı kararı verir", () => {
    const champ = days(28, (i) => 1000 + (i % 5) * 50);
    const chall = days(28, (i) => (1000 + (i % 5) * 50) * 0.9);
    const d = reviewChampion(7, BASE_MODEL, { [BASE_MODEL]: champ, [`${BASE_MODEL}-bias`]: chall });
    expect(d?.to).toBe(`${BASE_MODEL}-bias`);
    expect(reviewChampion(7, BASE_MODEL, { [BASE_MODEL]: champ, [`${BASE_MODEL}-bias`]: chall })?.test.pBetter).toBe(d?.test.pBetter);
  });

  it("az gün, küçük fark ya da tek şanslı hafta terfi ettirmez", () => {
    const short = reviewChampion(7, BASE_MODEL, { [BASE_MODEL]: days(MIN_COMMON_DAYS - 1, () => 1000), x: days(MIN_COMMON_DAYS - 1, () => 800) });
    expect(short).toBeNull();
    const small = reviewChampion(7, BASE_MODEL, { [BASE_MODEL]: days(28, () => 1000), x: days(28, () => 970) });
    expect(small).toBeNull();
    // Bir hafta çok iyi, kalan üç hafta biraz kötü: toplamda ucuz olsa bile önyükleme güveni yetmez
    const lucky = reviewChampion(7, BASE_MODEL, { [BASE_MODEL]: days(28, () => 1000), x: days(28, (i) => (i < 7 ? 400 : 1040)) });
    expect(lucky).toBeNull();
  });

  it("kötüleşen canlı sürüm temel sürüme döner", () => {
    const d = reviewChampion(7, `${BASE_MODEL}-w2`, { [`${BASE_MODEL}-w2`]: days(28, () => 1200), [BASE_MODEL]: days(28, () => 1000) });
    expect(d?.to).toBe(BASE_MODEL);
    expect(d?.reason).toContain("geri dönüş");
  });

  it("ortak gün yoksa karşılaştırma boş", () => {
    expect(comparePair({ a: 1 }, { b: 1 }).days).toBe(0);
  });

  it("örneklem içi düzeltme ve canlı serisi terfi edemez; verisi olmayan canlı sürüm temele döner", () => {
    const champ = days(28, () => 1000);
    expect(reviewChampion(7, BASE_MODEL, { [BASE_MODEL]: champ, [BIAS_INSAMPLE_MODEL]: days(28, () => 500), [LIVE_SERIES]: days(28, () => 500) })).toBeNull();
    expect(reviewChampion(7, `${BASE_MODEL}-w6`, { [BASE_MODEL]: champ })?.to).toBe(BASE_MODEL);
  });

  it("birden çok aday: eşik sıkılaşır (Bonferroni)", () => {
    // Gürültülü ama ortalamada %8 iyi: tek adayla geçer, üç adayla (biri bu) daha sıkı eşik
    const champ = days(28, (i) => 1000 + ((i * 37) % 11) * 40);
    const chall = days(28, (i) => (1000 + ((i * 37) % 11) * 40) * 0.92 + ((i * 53) % 7) * 25 - 60);
    const one = reviewChampion(7, BASE_MODEL, { [BASE_MODEL]: champ, a: chall });
    const three = reviewChampion(7, BASE_MODEL, { [BASE_MODEL]: champ, a: chall, b: champ, c: champ });
    if (one) expect(one.test.pBetter).toBeGreaterThanOrEqual(0.95);
    if (three) expect(three.test.pBetter).toBeGreaterThanOrEqual(1 - 0.05 / 3);
  });
});
