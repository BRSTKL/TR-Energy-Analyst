import { describe, it, expect } from "vitest";
import { buildFeatureRows, featureNames, toDirectionHour, HOUR_MS, type DirectionHour } from "../lib/analysis/direction-features";

/** Deterministik sözde rastgele (LCG) */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function hoursFor(days: number, deficit: (t: number, i: number) => boolean | null, start = Date.UTC(2025, 0, 1)): DirectionHour[] {
  return Array.from({ length: days * 24 }, (_, i) => {
    const t = start + i * HOUR_MS;
    const d = deficit(t, i);
    return { t, ptf: 2000 + (i % 24) * 10, smf: d ? 2500 : 1500, deficit: d };
  });
}

describe("buildFeatureRows", () => {
  const rand = lcg(7);
  const hours = hoursFor(60, () => rand() < 0.6);

  for (const infoTime of ["D-1", "H-2"] as const) {
    it(`${infoTime}: hiçbir satır karar anından sonraki yön/makas verisine dayanmaz`, () => {
      const { rows } = buildFeatureRows(hours, infoTime);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.decisionT).toBeLessThan(r.t);
        expect(r.latestSourceT).toBeLessThanOrEqual(r.decisionT);
        expect(r.x).toHaveLength(featureNames(infoTime).length);
      }
    });
  }

  it("D-1 karar anı D-1 gününün başıdır; kalıcılık D-2'nin aynı saatidir", () => {
    const { rows } = buildFeatureRows(hours, "D-1");
    const r = rows[100];
    const dayStart = r.t - r.hour * HOUR_MS;
    expect(r.decisionT).toBe(dayStart - 24 * HOUR_MS);
    const twoDaysAgo = hours.find((h) => h.t === r.t - 48 * HOUR_MS)!;
    expect(r.persistDeficit).toBe(twoDaysAgo.deficit);
  });

  it("H-2'de gece yarısı saati önceki günün son saatini (karar anından sonra) kullanmaz", () => {
    // D-1 23:00 hariç bütün saatler fazla; 23:00 açık. Gece yarısı satırında 'son gün açık oranı' 0 olmalı
    const h = hoursFor(40, (t) => new Date(t).getUTCHours() === 23);
    const { rows } = buildFeatureRows(h, "H-2");
    const midnight = rows.find((r) => r.hour === 0)!;
    const lastDayRate = midnight.x[featureNames("H-2").indexOf("lastDayRate")];
    expect(lastDayRate).toBe(0);
    // 01:00 satırı için D-1 23:00 bilinir (t − 2 saat)
    const one = rows.find((r) => r.hour === 1)!;
    expect(one.x[featureNames("H-2").indexOf("lag2")]).toBe(1);
  });

  it("dengede saatler ve geçmişi yetersiz saatler sayılarak atlanır", () => {
    const h = hoursFor(40, (_t, i) => (i % 50 === 0 ? null : i % 2 === 0));
    const built = buildFeatureRows(h, "D-1");
    expect(built.balancedHours).toBe(Math.ceil((40 * 24) / 50));
    // İlk 2 + 28 günün çoğu yetersiz geçmiş
    expect(built.insufficientHistory).toBeGreaterThan(24 * 15);
    expect(built.rows.length + built.balancedHours + built.insufficientHistory).toBe(40 * 24);
  });

  it("MarketData satırını yön saatine çevirir", () => {
    expect(toDirectionHour({ timestamp: new Date(0), ptf: 1, smf: 2, systemDirection: "DEFICIT" }).deficit).toBe(true);
    expect(toDirectionHour({ timestamp: 0, ptf: 1, smf: 0, systemDirection: "SURPLUS" }).deficit).toBe(false);
    expect(toDirectionHour({ timestamp: 0, ptf: 1, smf: 1, systemDirection: "BALANCED" }).deficit).toBeNull();
  });
});
