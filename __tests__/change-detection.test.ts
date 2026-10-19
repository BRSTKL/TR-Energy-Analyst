import { describe, expect, it } from "vitest";
import { capacityChange, locationShift, longOutage, type SolarObservedHour } from "@/lib/forecast/change-detection";
import { clearSkyGhiHour } from "@/lib/solar-engine/physics/solar-geometry";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const site = { latitude: 38, longitude: 33 };
const start = Date.UTC(2026, 3, 1);
const DAYS = 150;
const CAP = 40;

// Sentetik güneş santrali: üretim = kurulu güç × GHI / 1000; her 4. gün bulutlu (GHI açık göğün %30'u)
function plant(opts: { dead?: (d: number) => boolean; scale?: (d: number) => number; lon?: number } = {}): SolarObservedHour[] {
  const out: SolarObservedHour[] = [];
  for (let d = 0; d < DAYS; d++)
    for (let h = 0; h < 24; h++) {
      const t = start + d * DAY + h * HOUR;
      const cs = clearSkyGhiHour(site.latitude, opts.lon ?? site.longitude, t);
      const ghiTrue = cs * (d % 4 === 3 ? 0.3 : 0.9);
      const ghiAtSite = clearSkyGhiHour(site.latitude, site.longitude, t) * (d % 4 === 3 ? 0.3 : 0.9);
      const uevm = opts.dead?.(d) ? 0 : (CAP * ghiTrue * (opts.scale?.(d) ?? 1)) / 1000;
      out.push({ t, uevm, ghi: ghiAtSite });
    }
  return out;
}
const asOf = start + DAYS * DAY;

describe("kapasite değişimi (22.7 a)", () => {
  it("kayıt doğruysa uyarı yok; kaydı %10'dan fazla aşan üretim 'over'", () => {
    const hours = plant();
    expect(capacityChange(hours, CAP, asOf)).toBeNull();
    const w = capacityChange(hours, 25, asOf)!;
    expect(w.kind).toBe("capacity_over");
    expect(w.values.peakMwh).toBeGreaterThan(25 * 1.1);
  });

  it("son 30 gün önceki 90 günün en yükseğinin %60'ının altında: 'under'; az veride uyarı yok", () => {
    const hours = plant({ scale: (d) => (d >= DAYS - 30 ? 0.5 : 1) });
    expect(capacityChange(hours, null, asOf)?.kind).toBe("capacity_under");
    expect(capacityChange(hours.slice(0, 10 * 24), CAP, start + 10 * DAY)).toBeNull();
  });
});

describe("uzun arıza (22.7 b)", () => {
  it("açık gökte en az 2 gün sıfıra yakın üretim; bulutlu gün diziyi bozmaz", () => {
    // 100–104. günler (103 bulutlu) üretimsiz
    const w = longOutage(plant({ dead: (d) => d >= 100 && d <= 104 }), site)!;
    expect(w.kind).toBe("long_outage");
    expect(w.values.days).toBe(4);
    expect(w.ongoing).toBe(false);
  });

  it("sona kadar süren arıza 'sürüyor'; tek gün ya da hiç arıza uyarı vermez", () => {
    expect(longOutage(plant({ dead: (d) => d >= DAYS - 3 }), site)?.ongoing).toBe(true);
    expect(longOutage(plant({ dead: (d) => d === 100 }), site)).toBeNull();
    expect(longOutage(plant(), site)).toBeNull();
  });
});

describe("konum tutarsızlığı (22.7 c)", () => {
  it("doğru konumda uyarı yok; 10° doğuda kayıtlı santral ≈ 40 dk geç görünür", () => {
    expect(locationShift(plant(), site)).toBeNull();
    // Gerçek santral 33°D'de, kayıt 43°D diyor
    const w = locationShift(plant(), { latitude: 38, longitude: 43 })!;
    expect(w.kind).toBe("location_shift");
    expect(w.shiftMin).toBeGreaterThan(30);
    expect(w.shiftMin).toBeLessThan(50);
  });
});
