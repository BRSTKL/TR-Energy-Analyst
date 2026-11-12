import { describe, it, expect } from "vitest";
import { companyNetting, sumSeries, type NettingRow } from "@/lib/analysis/company-netting";

const H = 3_600_000;
const row = (i: number, forecastMwh: number, actualMwh: number): NettingRow => ({ timestamp: new Date(Date.UTC(2026, 0, 1) + i * H), forecastMwh, actualMwh });
// Basit fiyat: sapmanın mutlak değeri × 100 TL
const cost = (rows: NettingRow[]) => ({
  costTl: rows.reduce((s, r) => s + Math.abs(r.actualMwh - r.forecastMwh) * 100, 0),
  mwh: rows.reduce((s, r) => s + r.actualMwh, 0),
});

describe("sumSeries", () => {
  it("aynı saati toplar, eksik saati olduğu gibi bırakır, zaman sırasına koyar", () => {
    const out = sumSeries([[row(1, 10, 12), row(0, 5, 5)], [row(1, 10, 7)]]);
    expect(out.map((r) => [r.timestamp.getTime(), r.forecastMwh, r.actualMwh])).toEqual([
      [Date.UTC(2026, 0, 1), 5, 5],
      [Date.UTC(2026, 0, 1) + H, 20, 19],
    ]);
  });
  it("girdi satırlarını değiştirmez", () => {
    const a = row(0, 10, 12);
    sumSeries([[a], [row(0, 1, 1)]]);
    expect(a.forecastMwh).toBe(10);
  });
});

describe("companyNetting", () => {
  it("ters yöndeki sapmalar netleşir; tek tek toplam aynı kalır", () => {
    const r = companyNetting(
      [
        { id: 1, aggregator: null, rows: [row(0, 10, 14)] },
        { id: 2, aggregator: null, rows: [row(0, 10, 7)] },
      ],
      cost,
      "2026-10-17"
    );
    expect(r.own).toEqual({ plants: 2, mwh: 21, sumTl: 700, nettedTl: 100 });
    expect(r.aggregated.plants).toBe(0);
    expect(r.membershipAsOf).toBe("2026-10-17");
  });
  it("toplayıcıdaki santral netleşmeye katılmaz ve ayrı sayılır", () => {
    const r = companyNetting(
      [
        { id: 1, aggregator: null, rows: [row(0, 10, 14)] },
        { id: 2, aggregator: null, rows: [row(0, 10, 9)] },
        { id: 3, aggregator: "Enko", rows: [row(0, 10, 0)] },
        { id: 4, aggregator: "Enko", rows: [row(0, 10, 12)] },
      ],
      cost,
      null
    );
    expect(r.own.nettedTl).toBe(300);
    expect(r.own.sumTl).toBe(500);
    expect(r.aggregated).toEqual({ plants: 2, mwh: 12, sumTl: 1200, aggregators: [{ name: "Enko", plants: 2 }] });
  });
  it("kendi portföyünde 2'den az santral varsa netleşmiş değer yok", () => {
    const r = companyNetting(
      [
        { id: 1, aggregator: null, rows: [row(0, 10, 14)] },
        { id: 2, aggregator: "Enko", rows: [row(0, 10, 9)] },
      ],
      cost,
      null
    );
    expect(r.own.nettedTl).toBeNull();
    expect(r.own.sumTl).toBe(400);
  });
  it("serisi olmayan santral sayılır ama toplamlara girmez", () => {
    const r = companyNetting(
      [
        { id: 1, aggregator: null, rows: null },
        { id: 2, aggregator: null, rows: [row(0, 10, 9)] },
      ],
      cost,
      null
    );
    expect(r.missing).toBe(1);
    expect(r.own.plants).toBe(1);
    expect(r.own.nettedTl).toBeNull();
  });
});
