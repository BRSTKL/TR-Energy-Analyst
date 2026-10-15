import { describe, it, expect } from "vitest";
import { detectLostHours, monthlyLoss, type LossInput } from "@/lib/forecast/curtailment";
import { clearSkyGhiHour, planeOfArray } from "@/lib/forecast/solar-geometry";

const H = 3_600_000;
const site = { latitude: 37.8, longitude: 33.6 };

/** 60 gün: üretim = 0,01 × POA (sabit 30°); 10. günün öğlen 4 saati planlı kısıntı (KGÜP 0), 20. günün öğlen 4 saati arıza */
function synthetic(): LossInput[] {
  const out: LossInput[] = [];
  const start = Date.UTC(2025, 5, 1);
  for (let i = 0; i < 60 * 24; i++) {
    const t = start + i * H;
    const ghi = clearSkyGhiHour(site.latitude, site.longitude, t) * (0.7 + 0.3 * (((i * 7919) % 97) / 97));
    const direct = ghi * 0.8;
    const diffuse = ghi * 0.2;
    const prod = 0.01 * planeOfArray(site.latitude, site.longitude, t, ghi, direct, diffuse, { kind: "fixed", tiltDeg: 30 });
    out.push({ t, uevm: prod, kgupFirst: prod, satGhi: ghi, satDirect: direct, satDiffuse: diffuse });
  }
  for (const h of [10, 11, 12, 13]) Object.assign(out[10 * 24 + h], { uevm: 0, kgupFirst: 0 });
  for (const h of [10, 11, 12, 13]) out[20 * 24 + h].uevm = 0;
  return out;
}

describe("Uydu ışınımıyla kısıntı / arıza tespiti (15.5)", () => {
  it("kurulumu bulur; planlı kısıntıyı ve arızayı ayırır; normal saatleri işaretlemez", () => {
    const hours = synthetic();
    const r = detectLostHours(hours, site);
    // Yazın 20° ve 30° eğimin günlük biçimi neredeyse aynı: korelasyon ayırmaz; takip sistemi seçilmemeli
    expect(["sabit-20", "sabit-30"]).toContain(r.mount);
    const planned = [...r.lost].filter(([, k]) => k === "planned").map(([t]) => t);
    const unplanned = [...r.lost].filter(([, k]) => k === "unplanned").map(([t]) => t);
    expect(planned.sort()).toEqual([10, 11, 12, 13].map((h) => hours[10 * 24 + h].t));
    expect(unplanned.sort()).toEqual([10, 11, 12, 13].map((h) => hours[20 * 24 + h].t));
    expect(r.lostMwh.planned).toBeGreaterThan(0);
    // Beklenen üretim gerçeğe yakın (P90 oranı, bulut payı oranı değiştirmez)
    const noon = hours[30 * 24 + 12];
    expect(Math.abs(r.expected.get(noon.t)! - noon.uevm!) / noon.uevm!).toBeLessThan(0.1);
  });
});

describe("Kayıp özeti (20.1)", () => {
  it("devreye alma: seçenek kapalıyken kayıp sayılır, açıkken sayılmaz", () => {
    const hours = synthetic();
    // İlk 8 gün %40 güç (devreye alma)
    for (const h of hours.slice(0, 8 * 24)) h.uevm = h.uevm! * 0.4;
    const off = detectLostHours(hours, site);
    const on = detectLostHours(hours, site, { commissioning: true });
    const early = (r: typeof off) => [...r.lost.keys()].filter((t) => t < hours[8 * 24].t).length;
    expect(early(off)).toBeGreaterThan(20);
    expect(early(on)).toBe(0);
    expect(on.steadyFrom).toBe(hours[8 * 24].t);
    // Sonraki kayıplar iki durumda da bulunur
    expect([...on.lost.keys()]).toContain(hours[20 * 24 + 12].t);
  });

  it("aylık özet: kayıp MWh, oran ve TL karşılığı elle", () => {
    const hours = synthetic().map((h) => ({ ...h, ptf: 1000 }));
    // 10. gündeki planlı kısıntının fiyatı 0
    for (const h of [10, 11, 12, 13]) hours[10 * 24 + h].ptf = 0;
    const r = detectLostHours(hours, site);
    const m = monthlyLoss(hours, r);
    expect(m.map((x) => x.month)).toEqual(["2025-06", "2025-07"]);
    const jun = m[0];
    const lostPlanned = [10, 11, 12, 13].reduce((a, h) => a + r.expected.get(hours[10 * 24 + h].t)!, 0);
    const lostUnplanned = [10, 11, 12, 13].reduce((a, h) => a + r.expected.get(hours[20 * 24 + h].t)!, 0);
    expect(jun.plannedHours).toBe(4);
    expect(jun.unplannedHours).toBe(4);
    expect(jun.plannedLossMwh).toBeCloseTo(lostPlanned, 6);
    expect(jun.plannedValueTl).toBe(0); // sıfır fiyatlı saat
    expect(jun.unplannedValueTl).toBeCloseTo(lostUnplanned * 1000, 4);
    const actual = hours.filter((h) => h.t < Date.UTC(2025, 6, 1)).reduce((a, h) => a + h.uevm!, 0);
    expect(jun.actualMwh).toBeCloseTo(actual, 6);
    expect(jun.lossPct).toBeCloseTo(((lostPlanned + lostUnplanned) / (actual + lostPlanned + lostUnplanned)) * 100, 9);
    expect(m[1].plannedHours + m[1].unplannedHours).toBe(0);
  });
});
