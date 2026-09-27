import { describe, it, expect } from "vitest";
import { detectOutages, markConcurrent } from "@/lib/analysis/outage-detection";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE } from "@/lib/calculations/types";

const h = (hour: number, forecast: number, actual: number) => {
  const t = new Date(Date.UTC(2025, 1, 6, hour));
  return processHourlyRecord({ timestamp: t, forecastMwh: forecast, actualMwh: actual }, { timestamp: t, ptf: 2000, smf: 2400, systemDirection: "DEFICIT" }, DEFAULT_IMBALANCE_PROFILE);
};

describe("Olası arıza / kısıntı tespiti", () => {
  it("tahmin yüksek, üretim ~0 olan en az 3 saatlik bloğu işaretler", () => {
    // 10 MW santral: 11–14 arası tahmin 9, üretim 0 (4 saat); 16'da tek saatlik düşüş blok sayılmaz
    const hours = [h(10, 8, 7.5), h(11, 9, 0), h(12, 9, 0.1), h(13, 9, 0), h(14, 9, 0.2), h(15, 8, 8), h(16, 9, 0), h(17, 8, 7)];
    const r = detectOutages("AKKUŞ RES", hours, 10);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ start: "2025-02-06T11:00:00.000Z", end: "2025-02-06T14:00:00.000Z", hours: 4 });
    expect(r.events[0].lostMwh).toBeCloseTo(36 - 0.3, 6);
    const blockCost = [1, 2, 3, 4].reduce((s, i) => s + hours[i].imbalanceCost, 0);
    expect(r.costTl).toBeCloseTo(blockCost, 6);
    expect(r.costSharePct).toBeCloseTo((blockCost / hours.reduce((s, x) => s + x.imbalanceCost, 0)) * 100, 6);
  });

  it("saat boşluğu bloğu böler; düşük tahminli saatler işaretlenmez", () => {
    const hours = [h(1, 9, 0), h(2, 9, 0), h(4, 9, 0), h(5, 2, 0), h(6, 2, 0), h(7, 2, 0)];
    expect(detectOutages("X", hours, 10).events).toHaveLength(0);
    expect(detectOutages("X", [], 10).events).toHaveLength(0);
  });

  it("iki santralde aynı saatlere düşen blok olası kısıntı, tek santraldeki olası arıza sayılır", () => {
    const a = detectOutages("A", [h(1, 9, 0), h(2, 9, 0), h(3, 9, 0)], 10);
    const b = detectOutages("B", [h(3, 9, 0), h(4, 9, 0), h(5, 9, 0)], 10);
    const c = detectOutages("C", [h(8, 9, 0), h(9, 9, 0), h(10, 9, 0)], 10);
    const [ma, mb, mc] = markConcurrent([a, b, c]);
    expect(ma.events[0].concurrent).toBe(true);
    expect(mb.events[0].concurrent).toBe(true);
    expect(mc.events[0].concurrent).toBe(false);
  });
});

