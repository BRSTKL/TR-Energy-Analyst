import { describe, it, expect } from "vitest";
import { weakWindEvidence } from "@/lib/wind-engine/models/blend-evidence";
const doc = {
  set: "blend",
  generatedAt: "2026-10-22T00:00:00Z",
  period: { from: "2025-04", to: "2026-09" },
  blendByYear: {
    2026: [
      { id: 1, w: 0.6, months: 5 },
      { id: 2, w: 0.1, months: 4 },
    ],
  },
};
describe("Aday ekranında geçmiş rüzgâr analizi", () => {
  it("yalnız aynı yıl ve geçerli kanıtı gösterir", () => {
    expect(weakWindEvidence(doc, 2026)[1]?.weight).toBe(0.6);
    expect(weakWindEvidence(doc, 2026)[2]).toBeUndefined();
    expect(weakWindEvidence(doc, 2025)).toEqual({});
    expect(
      weakWindEvidence(
        { ...doc, blendByYear: { 2025: [{ id: 1, w: 0.9, months: 8 }] } },
        2026
      )
    ).toEqual({});
  });
  it("çok yıllı dosyanın önceki yılı için yalnız o yılın kanıtını alır",()=>{
    expect(weakWindEvidence({...doc,blendByYear:{2025:[{id:3,w:0.7,months:4}]}},2025)[3]?.weight).toBe(0.7);
  });
  it("bozuk dosya ve kanıtsız satırı atlar", () => {
    expect(weakWindEvidence(null, 2026)).toEqual({});
    expect(
      weakWindEvidence(
        { ...doc, blendByYear: { 2026: [{ id: 1, w: NaN, months: 4 }] } },
        2026
      )
    ).toEqual({});
  });
});
