import { describe, expect, it } from "vitest";
import { fitWindEnsemble, meanWind, type WindEnsembleHour } from "@/lib/wind-engine/models/ensemble";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CAP = 40;
const power = (ws: number) => (ws < 3 || ws > 25 ? 0 : Math.min(CAP, CAP * ((ws - 3) / 9) ** 3));

// Gerçek hız bilinir; üç hava modeli onu farklı hatayla görür: ECMWF σ = 0,8, ICON-EU σ = 1,6, GFS +1,5 m/s sapma ve σ = 2,5
function synth(days: number, startT: number, seed: number): WindEnsembleHour[] {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
  const out: WindEnsembleHour[] = [];
  for (let i = 0; i < days * 24; i++) {
    const t = startT + i * HOUR;
    const truth = 2 + 12 * r();
    const dir = 360 * r();
    const e = Math.max(0, truth + 0.8 * gauss());
    const icon = Math.max(0, truth + 1.6 * gauss());
    const gfs = Math.max(0, truth + 1.5 + 2.5 * gauss());
    out.push({
      t,
      uevm: power(truth),
      kgupFirst: null,
      ptf: 2000,
      ws: { d1: e, d2: e },
      dir: { d1: dir, d2: dir },
      src: { ecmwf_ifs025: { ws: e, dir }, icon_eu: { ws: icon, dir }, gfs_global: { ws: gfs, dir } },
    });
  }
  return out;
}

describe("rüzgârda birden çok hava modeli (23.4)", () => {
  const testStart = Date.UTC(2026, 0, 1);
  const trainingEnd = testStart - DAY;
  const train = synth(240, Date.UTC(2025, 4, 1), 7).filter((h) => h.t < trainingEnd);
  const test = synth(60, testStart, 11);
  const opts = { trainingEnd, validationFrom: trainingEnd - 30 * DAY };
  const m = fitWindEnsemble(train, CAP, opts);
  const mae = (f: (h: WindEnsembleHour) => number | null) => test.reduce((s, h) => s + Math.abs((f(h) ?? 0) - h.uevm!), 0) / test.length;

  it("ağırlık en iyi modele en çok; birleşim en kötü tek modelden iyi, sınırlar korunur", () => {
    expect(m.weights[0]).toBeGreaterThan(m.weights[1]);
    expect(m.weights[1]).toBeGreaterThan(m.weights[2]);
    expect(m.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    const worst = Math.max(...[0, 1, 2].map((i) => mae((h) => m.predict(h).sources[i])));
    for (const k of ["mean", "speed", "weighted"] as const) expect(mae((h) => m.predict(h)[k])).toBeLessThan(worst);
    expect(mae((h) => m.predict(h).weighted)).toBeLessThan(mae((h) => m.predict(h).mean));
    for (const h of test.slice(0, 500)) {
      const p = m.predict(h);
      for (const v of [p.mean, p.speed, p.weighted, ...p.sources]) {
        if (v === null) continue;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(CAP);
      }
      expect(p.spreadMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("canlı yol gelecekte aynı fiziksel tahmini verir; geçmiş ve gerçekleşenli girdiyi reddeder", () => {
    const h = test[0];
    expect(m.predictLive({ ...h, uevm: null, live: true }, h.t - 2 * DAY)).toEqual(m.predict(h));
    expect(() => m.predictLive(h, h.t - 2 * DAY)).toThrow();
    expect(() => m.predictLive({ ...h, uevm: null }, h.t)).toThrow();
  });

  it("aynı veriyle aynı sonuç", () => {
    const m2 = fitWindEnsemble(train, CAP, opts);
    expect(m2.weights).toEqual(m.weights);
    for (const h of test.slice(0, 100)) expect(m2.predict(h)).toEqual(m.predict(h));
  });

  it("eksik model: geriye dönük testte null, canlıda kalan modellerle", () => {
    const h = { ...test[5], src: { ...test[5].src, gfs_global: { ws: null, dir: null } } };
    expect(m.predict(h).weighted).toBeNull();
    const live = m.predict(h, true);
    expect(live.weighted).not.toBeNull();
    expect(live.sources[2]).toBeNull();
  });

  it("eğitimde kesimden sonraki üretim hata verir", () => {
    expect(() => fitWindEnsemble([...train, ...synth(1, trainingEnd, 3)], CAP, opts)).toThrow();
  });

  it("vektör ortalaması: 350° ve 10° → 0°", () => {
    const w = meanWind([
      { ws: 5, dir: 350 },
      { ws: 5, dir: 10 },
    ]);
    expect(Math.min(w.dir!, 360 - w.dir!)).toBeLessThan(1e-6);
    expect(meanWind([{ ws: null, dir: 3 }]).ws).toBeNull();
  });
});
