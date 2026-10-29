import { describe, expect, it } from "vitest";
import type { PtfForecastLog } from "@/lib/ptf/forecast-log";
import type { ForecastLog } from "@/lib/solar-engine/learning/forecast-log";
import {
  summarizeForecastLog,
  summarizePtfRecord,
  trTomorrow,
} from "@/lib/services/ops-status";

const ptfLog = (over: Partial<PtfForecastLog> = {}): PtfForecastLog => ({
  format: 1,
  targetDate: "2026-10-30",
  issuedAt: "2026-10-29T09:03:30.000Z",
  cutoff: "2026-10-29T09:05:00.000Z",
  onTime: true,
  modelId: "ptf-ens-v1",
  hours: Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    p50: h === 18 ? 4478 : h === 12 ? 1931 : h === 17 ? 4200 : 3000,
    q10: 2500,
    q90: 3500,
  })),
  members: {},
  inputs: { windKind: 1, fallbacks: [], live: [] },
  band: { days: 59, recentMae: 383 },
  cap: 4500,
  ...over,
});

describe("summarizePtfRecord", () => {
  it("ortalama, en pahalı / ucuz saat, limite yakın saatler ve aralık", () => {
    const s = summarizePtfRecord(ptfLog());
    expect(s.max).toEqual({ hour: 18, value: 4478 });
    expect(s.min).toEqual({ hour: 12, value: 1931 });
    expect(s.nearCapHours).toEqual([17, 18]); // ≥ %90 × 4.500 = 4.050
    expect(s.mean).toBeCloseTo((21 * 3000 + 4478 + 1931 + 4200) / 24, 5);
    expect(s.bandLo).toBe(2500);
    expect(s.bandHi).toBe(3500);
    expect(s.recentMae).toBe(383);
    expect(s.onTime).toBe(true);
  });
  it("aralık ve tavan yoksa null / boş", () => {
    const s = summarizePtfRecord(
      ptfLog({
        cap: null,
        hours: ptfLog().hours.map((h) => ({ ...h, q10: null, q90: null })),
      })
    );
    expect(s.bandLo).toBeNull();
    expect(s.nearCapHours).toEqual([]);
  });
  it("seviye düzeltmesi varsa miktarı ve dayandığı kayıt günü gelir", () => {
    const s = summarizePtfRecord(
      ptfLog({
        level: {
          gamma: 0.5,
          applied: { "ptf-ens-v1": { adj: 215, basis: "2026-10-29" } },
          raw: {},
        },
      })
    );
    expect(s.levelAdj).toBe(215);
    expect(s.levelBasis).toBe("2026-10-29");
    expect(summarizePtfRecord(ptfLog()).levelAdj).toBeNull();
  });
});

describe("summarizeForecastLog", () => {
  it("tahmin kurulabilen ve toplam santral sayısı", () => {
    const log = {
      schema: 1,
      tech: "RES",
      targetDate: "2026-10-30",
      issuedAt: "2026-10-29T08:08:00.000Z",
      onTime: true,
      plants: [
        { epiasPlantId: 1, name: "A", status: "ok" },
        { epiasPlantId: 2, name: "B", status: "ok" },
        { epiasPlantId: 3, name: "C", status: "no-data" },
      ],
    } as unknown as ForecastLog;
    expect(summarizeForecastLog(log)).toEqual({
      targetDate: "2026-10-30",
      issuedAt: "2026-10-29T08:08:00.000Z",
      onTime: true,
      ok: 2,
      total: 3,
    });
  });
});

describe("trTomorrow", () => {
  it("Türkiye takvimine göre: UTC gece yarısından önce de yarın bir sonraki TR günüdür", () => {
    expect(trTomorrow(new Date("2026-10-29T10:00:00Z"))).toBe("2026-10-30");
    expect(trTomorrow(new Date("2026-10-29T21:30:00Z"))).toBe("2026-10-31"); // TR 30.10 00:30
  });
});
