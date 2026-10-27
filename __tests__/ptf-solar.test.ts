import { describe, expect, it } from "vitest";
import {
  forecastSolar,
  irradianceIndex,
  proxySolar,
  type RegionDayWeather,
} from "@/lib/ptf/solar";
import { pickSolarRegions } from "@/lib/ptf/solar-regions";
import { shiftDay } from "@/lib/ptf/history";

const bell = (peak: number) =>
  Array.from({ length: 24 }, (_, h) =>
    h >= 6 && h <= 18 ? peak * Math.sin(((h - 6) / 12) * Math.PI) : 0
  );

describe("pickSolarRegions", () => {
  it("hücreleri kapasite ağırlıklı toplar, kalanı en yakın noktaya ekler, ağırlıklar 1'e toplanır", () => {
    const r = pickSolarRegions(
      [
        { lat: 37.5, lon: 32.5, mw: 100 },
        { lat: 37.7, lon: 32.9, mw: 300 },
        { lat: 39.2, lon: 30.1, mw: 50 },
        { lat: 37.9, lon: 33.6, mw: 10 }, // başka hücre, seçilmezse en yakına (ilk hücre) eklenir
      ],
      2
    );
    expect(r).toHaveLength(2);
    expect(r[0].mw).toBe(410);
    expect(r[0].lat).toBeCloseTo(37.65, 2);
    expect(r.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 9);
  });
});

describe("forecastSolar", () => {
  // Kurulu güç zamanla büyüyor: KGÜP = büyüme × 10 × ışınım; tahmin ölçeği son 28 günden öğrenmeli
  const days: string[] = [];
  for (let d = "2026-03-01"; d <= "2026-04-30"; d = shiftDay(d, 1)) days.push(d);
  const cloud = (d: string) => 0.6 + 0.4 * Math.abs(Math.sin(Date.parse(d) / 8.64e7));
  const ghi = new Map(days.map((d) => [d, bell(800 * cloud(d))]));
  const regions: RegionDayWeather[] = [{ weight: 1, ghi }];
  const growth = (d: string) =>
    1 + (Date.parse(d) - Date.parse("2026-03-01")) / 8.64e7 / 300;
  const kgup = new Map(days.map((d) => [d, ghi.get(d)!.map((x) => 10 * growth(d) * x)]));
  const index = (d: string) => irradianceIndex(regions, d);

  it("hava değişimini izler, vekilden çok daha iyi; hedef günün KGÜP'ünü kullanmaz", () => {
    const t = "2026-04-20";
    const seen: string[] = [];
    const f = forecastSolar(
      t,
      (d) => (seen.push(d), d < t ? kgup.get(d)! : null),
      index
    )!;
    expect(seen.every((d) => d < t)).toBe(true);
    const actual = kgup.get(t)!;
    const p = proxySolar(t, (d) => (d < t ? kgup.get(d)! : null))!;
    const err = (x: number[]) => x.reduce((s, v, h) => s + Math.abs(v - actual[h]), 0);
    expect(err(f)).toBeLessThan(err(p) * 0.3);
    expect(err(f) / actual.reduce((s, v) => s + v, 0)).toBeLessThan(0.05);
  });

  it("veri azsa ya da hava yoksa kurmaz", () => {
    expect(forecastSolar("2026-03-05", (d) => kgup.get(d) ?? null, index)).toBeNull();
    expect(forecastSolar("2026-05-15", (d) => kgup.get(d) ?? null, index)).toBeNull();
    expect(irradianceIndex([{ weight: 1, ghi: new Map() }], "2026-04-01")).toBeNull();
  });
});
