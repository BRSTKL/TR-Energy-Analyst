import { describe, expect, it } from "vitest";
import { detectWindLoss, fitPowerCurve, hourMeanWind, type WindLossInput } from "@/lib/forecast/wind-loss";

const HOUR = 3_600_000;
const T0 = Date.UTC(2025, 0, 1);
/** 50 MW santral: 3 m/s'de başlar, 12 m/s'de tam güç */
const curve = (ws: number) => (ws < 3 ? 0 : ws >= 12 ? 50 : (50 * (ws - 3) ** 3) / 9 ** 3);

function synth(days: number, edit?: (h: WindLossInput, i: number) => void): WindLossInput[] {
  const out: WindLossInput[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < days * 24; i++) {
    const ws = 2 + 12 * rnd();
    const dir = 360 * rnd();
    const u = curve(ws) * (0.9 + 0.2 * rnd());
    const h: WindLossInput = { t: T0 + i * HOUR, uevm: u, kgupFirst: u, ws, dir, ptf: 2000 };
    edit?.(h, i);
    out.push(h);
  }
  return out;
}

describe("rüzgâr kaybı", () => {
  it("güç eğrisi hücre medyanı; boş hücrede hız dilimi", () => {
    const f = fitPowerCurve(Array.from({ length: 40 }, (_, i) => ({ uevm: i < 20 ? 10 : 30, ws: 8.2, dir: i < 20 ? 10 : 100 })));
    expect(f(8.1, 5)).toBe(10); // yön dilimi 0
    expect(f(8.1, 95)).toBe(30); // yön dilimi 2
    expect(f(8.1, 200)).toBe(20); // hücre yok → hız dilimi medyanı
    expect(f(20, 0)).toBeNull();
  });

  it("arıza (plansız) ve kısıntı (planlı) saatleri bulunur, normal saatler kayıp sayılmaz", () => {
    const hours = synth(120, (h, i) => {
      if (i >= 500 && i < 548) h.uevm = 0; // 2 gün arıza: ilk KGÜP normal
      if (i >= 1000 && i < 1024) {
        h.uevm = 0;
        h.kgupFirst = 0; // önceden bildirilen kısıntı
      }
    });
    const r = detectWindLoss(hours, 50);
    const lostIn = (a: number, b: number) => Array.from(r.lost.keys()).filter((t) => t >= T0 + a * HOUR && t < T0 + b * HOUR);
    const strong = (a: number, b: number) => hours.slice(a, b).filter((h) => curve(h.ws!) >= 0.3 * 50 / 0.95).length;
    expect(lostIn(500, 548).length).toBeGreaterThanOrEqual(strong(500, 548) - 2);
    expect(lostIn(500, 548).every((t) => r.lost.get(t) === "unplanned")).toBe(true);
    expect(lostIn(1000, 1024).every((t) => r.lost.get(t) === "planned")).toBe(true);
    expect(r.lost.size - lostIn(500, 548).length - lostIn(1000, 1024).length).toBe(0);
    expect(r.dailyR).toBeGreaterThan(0.9);
  });

  it("devreye alma öncesi kayıp sayılmaz; beklenen kurulu güçle sınırlı", () => {
    const hours = synth(60, (h, i) => {
      if (i < 240) h.uevm = 0;
    });
    const r = detectWindLoss(hours, 50, { steadyFrom: T0 + 240 * HOUR });
    expect(Array.from(r.lost.keys()).some((t) => t < T0 + 240 * HOUR)).toBe(false);
    expect(Math.max(...r.expected.values())).toBeLessThanOrEqual(50);
  });

  it("saat ortalaması: hız ortalaması, yön vektör ortalaması (350° ve 10° → 0°)", () => {
    const m = hourMeanWind(7, 7, 350, 10);
    expect(m.ws).toBe(7);
    expect(Math.min(m.dir!, 360 - m.dir!)).toBeLessThan(1);
    expect(hourMeanWind(null, 8, 0, 0).ws).toBeNull();
  });
});
