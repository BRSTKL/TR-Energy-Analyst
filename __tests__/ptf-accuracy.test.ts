import { describe, expect, it } from "vitest";
import { accuracySummary } from "@/lib/ptf/accuracy";

describe("accuracySummary", () => {
  it("sapma, fiyata oranı ve basit yönteme göre fark", () => {
    const s = accuracySummary({
      days: 60,
      recentMae: 386,
      meanPrice: 2900,
      baselineMae: 551,
    })!;
    expect(s.days).toBe(60);
    expect(s.maeTl).toBe(386);
    expect(s.relPct).toBeCloseTo(13.31, 1);
    expect(s.vsBaselinePct).toBeCloseTo(29.95, 1);
  });
  it("basit yöntemden kötüyse fark negatif", () => {
    const s = accuracySummary({
      days: 30,
      recentMae: 600,
      meanPrice: 2000,
      baselineMae: 500,
    })!;
    expect(s.vsBaselinePct).toBeCloseTo(-20, 5);
  });
  it("eski kayıtta fiyat ve basit yöntem yoksa yalnız TL sapma", () => {
    const s = accuracySummary({ days: 59, recentMae: 383 })!;
    expect(s.maeTl).toBe(383);
    expect(s.relPct).toBeNull();
    expect(s.vsBaselinePct).toBeNull();
  });
  it("hata hesaplanamadıysa ya da gün yoksa özet yok", () => {
    expect(accuracySummary({ days: 60, recentMae: null })).toBeNull();
    expect(accuracySummary({ days: 0, recentMae: 100 })).toBeNull();
    expect(accuracySummary(undefined)).toBeNull();
  });
  it("sıfır ya da eksi fiyat oranı bozmaz", () => {
    expect(
      accuracySummary({ days: 60, recentMae: 100, meanPrice: 0, baselineMae: 0 })!.relPct
    ).toBeNull();
  });
});
