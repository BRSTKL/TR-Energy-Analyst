import { describe, it, expect } from "vitest";
import { imbalanceCostOf, imbalancePrices, processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, REGULATORY_IMBALANCE_REGIMES, resolveImbalanceProfile, type ImbalancePricingProfile } from "@/lib/calculations/types";
import { officialPricesFrom } from "@/lib/services/imbalance-prices";

const t25 = new Date(Date.UTC(2025, 4, 3, 10));
const t26 = new Date(Date.UTC(2026, 4, 3, 10));
const reg = (t: Date) => resolveImbalanceProfile(DEFAULT_IMBALANCE_PROFILE, t);
const P2026: ImbalancePricingProfile = { mode: "CUSTOM", ...REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].coefficients };

describe("2026 fiyat kuralları (DUY md. 110, yürürlük 1/1/2026), resmi fiyat yokken", () => {
  it("MIN(PTF, SMF) < 150 ise pozitif fiyat −100 × (1 − l); negatif fiyat en az 150 × (1 + k)", () => {
    const p = imbalancePrices({ timestamp: t26, ptf: 0, smf: 0, systemDirection: "SURPLUS" }, reg(t26));
    expect(p.positive).toBeCloseTo(-100 * 0.94, 9);
    expect(p.negative).toBeCloseTo(150 * 1.03, 9);
    // Fiyatlar tabanın üstündeyse kural etkisiz
    const q = imbalancePrices({ timestamp: t26, ptf: 2000, smf: 2400, systemDirection: "DEFICIT" }, reg(t26));
    expect(q.positive).toBeCloseTo(2000 * 0.97, 9);
    expect(q.negative).toBeCloseTo(2400 * 1.06, 9);
  });
  it("2026 öncesinde taban kuralı yoktur", () => {
    const p = imbalancePrices({ timestamp: t25, ptf: 0, smf: 0, systemDirection: "SURPLUS" }, reg(t25));
    expect(p.positive).toBeCloseTo(0, 9);
    expect(p.negative).toBeCloseTo(0, 9);
  });
});

describe("EPİAŞ resmi dengesizlik fiyatı", () => {
  // 3 Mayıs 2026 10:00 benzeri saat: sistem fazlası, PTF 0; 15 dakikalık dilimlerin karışımıyla resmi fiyatlar
  const m26 = { timestamp: t26, ptf: 0, smf: 0, systemDirection: "SURPLUS" as const, imbalancePosPrice: -46.9, imbalanceNegPrice: 247.2 };

  it("mevzuat profili saatin kendi tarihinde resmi fiyatı birebir verir (tabana ikinci kez kural uygulanmaz)", () => {
    const p = imbalancePrices(m26, reg(t26));
    expect(p.positive).toBeCloseTo(-46.9, 9);
    expect(p.negative).toBeCloseTo(247.2, 9);
    // 2026 kuralları açık bir CUSTOM profil de aynı tabanı kullanır (−47 → −94'e çekilmez)
    expect(imbalancePrices(m26, P2026).positive).toBeCloseTo(-46.9, 9);
  });

  it("başka katsayı kuralı resmi fiyattan türetilen tabana uygulanır", () => {
    const flat3: ImbalancePricingProfile = { mode: "CUSTOM", positiveSurplusCoef: 0.97, positiveOtherCoef: 0.97, negativeDeficitCoef: 1.03, negativeOtherCoef: 1.03 };
    const p = imbalancePrices(m26, flat3);
    expect(p.positive).toBeCloseTo((-46.9 / 0.94) * 0.97, 9);
    expect(p.negative).toBeCloseTo((247.2 / 1.03) * 1.03, 9);
  });

  it("2026 kurallarının 2025 verisine uygulanması: 2025 resmi tabanına 2026 taban kuralları eklenir", () => {
    const m25 = { timestamp: t25, ptf: 0, smf: 0, systemDirection: "SURPLUS" as const, imbalancePosPrice: 0, imbalanceNegPrice: 0 };
    const p = imbalancePrices(m25, P2026);
    expect(p.positive).toBeCloseTo(-100 * 0.94, 9);
    expect(p.negative).toBeCloseTo(150 * 1.03, 9);
  });

  it("processHourlyRecord ve imbalanceCostOf resmi fiyatla aynı maliyeti verir", () => {
    for (const d of [5, -3]) {
      const r = processHourlyRecord({ timestamp: t26, forecastMwh: 10, actualMwh: 10 + d }, m26, DEFAULT_IMBALANCE_PROFILE);
      expect(imbalanceCostOf(d, m26, DEFAULT_IMBALANCE_PROFILE)).toBeCloseTo(r.imbalanceCost, 9);
      expect(r.imbalancePosPrice).toBe(-46.9);
    }
    // Fazla üretim negatif fiyatla: 5 MWh × (0 − (−46,9)) maliyet
    expect(imbalanceCostOf(5, m26, DEFAULT_IMBALANCE_PROFILE)).toBeCloseTo(5 * 46.9, 9);
  });

  it("tutar / miktar: sistem dengesizliği çok küçükse fiyat yazılmaz; negatif tarafta iki eksi işaret", () => {
    const hours = officialPricesFrom(
      [
        { date: "2026-05-03T10:00:00+03:00", positiveImbalance: -109712.11, negativeImbalance: -368096.23 },
        { date: "2026-05-03T11:00:00+03:00", positiveImbalance: 10, negativeImbalance: -500000 },
      ],
      [
        { date: "2026-05-03T10:00:00+03:00", positiveImbalance: 2337.21, negativeImbalance: -1489.08 },
        { date: "2026-05-03T11:00:00+03:00", positiveImbalance: 0.4, negativeImbalance: -2000 },
      ]
    );
    expect(hours[0].timestamp.toISOString()).toBe("2026-05-03T10:00:00.000Z");
    expect(hours[0].pos).toBeCloseTo(-46.94, 2);
    expect(hours[0].neg).toBeCloseTo(247.2, 1);
    expect(hours[1].pos).toBeNull();
    expect(hours[1].neg).toBeCloseTo(250, 9);
  });
});
