import { describe, expect, it } from "vitest";
import { measureEffects } from "@/lib/analysis/pre-bid-effects";
import type { DayData } from "@/lib/analysis/pre-bid";

const shift = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
let seed = 11;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296 - 0.5;
};
const series = (f: (h: number) => number) => Array.from({ length: 24 }, (_, h) => f(h));

/** Yapay dünya: PTF gerçek güneşe ve (gazEtkisi varsa) önceki günün gazına bağlı; KGÜP güneşi gerçeğe yakın değil (hava değişir) */
function world(gazEtkisi: number) {
  seed = 11;
  const days = new Map<string, DayData>();
  const gas = new Map<string, number>();
  const sunReal = new Map<string, number[]>();
  let g = 20000;
  for (let d = "2026-04-01"; d <= "2026-10-20"; d = shift(d, 1)) {
    g += 600 * rnd();
    gas.set(d, g);
    const lep = series(
      (h) => 30000 + 4000 * Math.sin(((h - 6) / 24) * 2 * Math.PI) + 500 * rnd()
    );
    const wind = series(() => 3500 + 2000 * rnd());
    const cloud = 0.5 + 0.5 * (rnd() + 0.5);
    const sun = series((h) => (h >= 8 && h <= 17 ? 9000 * cloud : 0));
    sunReal.set(d, sun);
    const sunK = series((h) => (h >= 8 && h <= 17 ? 6500 : 0));
    const prevGas = gas.get(shift(d, -1)) ?? g;
    const ptf = series(
      (h) =>
        2500 +
        0.06 * (lep[h] - wind[h] - sun[h] - 25000) +
        gazEtkisi * (prevGas - 20000) +
        40 * rnd()
    );
    days.set(d, { ptf, lep, wind, sunK, windF: wind.map((w) => w + 200 * rnd()) });
  }
  return { days, gas, sunReal };
}

describe("measureEffects", () => {
  it("gerçek güneşin işe yaradığını ve yaramayan gazı ayırt eder", () => {
    const w = world(0);
    const rows = measureEffects({ ...w, last: "2026-10-19" });
    const sun = rows.find((r) => r.id === "sunReal")!;
    expect(sun.verdict).toBe("better");
    expect(sun.improvementPct).toBeGreaterThan(5);
    const gas = rows.find((r) => r.id === "gas")!;
    expect(gas.verdict).not.toBe("better");
  });

  it("gerçekten etkili gazı iyileştirme olarak işaretler", () => {
    const w = world(0.3);
    const gas = measureEffects({ ...w, last: "2026-10-19" }).find((r) => r.id === "gas")!;
    expect(gas.verdict).toBe("better");
    expect(gas.betterDaysPct).toBeGreaterThan(55);
  });

  it("veri yoksa satır üretmez", () => {
    const w = world(0);
    const rows = measureEffects({
      days: w.days,
      gas: new Map(),
      sunReal: new Map(),
      last: "2026-10-19",
    });
    expect(rows).toEqual([]);
  });
});
