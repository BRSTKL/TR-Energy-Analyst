import { describe, it, expect } from "vitest";
import { calculateNegativeImbalancePrice, calculatePositiveImbalancePrice } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, resolveImbalanceProfile, type SystemDirection } from "@/lib/calculations/types";

/**
 * DUY md. 110 (RG 29.12.2025): k negatif, l pozitif dengesizlik katsayısı, sistem yönüne bağlı.
 * EPDK 1/1/2026 kurul kararı taslağı: açık → k 0,06, l 0,03; fazla → k 0,03, l 0,06; denge → 0,03.
 * Pozitif fiyat = MIN(PTF, SMF) × (1 − l); negatif fiyat = MAX(PTF, SMF) × (1 + k).
 */
const TABLE: Array<[SystemDirection, number, number]> = [
  ["DEFICIT", 0.06, 0.03],
  ["SURPLUS", 0.03, 0.06],
  ["BALANCED", 0.03, 0.03],
];

describe("k ve l katsayıları (DUY md. 110, EPDK 2026 tablosu)", () => {
  const ptf = 2000;
  const smf = 2400;
  it("2026: sistem yönüne göre k (negatif) ve l (pozitif)", () => {
    const p = resolveImbalanceProfile(DEFAULT_IMBALANCE_PROFILE, new Date(Date.UTC(2026, 2, 1, 12)));
    for (const [dir, k, l] of TABLE) {
      expect(calculateNegativeImbalancePrice(ptf, smf, dir, p)).toBeCloseTo(Math.max(ptf, smf) * (1 + k), 9);
      expect(calculatePositiveImbalancePrice(ptf, smf, dir, p)).toBeCloseTo(Math.min(ptf, smf) * (1 - l), 9);
    }
  });
  it("2026 öncesi: her yönde k = l = 0,03", () => {
    const p = resolveImbalanceProfile(DEFAULT_IMBALANCE_PROFILE, new Date(Date.UTC(2025, 2, 1, 12)));
    for (const [dir] of TABLE) {
      expect(calculateNegativeImbalancePrice(ptf, smf, dir, p)).toBeCloseTo(Math.max(ptf, smf) * 1.03, 9);
      expect(calculatePositiveImbalancePrice(ptf, smf, dir, p)).toBeCloseTo(Math.min(ptf, smf) * 0.97, 9);
    }
  });
});
