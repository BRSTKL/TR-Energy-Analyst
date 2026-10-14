import { describe, it, expect } from "vitest";
import { hourCost, imbalanceBudget, inflationPath, productionScenarios, realSpreadByYear, runRateProduction, yearQualityScale, type BudgetHour, type BudgetScenario } from "@/lib/analysis/imbalance-budget";

const FLAT_3 = { positiveSurplusCoef: 0.97, positiveOtherCoef: 0.97, negativeDeficitCoef: 1.03, negativeOtherCoef: 1.03, floors: false };
const RULE_2026 = { positiveSurplusCoef: 0.94, positiveOtherCoef: 0.97, negativeDeficitCoef: 1.06, negativeOtherCoef: 1.03, floors: true };
const one = () => 1;
const scenario = (over: Partial<BudgetScenario> = {}): BudgetScenario => ({ key: "s", label: "s", rule: FLAT_3, targetSpreadReal: null, ...over });
/** PTF 1000, SMF 1200, sistem açıkta; bir birim +10 MWh, diğeri −5 MWh; KÜPST miktarı 2 MWh */
const hour = (t: number, over: Partial<BudgetHour> = {}): BudgetHour => ({
  t,
  ptf: 1000,
  smf: 1200,
  systemDirection: "DEFICIT",
  unitDeviations: [10, -5],
  kupstQty: 2,
  actualMwh: 100,
  ...over,
});

describe("Bütçe: saat maliyeti (17.1)", () => {
  const t = Date.UTC(2025, 0, 1, 12);

  it("düz %3 kuralı: elle hesaplanmış", () => {
    // +10: 10 × (1000 − 1000 × 0,97) = 300; −5: 5 × (1200 × 1,03 − 1000) = 1180; KÜPST 2 × 1200 = 2400
    expect(hourCost(hour(t), scenario(), 1, one)).toBeCloseTo(3880, 9);
  });

  it("makas ölçeği SMF − PTF'yi büyütür, KÜPST fiyatı da değişir", () => {
    // SMF' = 1000 + 2 × 200 = 1400: +10 → 300; −5 → 5 × (1442 − 1000) = 2210; KÜPST 2 × 1400 = 2800
    expect(hourCost(hour(t), scenario(), 2, one)).toBeCloseTo(5310, 9);
  });

  it("kural senaryosu yalnız katsayıyı değiştirir (2026: açıkta eksik üretim %6)", () => {
    // +10 ters yönde → 0,97: 300; −5 aynı yönde → 1,06: 5 × (1272 − 1000) = 1360; KÜPST 2400
    expect(hourCost(hour(t), scenario({ rule: RULE_2026 }), 1, one)).toBeCloseTo(4060, 9);
  });

  it("reel çarpan bütün tutarı ölçekler; resmi fiyat kullanılmaz", () => {
    expect(hourCost(hour(t), scenario(), 1, () => 0.5)).toBeCloseTo(1940, 9);
  });
});

