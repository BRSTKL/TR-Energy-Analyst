import { describe, it, expect } from "vitest";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/solar-engine/models/production-model-v2";
import { LeakageError } from "@/lib/forecast/info-time";

const HOUR = 3_600_000;
const site = { latitude: 37.7, longitude: 33.5 };

/** Yapay eğitim verisi: 40 gün, gündüz ışınımı sinüs, üretim ışınımla orantılı */
function hours(days = 40): SolarHourV2[] {
  const out: SolarHourV2[] = [];
  const t0 = Date.UTC(2026, 5, 1);
  for (let i = 0; i < days * 24; i++) {
    const t = t0 + i * HOUR;
    const h = new Date(t).getUTCHours();
    const day = Math.max(0, Math.sin(((h - 5) / 14) * Math.PI));
    const cloud = (i * 37) % 100;
    const ghi = 900 * day * (1 - cloud / 200);
    out.push({
      t,
      uevm: ghi * 0.01,
      kgupFirst: ghi * 0.01,
      kgupFinal: null,
      ptf: 2000,
      ghi,
      direct: ghi * 0.7,
      diffuse: ghi * 0.3,
      temp: 25,
      cloud,
      lag48: i >= 48 ? 900 * Math.max(0, Math.sin(((h - 5) / 14) * Math.PI)) * 0.008 : null,
      ghiLag48: ghi,
      directLag48: ghi * 0.7,
      diffuseLag48: ghi * 0.3,
      weatherLead: 2,
    });
  }
  return out;
}

describe("Canlı tahmin seçenekleri (live, noLag)", () => {
  it("eğitimde canlı saat kabul edilmez", () => {
    const train = hours();
    train[100] = { ...train[100], live: true };
    expect(() => fitSolarModelV2(train, site)).toThrow(/Canlı tahmin saati/);
  });

  it("canlı olmayan saatte bilgi zamanı denetimi sürer; canlı saatte atlanır", () => {
    const m = fitSolarModelV2(hours(), site, { noLag: true });
    const future = { ...hours(1)[12], t: Date.UTC(2026, 9, 17, 12), weatherLead: 0 as const };
    expect(() => m.predict(future)).toThrow(LeakageError);
    expect(m.predict({ ...future, live: true })).toBeGreaterThan(0);
  });

  it("kalıcılıksız model 48 saat önceki üretimden bağımsız ve girdiyi değiştirmez", () => {
    const train = hours();
    const before = train.map((h) => h.lag48);
    const m = fitSolarModelV2(train, site, { noLag: true });
    expect(train.map((h) => h.lag48)).toEqual(before);
    const h = train[24 * 30 + 12];
    expect(m.predict({ ...h, lag48: 0 })).toBeCloseTo(m.predict({ ...h, lag48: 50 })!, 9);
  });
});
