import { describe, expect, it } from "vitest";
import { cellTemp, dcFraction, perezDiffuse, poaPerez } from "@/lib/solar-engine/physics/pv-chain";
import { planeOfArray } from "@/lib/solar-engine/physics/solar-geometry";
import { fitPhysicalModel } from "@/lib/solar-engine/models/physical";
import type { SolarHourV2 } from "@/lib/solar-engine/models/production-model-v2";

const site = { latitude: 38, longitude: 33 };
// 20 Haziran 2026, Türkiye duvar saati (UTC alanlarında)
const wall = (h: number, d = 20) => Date.UTC(2026, 5, d, h);

describe("fiziksel zincir", () => {
  it("Perez: açık gök öğle, eğik panelde makul; dağınık ışınım eksi olmaz", () => {
    const poa = poaPerez(site.latitude, site.longitude, wall(12), 950, 820, 130, { kind: "fixed", tiltDeg: 20 });
    expect(poa).toBeGreaterThan(850);
    expect(poa).toBeLessThan(1100);
    expect(perezDiffuse(100, 0, 1.4, -0.2, 0.5, wall(6))).toBeGreaterThanOrEqual(0);
    // Gece sıfır
    expect(poaPerez(site.latitude, site.longitude, wall(23), 0, 0, 0, { kind: "tracker" })).toBe(0);
  });

  it("izotropik modele yakın ama aynı değil; takip sabah sabit panelden fazla toplar", () => {
    const iso = planeOfArray(site.latitude, site.longitude, wall(12), 950, 820, 130, { kind: "fixed", tiltDeg: 20 });
    const per = poaPerez(site.latitude, site.longitude, wall(12), 950, 820, 130, { kind: "fixed", tiltDeg: 20 });
    expect(Math.abs(per - iso) / iso).toBeLessThan(0.1);
    expect(per).not.toBe(iso);
    const fixed = poaPerez(site.latitude, site.longitude, wall(8), 400, 300, 100, { kind: "fixed", tiltDeg: 20 });
    const track = poaPerez(site.latitude, site.longitude, wall(8), 400, 300, 100, { kind: "tracker" });
    expect(track).toBeGreaterThan(fixed);
  });

  it("sıcaklık verimi düşürür", () => {
    expect(cellTemp(800, 25)).toBeCloseTo(50, 6);
    expect(dcFraction(1000, 35)).toBeLessThan(dcFraction(1000, 5));
    expect(dcFraction(1000, 25 - (1000 * 25) / 800)).toBeCloseTo(1, 6);
  });
});

describe("fiziksel model", () => {
  // Bilinen ölçek 50 MW, AC tavanı 40 MW: üretim = min(50 × DC oranı, 40)
  const hours: SolarHourV2[] = [];
  for (let d = 1; d <= 25; d++)
    for (let h = 6; h <= 18; h++) {
      const ghi = Math.max(0, 1000 * Math.sin(((h - 5.5) / 13) * Math.PI)) * (0.7 + 0.3 * ((d * 7) % 5) / 4);
      const base: SolarHourV2 = {
        t: wall(h, d),
        uevm: null,
        kgupFirst: null,
        kgupFinal: null,
        ptf: 2000,
        ghi,
        direct: ghi * 0.8,
        diffuse: ghi * 0.2,
        temp: 25,
        cloud: 10,
        weatherLead: 2,
        lag48: null,
        ghiLag48: null,
        directLag48: null,
        diffuseLag48: null,
      };
      const x = dcFraction(poaPerez(site.latitude, site.longitude, base.t, ghi, ghi * 0.8, ghi * 0.2, { kind: "fixed", tiltDeg: 20 }), 25);
      hours.push({ ...base, uevm: Math.min(40, 50 * Math.max(0, x)) });
    }

  it("ölçeği, kurulumu ve kırpılmayı geri bulur; kayıtlı tavan eğitimdeki en yüksekten küçükse ikincisi", () => {
    const m = fitPhysicalModel(hours, site, { recordedCapacityMw: 40 });
    expect(m.mount).toBe("sabit-20");
    expect(m.scale).toBeCloseTo(50, 0);
    expect(m.acCapMw).toBe(40);
    const noon = hours.find((h) => new Date(h.t).getUTCHours() === 12 && h.uevm === 40)!;
    expect(m.predict(noon)).toBe(40);
    expect(fitPhysicalModel(hours, site, { recordedCapacityMw: 30 }).acCapMw).toBe(40);
    expect(fitPhysicalModel(hours, site).acCapSource).toBe("eğitim en yüksek");
  });

  it("karma: bulutlu saatlerde hava modelinin sistematik fazlasını düzeltir, tavanı aşmaz", () => {
    // Bulutlu (cloud 80) saatlerde gerçek üretim fiziğin %70'i: saf fizik bunu öğrenemez, karma öğrenir
    const biased = hours.map((h, i) => (i % 3 === 0 ? { ...h, cloud: 80, uevm: h.uevm! * 0.7 } : h));
    const err = (m: ReturnType<typeof fitPhysicalModel>) => biased.reduce((s, h) => s + Math.abs((m.predict(h) ?? 0) - h.uevm!), 0);
    const pure = fitPhysicalModel(biased, site, { recordedCapacityMw: 40 });
    const hyb = fitPhysicalModel(biased, site, { recordedCapacityMw: 40, hybrid: true });
    expect(err(hyb)).toBeLessThan(err(pure) * 0.6);
    expect(Math.max(...biased.map((h) => hyb.predict(h) ?? 0))).toBeLessThanOrEqual(40);
    expect(() => fitPhysicalModel([{ ...biased[0], live: true }, ...biased], site, { hybrid: true })).toThrow();
  });

  it("canlı saat eğitime giremez; hava eksikse tahmin yok", () => {
    expect(() => fitPhysicalModel([{ ...hours[0], live: true }, ...hours], site)).toThrow();
    const m = fitPhysicalModel(hours, site);
    expect(m.predict({ ...hours[5], ghi: null })).toBeNull();
  });
});
