import { describe, it, expect } from "vitest";
import { clearSkyGhiHour } from "@/lib/forecast/solar-geometry";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/forecast/production-model-v2";
import { LeakageError } from "@/lib/forecast/info-time";

const H = 3_600_000;
const site = { latitude: 37.8, longitude: 33.6 };

function synthetic(days: number, lead: 0 | 1 | 2): SolarHourV2[] {
  const start = Date.UTC(2025, 5, 1);
  const out: SolarHourV2[] = [];
  for (let i = 0; i < days * 24; i++) {
    const t = start + i * H;
    const ghi = clearSkyGhiHour(site.latitude, site.longitude, t) * (0.6 + 0.4 * ((i * 7919) % 97) / 97);
    out.push({ t, uevm: 0.05 * ghi, kgupFirst: 0.05 * ghi, kgupFinal: null, ptf: 2000, ghi, direct: ghi * 0.75, diffuse: ghi * 0.25, temp: 25, cloud: 20, lag48: null, ghiLag48: null, directLag48: null, diffuseLag48: null, weatherLead: lead });
  }
  for (let i = 48; i < out.length; i++) Object.assign(out[i], { lag48: out[i - 48].uevm, ghiLag48: out[i - 48].ghi, directLag48: out[i - 48].direct, diffuseLag48: out[i - 48].diffuse });
  return out;
}

describe("Sürüm 2 ve sızıntı üst sınırı (15.5)", () => {
  it("2 gün önceki hava: denetimden geçer ve doğrusal ilişkiyi öğrenir", () => {
    const hours = synthetic(40, 2);
    const m = fitSolarModelV2(hours.slice(0, 30 * 24), site);
    const noon = hours[35 * 24 + 12];
    expect(Math.abs(m.predict(noon)! - noon.uevm!) / noon.uevm!).toBeLessThan(0.05);
  });

  it("1 gün önceki hava bayraksız LeakageError verir; leakUpperBound ile çalışır", () => {
    const hours = synthetic(40, 1);
    expect(() => fitSolarModelV2(hours.slice(0, 30 * 24), site)).toThrow(LeakageError);
    const m = fitSolarModelV2(hours.slice(0, 30 * 24), site, { leakUpperBound: true });
    expect(m.predict(hours[35 * 24 + 12])).toBeGreaterThan(0);
  });
});
