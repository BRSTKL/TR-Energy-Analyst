import { describe, expect, it } from "vitest";
import {
  forecastWind,
  persistenceWind,
  powerCurve,
  windIndex,
  type RegionWind,
} from "@/lib/ptf/wind";
import { shiftDay } from "@/lib/ptf/history";

describe("powerCurve", () => {
  it("3 m/s altında ve 25 m/s üstünde sıfır, 12–25 arası anma, arada artan", () => {
    expect(powerCurve(2.9)).toBe(0);
    expect(powerCurve(25)).toBe(0);
    expect(powerCurve(12)).toBe(1);
    expect(powerCurve(20)).toBe(1);
    expect(powerCurve(6)).toBeGreaterThan(powerCurve(5));
    expect(powerCurve(6)).toBeLessThan(1);
  });
});

describe("forecastWind", () => {
  const days: string[] = [];
  for (let d = "2026-03-01"; d <= "2026-04-30"; d = shiftDay(d, 1)) days.push(d);
  const speed = (d: string, h: number) =>
    6 + 4 * Math.sin(Date.parse(d) / 8.64e7 + h / 5);
  const regions: RegionWind[] = [
    {
      weight: 1,
      ws: new Map(
        days.map((d) => [d, Array.from({ length: 24 }, (_, h) => speed(d, h))])
      ),
    },
  ];
  const cap = 12000;
  const rt = new Map(
    days.map((d) => [
      d,
      Array.from({ length: 24 }, (_, h) => cap * powerCurve(speed(d, h))),
    ])
  );
  const index = (d: string) => windIndex(regions, d);

  it("yalnız T-2 ve öncesinin üretimini sorar, havayı izler, kalıcılıktan iyi", () => {
    const t = "2026-04-20";
    const asked: string[] = [];
    const known = (d: string) => (asked.push(d), rt.get(d)!);
    const f = forecastWind(t, known, index)!;
    expect(asked.every((d) => d <= shiftDay(t, -2))).toBe(true);
    const actual = rt.get(t)!;
    const err = (x: number[]) => x.reduce((s, v, h) => s + Math.abs(v - actual[h]), 0);
    expect(err(f)).toBeLessThan(err(persistenceWind(t, (d) => rt.get(d)!)!) * 0.2);
  });

  it("veri azsa kurmaz", () => {
    expect(forecastWind("2026-03-03", (d) => rt.get(d) ?? null, index)).toBeNull();
    expect(windIndex([{ weight: 1, ws: new Map() }], "2026-04-01")).toBeNull();
  });
});
