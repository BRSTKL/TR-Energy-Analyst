import { describe, expect, it } from "vitest";
import { bidCsv, bidTotals, buildBidRows, hourRisk, type BidPtfHour } from "@/lib/ptf/bid-table";
import type { PriceLimit } from "@/lib/analysis/price-limit";

const limit = { cap: 3400 } as PriceLimit;
const hour = (hour: number, p50: number, q10: number | null = p50 - 100, q90: number | null = p50 + 100): BidPtfHour => ({
  hour,
  p50,
  q10,
  q90,
});

describe("hourRisk", () => {
  it("tahmin limitte, limite yakın ya da sıfırsa işaretler", () => {
    expect(hourRisk(hour(1, 3400), limit).risk).toBe("cap");
    expect(hourRisk(hour(1, 3200), limit).risk).toBe("near");
    expect(hourRisk(hour(1, 0, 0, 50), limit).risk).toBe("zero");
  });
  it("üst aralık limite ulaşıyorsa 'near'; alt aralık sıfıra iniyorsa 'zero'", () => {
    expect(hourRisk(hour(1, 2500, 2400, 3300), limit).risk).toBe("near");
    expect(hourRisk(hour(1, 800, 0, 900), limit).risk).toBe("zero");
  });
  it("aralık tahminin %90'ından genişse 'wide'; sakin saatte risk yok", () => {
    expect(hourRisk(hour(1, 1000, 400, 1400), limit).risk).toBe("wide");
    expect(hourRisk(hour(1, 2000, 1900, 2100), limit).risk).toBeNull();
  });
  it("limit bilinmiyorsa yalnız sıfır ve aralık denetlenir", () => {
    expect(hourRisk(hour(1, 3400, 3300, 3500), null).risk).toBeNull();
  });
});

describe("buildBidRows ve toplamlar", () => {
  const ptf = Array.from({ length: 24 }, (_, h) => hour(h, 2000 + h * 10));
  const prod = Array.from({ length: 24 }, (_, h) => (h >= 6 && h <= 18 ? 10 : 0));
  it("24 satır, saat sırasıyla; üretim yoksa mwh null", () => {
    const rows = buildBidRows([...ptf].reverse(), null, limit);
    expect(rows).toHaveLength(24);
    expect(rows[0].label).toBe("00:00");
    expect(rows[23].label).toBe("23:00");
    expect(rows.every((r) => r.mwh === null)).toBe(true);
  });
  it("üretim ağırlıklı ortalama PTF ve toplam MWh", () => {
    const t = bidTotals(buildBidRows(ptf, prod, limit));
    expect(t.mwh).toBe(130);
    const w = (6 + 18) / 2; // 6..18 saatleri eşit ağırlık
    expect(t.weightedPtf).toBeCloseTo(2000 + w * 10, 6);
    expect(t.meanPtf).toBeCloseTo(2000 + 11.5 * 10, 6);
  });
  it("üretim yoksa ağırlıklı ortalama null", () => {
    expect(bidTotals(buildBidRows(ptf, null, limit)).weightedPtf).toBeNull();
  });
});

describe("bidCsv", () => {
  it("BOM, noktalı virgül, virgüllü ondalık, risk adı", () => {
    const csv = bidCsv("2026-11-03", buildBidRows([hour(0, 3400, 3300, 3400)], [1.5], limit));
    expect(csv.startsWith("﻿Tarih;Saat;")).toBe(true);
    expect(csv).toContain("2026-11-03;00:00;3400;3300;3400;1,50;limitte");
  });
});
