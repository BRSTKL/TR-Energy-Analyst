import { describe, it, expect } from "vitest";
import { dsgHourCost, dsgRatioAt, splitMemberImbalance } from "@/lib/calculations/dsg-rule";
import { analyzeDsgScenario } from "@/lib/analysis/dsg-scenarios";
import { imbalanceFloorV, imbalancePrices, processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, resolveImbalanceProfile } from "@/lib/calculations/types";

/**
 * DUY md. 111/3–5 (RG 17/12/2024): DSG üyesinin saatlik dengesizlik oranı DO = |BEDM| / PH, PH = max(NAM, NSM).
 * Oran 2025'te %10, 2026'dan itibaren %5 (EPDK 13869). Aşan kısım üyenin kendi fiyatıyla.
 */
describe("DSG netleşme sınırı (md. 111/5)", () => {
  it("oran dönemleri: 2025 öncesi sınırsız, 2025 %10, 2026 %5", () => {
    expect(dsgRatioAt("2024-12-31T23:00:00Z")).toBe(Infinity);
    expect(dsgRatioAt("2025-06-01T12:00:00Z")).toBe(0.1);
    expect(dsgRatioAt("2026-01-01T00:00:00Z")).toBe(0.05);
  });

  it("üreticinin sapması: PH = max(gerçekleşen, plan) oranı kadarı grupta, kalanı kendisine", () => {
    // Plan 100, gerçekleşen 80: −20; PH 100 → %5 sınır 5 MWh
    expect(splitMemberImbalance(100, 80, 0.05)).toEqual({ inGroup: -5, excess: -15 });
    // Plan 100, gerçekleşen 120: +20; PH 120 → 6 MWh
    const up = splitMemberImbalance(100, 120, 0.05);
    expect(up.inGroup).toBeCloseTo(6, 9);
    expect(up.excess).toBeCloseTo(14, 9);
    // Oranın altındaki sapma tamamen grupta
    expect(splitMemberImbalance(100, 103, 0.05)).toEqual({ inGroup: 3, excess: 0 });
    // Sınırsız dönem
    expect(splitMemberImbalance(100, 80, Infinity)).toEqual({ inGroup: -20, excess: 0 });
  });

  const ts = "2026-03-01T12:00:00Z";
  const market = { timestamp: ts, ptf: 2000, smf: 2000, systemDirection: "BALANCED" as const };
  const profile = resolveImbalanceProfile(DEFAULT_IMBALANCE_PROFILE, new Date(ts));
  const own = (f: number, a: number) => processHourlyRecord({ timestamp: ts, forecastMwh: f, actualMwh: a }, market, DEFAULT_IMBALANCE_PROFILE).imbalanceCost;

  it("tek üyeli grupta maliyet üyenin kendi maliyetine eşit", () => {
    expect(dsgHourCost([{ forecastMwh: 100, actualMwh: 80 }], market, DEFAULT_IMBALANCE_PROFILE)).toBeCloseTo(own(100, 80), 6);
  });

  it("zıt yönlü iki üye: yalnız sınır kadarı netleşir", () => {
    // A: −20 (grupta −5, kendine −15); B: +20 (PH 120, grupta +6, kendine +14). Grupta net +1.
    const cost = dsgHourCost(
      [
        { forecastMwh: 100, actualMwh: 80 },
        { forecastMwh: 100, actualMwh: 120 },
      ],
      market,
      DEFAULT_IMBALANCE_PROFILE
    );
    const { positive, negative } = imbalancePrices(market, profile);
    // 1 MWh pozitif (grup) + 14 MWh pozitif (B) + 15 MWh negatif (A); PTF = SMF = 2000, katsayı %3
    const expected = 15 * (2000 - positive) + 15 * (negative - 2000);
    expect(cost).toBeCloseTo(expected, 6);
    // Sınırsız netleşmede maliyet sıfırdı; sınırla bağımsız toplamın (40 MWh × 60) çoğu kalır
    expect(cost).toBeCloseTo(15 * 60 + 15 * 60, 6);
    expect(own(100, 80) + own(100, 120)).toBeCloseTo(40 * 60, 6);
  });

  it("DSG senaryosu sınırla daha az fayda verir; toplayıcı (tek katılımcı) sınırsız", () => {
    const h = (f: number, a: number) => processHourlyRecord({ timestamp: ts, forecastMwh: f, actualMwh: a }, market, DEFAULT_IMBALANCE_PROFILE);
    const members = [
      { plantId: "A", plantName: "A", plantType: "RES", hourly: [h(100, 80)] },
      { plantId: "B", plantName: "B", plantType: "GES", hourly: [h(100, 120)] },
    ];
    const limited = analyzeDsgScenario(members, ["A", "B"], DEFAULT_IMBALANCE_PROFILE).selection!;
    const unlimited = analyzeDsgScenario(members, ["A", "B"], DEFAULT_IMBALANCE_PROFILE, { participantLimit: false }).selection!;
    expect(unlimited.nettedCost).toBeCloseTo(0, 6);
    expect(limited.nettedCost).toBeCloseTo(1800, 6);
    expect(limited.standaloneCost).toBeCloseTo(unlimited.standaloneCost, 6);
  });
});

describe("V değeri (EPDK 14911)", () => {
  it("1.11.2026'dan itibaren 100 TL/MWh, öncesinde 150", () => {
    expect(imbalanceFloorV("2026-10-31T23:00:00Z")).toBe(150);
    expect(imbalanceFloorV("2026-11-01T00:00:00Z")).toBe(100);
    expect(imbalanceFloorV()).toBe(150);
  });

  it("resmi fiyatı olmayan saatte negatif fiyat tabanı ve pozitif fiyat eşiği V'yi izler", () => {
    const at = (iso: string, ptf: number) => {
      const m = { timestamp: iso, ptf, smf: ptf, systemDirection: "BALANCED" as const };
      return imbalancePrices(m, resolveImbalanceProfile(DEFAULT_IMBALANCE_PROFILE, new Date(iso)));
    };
    // PTF 120: Ekim'de V = 150 → pozitif −100 × 0,97, negatif 150 × 1,03
    const oct = at("2026-10-15T12:00:00Z", 120);
    expect(oct.positive).toBeCloseTo(-97, 9);
    expect(oct.negative).toBeCloseTo(154.5, 9);
    // Kasım'da V = 100 → PTF 120 eşiğin üstünde: pozitif 120 × 0,97, negatif 120 × 1,03
    const nov = at("2026-11-15T12:00:00Z", 120);
    expect(nov.positive).toBeCloseTo(116.4, 9);
    expect(nov.negative).toBeCloseTo(123.6, 9);
    // PTF 50: Kasım'da negatif fiyat en az 100 × 1,03
    expect(at("2026-11-15T12:00:00Z", 50).negative).toBeCloseTo(103, 9);
  });
});
