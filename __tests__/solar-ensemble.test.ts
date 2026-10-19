import { describe, expect, it } from "vitest";
import { fitEnsemble, meanInput, type NwpArchive } from "@/lib/solar-engine/models/ensemble";
import { emptyNwpYear } from "@/lib/weather/nwp-models";
import type { SolarHourV2 } from "@/lib/solar-engine/models/production-model-v2";

const site = { latitude: 38, longitude: 33 };
const HOUR = 3_600_000;
const start = Date.UTC(2026, 3, 1);

// 90 gün: gerçek ışınım; ECMWF doğru, ICON-EU hafif gürültülü, GFS çok gürültülü. Üretim gerçek ışınımla orantılı.
const noise = (i: number, k: number) => Math.sin(i * 12.9898 + k * 78.233) * 0.5 + Math.sin(i * 0.37 + k) * 0.5;
const hours: SolarHourV2[] = [];
const icon = emptyNwpYear(1, 2026, "icon_eu", 38, 33);
const gfs = emptyNwpYear(1, 2026, "gfs_global", 38, 33);
for (let d = 0; d < 90; d++)
  for (let h = 0; h < 24; h++) {
    const t = start + (d * 24 + h) * HOUR;
    const sky = 0.55 + 0.45 * Math.abs(Math.sin(d * 1.7));
    const truth = h >= 6 && h <= 18 ? 1000 * Math.sin(((h - 5.5) / 13) * Math.PI) * sky : 0;
    const i = (t - Date.parse(icon.start)) / HOUR;
    const set = (doc: typeof icon, g: number) => {
      doc.series.ghi[i] = g;
      doc.series.direct[i] = g * 0.75;
      doc.series.diffuse[i] = g * 0.25;
      doc.series.temp[i] = 20;
      doc.series.cloud[i] = 30;
    };
    set(icon, Math.max(0, truth * (1 + 0.15 * noise(i, 1))));
    set(gfs, Math.max(0, truth * (1 + 0.6 * noise(i, 2))));
    hours.push({ t, uevm: truth * 0.04, kgupFirst: null, kgupFinal: null, ptf: 2000, ghi: truth, direct: truth * 0.75, diffuse: truth * 0.25, temp: 20, cloud: 30, weatherLead: 2, lag48: null, ghiLag48: null, directLag48: null, diffuseLag48: null });
  }
const nwp: NwpArchive = new Map([
  ["icon_eu", new Map([[2026, icon]])],
  ["gfs_global", new Map([[2026, gfs]])],
]);

describe("üç hava modelli birleşim", () => {
  const valFrom = start + 60 * 24 * HOUR;
  const ens = fitEnsemble(hours, nwp, site, () => false, valFrom);

  it("ağırlık doğru modele en çok, gürültülüye en az; toplam 1", () => {
    expect(ens.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(ens.weights[0]).toBeGreaterThan(ens.weights[1]);
    expect(ens.weights[1]).toBeGreaterThan(ens.weights[2]);
  });

  it("bir modelin verisi yoksa birleşim yok; girdi ortalaması eksikte null", () => {
    const noon = hours.find((h) => new Date(h.t).getUTCHours() === 12)!;
    const live = { ...noon, live: true };
    const p = ens.predict([live, live, live]);
    expect(p.mean).not.toBeNull();
    expect(p.weighted).not.toBeNull();
    const q = ens.predict([live, null, live]);
    expect(q.mean).toBeNull();
    expect(q.weighted).toBeNull();
    expect(q.input).toBeNull();
    expect(meanInput([live, { ...live, ghi: null }, live])).toBeNull();
    // Canlıda eksik saat ECMWF tahminine düşer: birleşim temel sürümle aynı saatlerde değer verir
    const r = ens.predict([live, { ...live, ghi: null }, live], true);
    expect(r.mean).toBe(r.sources[0]);
    expect(r.weighted).toBe(r.sources[0]);
    expect(r.input).toBe(r.sources[0]);
  });

  it("canlı saat eğitime giremez", () => {
    expect(() => fitEnsemble([{ ...hours[0], live: true }, ...hours], nwp, site, () => false, valFrom)).toThrow();
  });
});