describe("Bütçe: aylık benzetim (17.1)", () => {
  // 2025'in her ayının 1'inde tek saat: her ayda örneklenecek tek gün var
  const monthly = (cost: Partial<BudgetHour> = {}) => Array.from({ length: 12 }, (_, m) => hour(Date.UTC(2025, m, 1, 12), cost));

  it("tek günlük havuzda dağılım tek noktaya iner; ay = gün sayısı × gün maliyeti", () => {
    const r = imbalanceBudget(monthly(), scenario(), { year: 2027, priceScale: one, sims: 50 });
    expect(r.missingMonths).toEqual([]);
    const jan = r.months[0];
    expect(jan.days).toBe(31);
    expect(jan.expected).toBeCloseTo(31 * 3880, 6);
    expect(jan.p50).toBeCloseTo(jan.expected, 6);
    expect(jan.p95).toBeCloseTo(jan.expected, 6);
    expect(r.months[1].days).toBe(28);
    expect(r.total.expected).toBeCloseTo(365 * 3880, 4);
    expect(r.total.p90).toBeCloseTo(365 * 3880, 4);
    expect(r.total.mwh).toBeCloseTo(365 * 100, 6);
    expect(jan.sourceDays).toEqual({ "2025": 1 });
  });

  it("hedef makas yılın makasını ölçekler; büyüme toplamı çarpar", () => {
    // Yılın makası 200 → hedef 400: ölçek 2, gün maliyeti 5310; büyüme %10
    const r = imbalanceBudget(monthly(), scenario({ targetSpreadReal: 400, growth: 0.1 }), { year: 2027, priceScale: one, sims: 10 });
    expect(r.spreadByYear["2025"]).toEqual({ realSpread: 200, scale: 2 });
    expect(r.months[0].expected).toBeCloseTo(31 * 5310 * 1.1, 6);
    expect(r.months[0].mwh).toBeCloseTo(31 * 100 * 1.1, 6);
  });

  it("iki farklı gün: beklenen = ortalama × gün sayısı, P50 ≤ P90 ≤ P95; aynı tohum aynı sonuç", () => {
    const hours = [hour(Date.UTC(2025, 0, 1, 12)), hour(Date.UTC(2026, 0, 2, 12), { unitDeviations: [0, 0], kupstQty: 0 })];
    const a = imbalanceBudget(hours, scenario(), { year: 2027, priceScale: one, sims: 500, seed: 7 });
    const b = imbalanceBudget(hours, scenario(), { year: 2027, priceScale: one, sims: 500, seed: 7 });
    const jan = a.months[0];
    expect(jan.expected).toBeCloseTo(31 * (3880 + 0) / 2, 6);
    expect(jan.p50).toBeLessThanOrEqual(jan.p90);
    expect(jan.p90).toBeLessThanOrEqual(jan.p95);
    expect(jan.p95).toBeLessThanOrEqual(31 * 3880);
    expect(jan.sourceDays).toEqual({ "2025": 1, "2026": 1 });
    expect(b.months[0]).toEqual(jan);
    // Yalnız Ocak'ta gün var: diğer 11 ay eksik
    expect(a.missingMonths).toHaveLength(11);
  });

  it("yıllara göre reel makas", () => {
    const r = realSpreadByYear([hour(Date.UTC(2025, 0, 1)), hour(Date.UTC(2025, 5, 1), { smf: 1400 }), hour(Date.UTC(2026, 0, 1), { smf: 900 })], () => 2);
    expect(r).toEqual({ "2025": 600, "2026": 200 });
  });
});

describe("Bütçe: birim maliyet × üretim (17.5)", () => {
  const monthly = () => Array.from({ length: 12 }, (_, m) => hour(Date.UTC(2025, m, 1, 12)));

  it("üretim verilirse bütçe = birim maliyet × üretim; verilmeyen ay geçmiş günlerle", () => {
    // Gün: 3880 TL, 100 MWh → 38,8 TL/MWh; Ocak üretimi 5.000 MWh → 194.000 TL; Şubat verilmedi → 28 × 3880
    const r = imbalanceBudget(monthly(), scenario({ growth: 0.1 }), { year: 2027, priceScale: one, sims: 20, production: { "01": 5000 } });
    const [jan, feb] = r.months;
    expect(jan.unit.expected).toBeCloseTo(38.8, 9);
    expect(jan.unit.p95).toBeCloseTo(38.8, 9);
    expect(jan.mwh).toBeCloseTo(5500, 9);
    expect(jan.expected).toBeCloseTo(38.8 * 5500, 6);
    expect(jan.p90).toBeCloseTo(38.8 * 5500, 6);
    expect(feb.expected).toBeCloseTo(28 * 3880 * 1.1, 6);
    expect(feb.mwh).toBeCloseTo(28 * 100 * 1.1, 6);
  });

  it("yeni santral emsallerin mevsim profiliyle tam yıla tamamlanır", () => {
    // Emsal GES: 10, 20, 30, 40. Yeni GES 3. aydan: –, –, 15, 20 → ölçek 35 / 70 = 0,5 → 5, 10 eklenir
    const r = runRateProduction(
      [
        { key: "a", type: "GES", mwh: [10, 20, 30, 40] },
        { key: "new", type: "GES", mwh: [null, 0, 15, 20] },
        { key: "hes", type: "HES", mwh: [null, null, 5, 5] }, // emsali yok: doldurulmaz
      ],
      4
    );
    expect(r.total).toEqual([15, 30, 50, 65]);
    expect(r.filled).toEqual([{ key: "new", addedMwh: 15 }]);
    expect(r.perPlant.new).toEqual([5, 10, 15, 20]);
    expect(r.perPlant.hes).toEqual([0, 0, 5, 5]);
  });
});

