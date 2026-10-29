import { describe, expect, it } from "vitest";
import { dayPhase, formatCountdown, phaseText, trNowMinutes } from "@/lib/ui/day-phase";

const at = (h: number, m: number, s = 0) => h * 60 + m + s / 60;

describe("dayPhase: faz sınırları (Türkiye saati)", () => {
  it("08:00'e kadar hazırlık", () => {
    expect(dayPhase(at(7, 59)).id).toBe("prep");
    expect(dayPhase(at(0, 0)).id).toBe("prep");
  });
  it("08:00 – 12:05 teklif öncesi; kapanışa kalan süre var", () => {
    const p = dayPhase(at(8, 0));
    expect(p.id).toBe("pre-bid");
    expect(p.minutesToClose).toBe(270);
    expect(dayPhase(at(12, 4, 59)).id).toBe("pre-bid");
  });
  it("12:05 – 12:30 kapanışa geri sayım; son 15 dakika acil", () => {
    expect(dayPhase(at(12, 5)).id).toBe("closing");
    expect(dayPhase(at(12, 5)).urgent).toBe(false);
    expect(dayPhase(at(12, 14, 59)).urgent).toBe(false);
    expect(dayPhase(at(12, 15)).urgent).toBe(true);
    expect(dayPhase(at(12, 29)).urgent).toBe(true);
    expect(dayPhase(at(12, 29)).minutesToClose).toBe(1);
  });
  it("12:30 tam: kapanış geçti, sonuç bekleniyor", () => {
    const p = dayPhase(at(12, 30));
    expect(p.id).toBe("awaiting");
    expect(p.minutesToClose).toBeNull();
    expect(p.minutesToResults).toBe(90);
  });
  it("14:00 gün içi; 18:00 gün sonu", () => {
    expect(dayPhase(at(13, 59)).id).toBe("awaiting");
    expect(dayPhase(at(14, 0)).id).toBe("intraday");
    expect(dayPhase(at(14, 0)).minutesToResults).toBeNull();
    expect(dayPhase(at(17, 59)).id).toBe("intraday");
    expect(dayPhase(at(18, 0)).id).toBe("evening");
    expect(dayPhase(at(23, 59)).id).toBe("evening");
  });
});

describe("geri sayım metni", () => {
  it("dakikayı yukarı yuvarlar ve saati ayırır", () => {
    expect(formatCountdown(15.2)).toBe("16 dk");
    expect(formatCountdown(1)).toBe("1 dk");
    expect(formatCountdown(65)).toBe("1 sa 05 dk");
    expect(formatCountdown(-3)).toBe("0 dk");
  });
  it("faza göre kısa cümle", () => {
    expect(phaseText(dayPhase(at(12, 14)))).toBe("Teklif kapanışına 16 dk");
    expect(phaseText(dayPhase(at(10, 0)))).toBe("Teklif öncesi · kapanışa 2 sa 30 dk");
    expect(phaseText(dayPhase(at(13, 0)))).toBe("Sonuç bekleniyor · 14:00'e 1 sa 00 dk");
    expect(phaseText(dayPhase(at(15, 0)))).toBe("Gün içi");
  });
});

describe("trNowMinutes", () => {
  it("UTC+3 ile gün başından dakika", () => {
    expect(trNowMinutes(Date.parse("2026-10-29T09:05:30Z"))).toBeCloseTo(
      at(12, 5, 30),
      5
    );
    expect(trNowMinutes(Date.parse("2026-10-29T21:30:00Z"))).toBe(30); // gece yarısını geçti (TR 00:30)
  });
});
