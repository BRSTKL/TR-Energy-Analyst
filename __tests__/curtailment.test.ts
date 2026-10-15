import { describe, it, expect } from "vitest";
import { detectLostHours, type LossInput } from "@/lib/forecast/curtailment";
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
