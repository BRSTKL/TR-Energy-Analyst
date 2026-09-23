import { describe, it, expect } from "vitest";
import { processHourlyRecord } from "../lib/calculations/engine";
import {
  DEFAULT_IMBALANCE_PROFILE,
  ImbalancePricingProfile,
  SystemDirection,
  regulatoryRegimeAt,
  resolveImbalanceProfile,
  toPricingProfile,
} from "../lib/calculations/types";

const price = (timestamp: string, systemDirection: SystemDirection, profile = DEFAULT_IMBALANCE_PROFILE) =>
  processHourlyRecord(
    { timestamp, actualMwh: 0, forecastMwh: 0 },
    { timestamp, ptf: 2000, smf: 2400, systemDirection },
    profile
  );

describe("Mevzuat dengesizlik katsayı rejimleri", () => {
  it("2025 saatleri sistem yönünden bağımsız sabit %3 ile fiyatlanır", () => {
    for (const dir of ["SURPLUS", "DEFICIT", "BALANCED"] as SystemDirection[]) {
      const r = price("2025-07-15T14:00:00Z", dir);
      expect(r.positivePrice).toBeCloseTo(2000 * 0.97, 6);
      expect(r.negativePrice).toBeCloseTo(2400 * 1.03, 6);
    }
  });

  it("2026 saatleri sistem yönüne bağlı %3 / %6 ile fiyatlanır", () => {
    const surplus = price("2026-02-01T10:00:00Z", "SURPLUS");
    expect(surplus.positivePrice).toBeCloseTo(2000 * 0.94, 6);
    expect(surplus.negativePrice).toBeCloseTo(2400 * 1.03, 6);

    const deficit = price("2026-02-01T10:00:00Z", "DEFICIT");
    expect(deficit.positivePrice).toBeCloseTo(2000 * 0.97, 6);
    expect(deficit.negativePrice).toBeCloseTo(2400 * 1.06, 6);
  });

  it("Rejim sınırı Türkiye duvar saatiyle 1 Ocak 2026 00:00'dır", () => {
    expect(regulatoryRegimeAt("2025-12-31T23:00:00Z").coefficients.negativeDeficitCoef).toBe(1.03);
    expect(regulatoryRegimeAt("2026-01-01T00:00:00Z").coefficients.negativeDeficitCoef).toBe(1.06);
  });

  it("Özel (veya modu tanımsız) profilde katsayılar tarihten bağımsız aynen uygulanır", () => {
    const custom: ImbalancePricingProfile = {
      mode: "CUSTOM",
      positiveSurplusCoef: 0.9,
      positiveOtherCoef: 0.95,
      negativeDeficitCoef: 1.1,
      negativeOtherCoef: 1.05,
    };
    expect(price("2025-03-01T08:00:00Z", "SURPLUS", custom).positivePrice).toBeCloseTo(1800, 6);
    const noMode = { ...custom, mode: undefined };
    expect(resolveImbalanceProfile(noMode, "2025-03-01T08:00:00Z")).toBe(noMode);
  });

  it("Veritabanı satırı modu korunarak profile çevrilir; eski satırlar mevzuat moduna düşer", () => {
    const row = { positiveSurplusCoef: 0.94, positiveOtherCoef: 0.97, negativeDeficitCoef: 1.06, negativeOtherCoef: 1.03 };
    expect(toPricingProfile({ ...row, mode: "CUSTOM" }).mode).toBe("CUSTOM");
    expect(toPricingProfile({ ...row, mode: null }).mode).toBe("REGULATORY");
    expect(toPricingProfile(null)).toBe(DEFAULT_IMBALANCE_PROFILE);
  });
});
