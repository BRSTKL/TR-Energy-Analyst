import { describe, it, expect } from "vitest";
import { kupstForHour, kupstRegimeAt, KUPST_REGIMES } from "@/lib/calculations/kupst";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE } from "@/lib/calculations/types";

const hour = (t: Date, forecastMwh: number, actualMwh: number, ptf = 2000, smf = 2400) =>
  processHourlyRecord({ timestamp: t, forecastMwh, actualMwh }, { timestamp: t, ptf, smf, systemDirection: "DEFICIT" }, DEFAULT_IMBALANCE_PROFILE);

describe("KÜPST (sapma tutarı)", () => {
  it("toleransı aşan sapmayı max(PTF, SMF) × 0,03 ile fiyatlar; tolerans içindeki sapma bedelsizdir", () => {
    const t = new Date(Date.UTC(2025, 5, 1, 12));
    // RES, plan 100, gerçekleşen 70: sapma 30, tolerans 17 → 13 MWh × 2400 × 0,03
    expect(kupstForHour(hour(t, 100, 70), "RES")).toBeCloseTo(13 * 2400 * 0.03, 6);
    // Fazla üretim de aynı: gerçekleşen 125 → sapma 25, tolerans 17 → 8 MWh
    expect(kupstForHour(hour(t, 100, 125), "RES")).toBeCloseTo(8 * 2400 * 0.03, 6);
    // Tolerans içinde
    expect(kupstForHour(hour(t, 100, 90), "RES")).toBe(0);
    // HES (diğer) %5: sapma 10, tolerans 5
    expect(kupstForHour(hour(t, 100, 90), "HES")).toBeCloseTo(5 * 2400 * 0.03, 6);
    // Plan sıfırken üretim: tamamı sapma
    expect(kupstForHour(hour(t, 0, 4), "GES")).toBeCloseTo(4 * 2400 * 0.03, 6);
  });

  it("oranları tarihe göre seçer: 2025 öncesi rüzgâr %21, 2025'ten itibaren %17", () => {
    expect(kupstRegimeAt(new Date(Date.UTC(2024, 11, 31, 23))).tolerance.RES).toBe(0.21);
    expect(kupstRegimeAt(new Date(Date.UTC(2025, 0, 1, 0))).tolerance.RES).toBe(0.17);
    const t2024 = new Date(Date.UTC(2024, 5, 1, 12));
    // 2024: sapma 30, tolerans 21 → 9 MWh
    expect(kupstForHour(hour(t2024, 100, 70), "RES")).toBeCloseTo(9 * 2400 * 0.03, 6);
    // Rejim açıkça verilirse o kullanılır
    expect(kupstForHour(hour(t2024, 100, 70), "RES", KUPST_REGIMES[1])).toBeCloseTo(13 * 2400 * 0.03, 6);
  });
});
