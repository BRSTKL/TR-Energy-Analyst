import { describe, it, expect } from "vitest";
import { clearSkyGhiHour, solarElevation } from "@/lib/solar-engine/physics/solar-geometry";
import { fitSolarModel, solarFeatures, steadyFrom, type SolarHour } from "@/lib/solar-engine/models/production-model";
import { leakingFeatures, TR_UTC_OFFSET_MS } from "@/lib/forecast/info-time";

const H = 3_600_000;
const DAY = 24 * H;
const site = { latitude: 37.8, longitude: 33.6 }; // Karapınar
const wall = (s: string) => Date.parse(`${s}:00Z`);

/** Tohumlu sözde rastgele (testler tekrarlanabilir) */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

/** Sentetik saatler: GHI = açık gök × bulut payı; üretim = 0,05 × GHI (MWh), üst sınırla */
function synthetic(days: number, start = wall("2025-06-01T00:00"), opts: { cap?: number; ptf?: (i: number) => number } = {}): SolarHour[] {
  const r = rng(7);
  const out: SolarHour[] = [];
  for (let i = 0; i < days * 24; i++) {
    const t = start + i * H;
    const cs = clearSkyGhiHour(site.latitude, site.longitude, t);
    const ghi = cs * (0.5 + 0.5 * r());
    out.push({
      t,
      uevm: Math.min(opts.cap ?? Infinity, 0.05 * ghi),
      kgupFirst: null,
      kgupFinal: null,
      ptf: opts.ptf ? opts.ptf(i) : 2000,
      ghi,
      direct: ghi * 0.7,
      diffuse: ghi * 0.3,
      temp: 25,
      cloud: 20,
      lag48: null,
      ghiLag48: null,
    });
  }
  for (let i = 48; i < out.length; i++) {
    out[i].lag48 = out[i - 48].uevm;
    out[i].ghiLag48 = out[i - 48].ghi;
  }
  return out;
}

describe("Güneş konumu (15.4)", () => {
  it("Karapınar 21 Haziran öğlen yüksekliği ≈ 90 − 37,8 + 23,44 = 75,6°; gece açık gök 0", () => {
    // Güneş öğlesi ≈ 12:00 − (33,6° − 45°) × 4 dk ≈ 12:46 TR (denklem süresi ≈ −1,5 dk)
    const noon = Date.UTC(2025, 5, 21, 12, 47) - TR_UTC_OFFSET_MS;
    expect(Math.abs(solarElevation(site.latitude, site.longitude, noon) - 75.6)).toBeLessThan(0.5);
    expect(clearSkyGhiHour(site.latitude, site.longitude, wall("2025-06-21T00:00"))).toBe(0);
    expect(clearSkyGhiHour(site.latitude, site.longitude, wall("2025-06-21T12:00"))).toBeGreaterThan(900);
  });
});

describe("Güneş üretim modeli (15.4)", () => {
  it("bütün özellikler günün 24 saatinde kesimden önce elde (sızıntı yok)", () => {
    for (const h of synthetic(1, wall("2025-06-21T00:00"))) {
      const f = solarFeatures(h, site)!;
      expect(leakingFeatures(f.info, h.t)).toEqual([]);
    }
  });

  it("doğrusal ilişkiyi öğrenir; gece 0; tahmin eğitimdeki en yüksek üretimi aşmaz", () => {
    const hours = synthetic(60);
    const m = fitSolarModel(hours.slice(0, 40 * 24), site);
    const test = hours.slice(40 * 24);
    let err = 0;
    let n = 0;
    for (const h of test) {
      const p = m.predict(h)!;
      if (h.ghi! < 1 && clearSkyGhiHour(site.latitude, site.longitude, h.t) < 1) expect(p).toBe(0); // gece: güneş yok
      else {
        err += Math.abs(p - h.uevm!);
        n++;
      }
    }
    expect(err / n).toBeLessThan(1.5); // ortalama üretim ≈ 25 MWh; mutlak hata %6'nın altında
    const hot = { ...test[12], ghi: 5000, direct: 3500, diffuse: 1500 };
    expect(m.predict(hot)).toBe(m.trainMaxMwh);
    expect(m.excluded.night).toBeGreaterThan(0);
  });

  it("sıfır fiyatlı saatler ve devreye alma dönemi eğitimden çıkar; eksik hava null", () => {
    // İlk 10 gün yarım güç (devreye alma), her 5. saat PTF 0
    const hours = synthetic(50, undefined, { ptf: (i) => (i % 5 === 0 ? 0 : 2000) });
    for (const h of hours.slice(0, 10 * 24)) h.uevm = h.uevm! * 0.5;
    const m = fitSolarModel(hours, site);
    expect(m.excluded.zeroPrice).toBeGreaterThan(0);
    expect(m.excluded.commissioning).toBeGreaterThan(0);
    expect(m.steadyFrom).toBe(wall("2025-06-11T00:00"));
    expect(m.predict({ ...hours[100], ghi: null })).toBeNull();
  });

  it("steadyFrom: günlük en yüksek üretimin %80'ine ilk ulaşılan gün", () => {
    const d0 = wall("2025-01-01T00:00");
    const hrs = [10, 30, 85, 100, 90].map((v, i) => ({ t: d0 + i * DAY + 12 * H, uevm: v }));
    expect(steadyFrom(hrs)).toBe(d0 + 2 * DAY);
    expect(steadyFrom([{ t: d0, uevm: null }])).toBeNull();
  });
});