describe("Bütçe: üretim senaryoları (17.3)", () => {
  it("hidro kurak = önceki yıl, yağışlı = son yıl (eksik ay oranla), normal = ortalama; diğer türler son yıl", () => {
    const prev = { h: [10, 10, ...new Array(10).fill(10)], r: new Array(12).fill(5) };
    // Son yıl yalnız ilk iki ay: HES 20, 20 (oran 2) → kalan aylar 10 × 2 = 20; RES 6, 6 (oran 1,2) → 6
    const latest = { h: [20, 20, ...new Array(10).fill(null)], r: [6, 6, ...new Array(10).fill(null)] };
    const s = productionScenarios([{ key: "h", type: "HES" }, { key: "r", type: "RES" }], prev, latest);
    expect(s.dry[5]).toBeCloseTo(10 + 6, 9);
    expect(s.wet[5]).toBeCloseTo(20 + 6, 9);
    expect(s.normal[5]).toBeCloseTo(15 + 6, 9);
    expect(s.wet[0]).toBeCloseTo(26, 9);
  });

  it("önceki yılı olmayan santral son yılın verisiyle, eksik ay 0", () => {
    const s = productionScenarios([{ key: "n", type: "GES" }], {}, { n: [3, 4, ...new Array(10).fill(null)] });
    expect(s.normal.slice(0, 3)).toEqual([3, 4, 0]);
  });
});

describe("Bütçe: tahmin kalitesi taşıma (17.3)", () => {
  it("ortak aylardaki MWh başına maliyet oranı; çarpan eski yılın günlerine uygulanır", () => {
    // 2025 Ocak: gün 3880 TL / 100 MWh; 2026 Ocak: sapmalar yarıda (5, −2,5) ve KÜPST 1 → 1940 TL / 100 MWh → oran 0,5
    const hours = [
      hour(Date.UTC(2025, 0, 1, 12)),
      hour(Date.UTC(2025, 9, 1, 12)), // Ekim: yalnız 2025
      hour(Date.UTC(2026, 0, 1, 12), { unitDeviations: [5, -2.5], kupstQty: 1 }),
    ];
    const k = yearQualityScale(hours, scenario(), one, 2025, 2026);
    expect(k).toBeCloseTo(0.5, 9);
    const r = imbalanceBudget(hours, scenario(), { year: 2027, priceScale: one, sims: 10, yearCostScale: { "2025": k } });
    const oct = r.months.find((m) => m.month === "10")!;
    expect(oct.expected).toBeCloseTo(31 * 3880 * 0.5, 6);
  });
});

describe("Bütçe: enflasyon yolu ve blok örnekleme (17.6)", () => {
  it("yıllık oran ay ay bileşik: taban Eylül 2026, %42", () => {
    const f = inflationPath(42, "2026-09", 2027);
    expect(f["01"]).toBeCloseTo(Math.pow(1.42, 4 / 12), 12);
    expect(f["12"]).toBeCloseTo(Math.pow(1.42, 15 / 12), 12);
    const avg = Object.values(f).reduce((a, b) => a + b, 0) / 12;
    expect(avg).toBeGreaterThan(1.3);
    expect(avg).toBeLessThan(1.34);
  });

  it("ay çarpanı tutara ve birim maliyete uygulanır", () => {
    const hours = Array.from({ length: 12 }, (_, m) => hour(Date.UTC(2025, m, 1, 12)));
    const r = imbalanceBudget(hours, scenario(), { year: 2027, priceScale: one, sims: 10, production: { "01": 1000 }, monthScale: { "01": 2 } });
    expect(r.months[0].expected).toBeCloseTo(38.8 * 1000 * 2, 6);
    expect(r.months[0].unit.expected).toBeCloseTo(77.6, 9);
    expect(r.months[0].p50).toBeCloseTo(77600, 6);
    expect(r.months[1].expected).toBeCloseTo(28 * 3880, 6);
  });

  it("ay uzunluğunda blok: her benzetim ayın tamamı (başa sararak), dağılım tek nokta; tek gün blokta değil", () => {
    // Ocak 2025'in 31 günü, gün d'nin maliyeti d × 3880 (sapmalar ölçekli)
    const hours = Array.from({ length: 31 }, (_, d) =>
      hour(Date.UTC(2025, 0, d + 1, 12), { unitDeviations: [10 * (d + 1), -5 * (d + 1)], kupstQty: 2 * (d + 1) })
    );
    const monthSum = (31 * 32) / 2 * 3880;
    const full = imbalanceBudget(hours, scenario(), { year: 2027, priceScale: one, sims: 200, blockDays: 31 });
    expect(full.months[0].p50).toBeCloseTo(monthSum, 4);
    expect(full.months[0].p95).toBeCloseTo(monthSum, 4);
    const daily = imbalanceBudget(hours, scenario(), { year: 2027, priceScale: one, sims: 200, blockDays: 1 });
    expect(daily.months[0].p95).toBeGreaterThan(daily.months[0].p50);
  });
});
