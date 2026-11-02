import { describe, expect, it } from "vitest";
import type { PtfForecastLog } from "@/lib/ptf/forecast-log";
import { evidenceLabel, scoreDay, summarizeScores } from "@/lib/ptf/scorecard";

const log = (p50: number, over: Partial<PtfForecastLog> = {}, band: [number, number] | null = [p50 - 100, p50 + 100]) =>
  ({
    format: 1,
    targetDate: "2026-11-01",
    issuedAt: "x",
    cutoff: "x",
    onTime: true,
    modelId: "m",
    members: {},
    inputs: { windKind: 1, fallbacks: [], live: [] },
    band: { days: 60, recentMae: 300 },
    cap: 3400,
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      p50,
      q10: band ? band[0] : null,
      q90: band ? band[1] : null,
    })),
    ...over,
  }) as PtfForecastLog;
const flat = (v: number) => Array<number>(24).fill(v);

describe("scoreDay", () => {
  it("MAE, sapma, referans ve aralık kapsamasını hesaplar", () => {
    const s = scoreDay(log(2000), flat(2050), flat(2400))!;
    expect(s.mae).toBe(50);
    expect(s.bias).toBe(-50);
    expect(s.refMae).toBe(350);
    expect(s.banded).toBe(24);
    expect(s.inside).toBe(24); // 2050 ∈ [1900, 2100]
    const out = scoreDay(log(2000), flat(2300), null)!;
    expect(out.inside).toBe(0);
    expect(out.refMae).toBeNull();
  });
  it("kesimden sonra yazılmış kayıt ya da eksik gerçekleşen skorlanmaz", () => {
    expect(scoreDay(log(2000, { onTime: false }), flat(2000), null)).toBeNull();
    expect(scoreDay(log(2000), null, null)).toBeNull();
    expect(scoreDay(log(2000), [...flat(2000).slice(0, 23)], null)).toBeNull();
  });
  it("aralığı olmayan saat kapsamaya girmez", () => {
    const s = scoreDay(log(2000, {}, null), flat(2100), null)!;
    expect(s.banded).toBe(0);
  });
});

describe("summarizeScores", () => {
  it("ortalamalar ve referansa göre iyileşme yalnız referanslı günlerde", () => {
    const a = scoreDay(log(2000), flat(2100), flat(2500))!; // mae 100, ref 400
    const b = scoreDay(log(2000), flat(2300), null)!; // mae 300, referanssız
    const s = summarizeScores([a, b])!;
    expect(s.days).toBe(2);
    expect(s.mae).toBe(200);
    expect(s.refMae).toBe(400);
    expect(s.vsRefPct).toBeCloseTo(75, 6); // 100'e karşı 400
    expect(s.coveragePct).toBeCloseTo((24 / 48) * 100, 6);
  });
  it("gün yoksa null", () => {
    expect(summarizeScores([])).toBeNull();
  });
});

describe("evidenceLabel", () => {
  it("30 günden azsa kanıt zayıf", () => {
    expect(evidenceLabel(2)).toContain("Kanıt zayıf");
    expect(evidenceLabel(30)).toBe("30 gün");
  });
});
