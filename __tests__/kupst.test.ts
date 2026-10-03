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
    expect(kupstRegimeAt(new Date(Date.UTC(2026, 0, 1, 0))).tolerance.RES).toBe(0.15);
    const t2024 = new Date(Date.UTC(2024, 5, 1, 12));
    // 2024: sapma 30, tolerans 21 → 9 MWh
    expect(kupstForHour(hour(t2024, 100, 70), "RES")).toBeCloseTo(9 * 2400 * 0.03, 6);
    // Rejim açıkça verilirse o kullanılır
    expect(kupstForHour(hour(t2024, 100, 70), "RES", KUPST_REGIMES[1])).toBeCloseTo(13 * 2400 * 0.03, 6);
    // 2026: tolerans 15 → 15 MWh; fiyat katsayısı 0,05 (EPDK 2026 taslağı)
    expect(kupstRegimeAt(new Date(Date.UTC(2026, 0, 1, 0))).priceCoef).toBe(0.05);
    expect(kupstForHour(hour(new Date(Date.UTC(2026, 5, 1, 12)), 100, 70), "RES")).toBeCloseTo(15 * 2400 * 0.05, 6);
  });
});

describe("KÜPST son KGÜP ile", () => {
  it("son plan varsa tolerans ve sapma son plana göre hesaplanır", async () => {
    const { kupstForHour, KUPST_REGIMES } = await import("@/lib/calculations/kupst");
    const r2026 = KUPST_REGIMES[2];
    const base = { timestamp: "2026-03-01T10:00:00Z", actualMwh: 80, forecastMwh: 100, ptf: 3000, smf: 2000 } as any;
    // İlk plan: |80 − 100| − 0,15 × 100 = 5 MWh → 5 × 3000 × 0,05 = 750
    expect(kupstForHour(base, "RES", r2026)).toBeCloseTo(750, 6);
    // Son plan 90: |80 − 90| − 0,15 × 90 = −3,5 → 0
    expect(kupstForHour({ ...base, forecastFinalMwh: 90 }, "RES", r2026)).toBe(0);
    // Son plan null: ilk plana düşer
    expect(kupstForHour({ ...base, forecastFinalMwh: null }, "RES", r2026)).toBeCloseTo(750, 6);
  });
});

describe("KÜPST · toplayıcı topluluğu (EPDK 14029 / 13025 md. 4)", () => {
  const T26 = new Date(Date.UTC(2026, 5, 1, 12));
  const plant = (type: string, forecast: number, actual: number, capacityMw: number, t = T26) => ({
    hourly: [hour(t, forecast, actual)],
    plantType: type,
    capacityMw,
  });

  it("ters sapmalar topluluk biriminde netleşir; santral bazında ayrı ayrı KÜPST doğardı", async () => {
    const { kupstCommunityTotal, kupstTotal } = await import("@/lib/calculations/kupst");
    const a = plant("RES", 100, 60, 50); // −40
    const b = plant("RES", 100, 140, 50); // +40
    expect(kupstCommunityTotal([a, b])).toBe(0);
    expect(kupstTotal(a.hourly, "RES") + kupstTotal(b.hourly, "RES")).toBeGreaterThan(0);
  });

  it("tolerans kurulu güce göre ağırlıklandırılır; fiyat katsayısı topluluk için 2026'da 0,05, 2025'te 0,03", async () => {
    const { kupstCommunityTotal } = await import("@/lib/calculations/kupst");
    // RES %15 (75 MW) ve HES %5 (25 MW): ağırlıklı tolerans = 0,15×0,75 + 0,05×0,25 = 0,125
    // toplam plan 200, toplam gerçekleşen 140: sapma 60, tolerans 25 → 35 MWh × 2400 × 0,05
    const parts = [plant("RES", 100, 70, 75), plant("HES", 100, 70, 25)];
    expect(kupstCommunityTotal(parts)).toBeCloseTo(35 * 2400 * 0.05, 6);
    // 2025: tolerans %17 / %5 → 0,17×0,75 + 0,05×0,25 = 0,14 → 60 − 28 = 32 MWh × 2400 × 0,03
    const t25 = new Date(Date.UTC(2025, 5, 1, 12));
    expect(kupstCommunityTotal([plant("RES", 100, 70, 75, t25), plant("HES", 100, 70, 25, t25)])).toBeCloseTo(32 * 2400 * 0.03, 6);
  });

  it("tek santral topluluğu münferit hesapla aynı tolerans için tutarlı (katsayı topluluk katsayısı)", async () => {
    const { kupstCommunityTotal } = await import("@/lib/calculations/kupst");
    const p = plant("RES", 100, 70, 10);
    expect(kupstCommunityTotal([p])).toBeCloseTo(15 * 2400 * 0.05, 6);
  });
});
