import { describe, expect, it } from "vitest";
import { buildPreBid, type DayData, type PreBidInput } from "@/lib/analysis/pre-bid";
import { inferPriceLimit } from "@/lib/analysis/price-limit";

const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
let seed = 7;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296 - 0.5;
};
const series = (f: (h: number) => number) => Array.from({ length: 24 }, (_, h) => f(h));

/** Yapay veri: PTF = 2500 + 0,06 × (net yük − 30000) + 0,4 × dünkü artık + gürültü; rüzgâr tahmini = gerçek + küçük hata */
function world(from: string, to: string, noise = 60) {
  seed = 7;
  const days = new Map<string, DayData>();
  const resid = new Map<string, number>();
  for (let d = from; d <= to; d = shift(d, 1)) {
    const lep = series((h) => 30000 + 4000 * Math.sin(((h - 6) / 24) * 2 * Math.PI) + 800 * rnd());
    const wind = series(() => 3500 + 2500 * rnd());
    const sunK = series((h) => (h >= 8 && h <= 17 ? 9000 : 0));
    const windF = d >= "2026-06-01" ? wind.map((w) => w + 250 * rnd()) : null;
    const nl = lep.map((v, h) => v - wind[h] - sunK[h]);
    const prev = resid.get(shift(d, -1)) ?? 0;
    const ptf = nl.map((v) => 2500 + 0.06 * (v - 30000) + 0.4 * prev + noise * rnd());
    resid.set(d, ptf.reduce((s, v) => s + v, 0) / 24 - 2500);
    days.set(d, { ptf, lep, wind, sunK, windF });
  }
  return days;
}

const base = (date: string, over: Partial<PreBidInput> = {}): PreBidInput => {
  const days = world("2026-04-01", shift(date, -1));
  const prevPtf = days.get(shift(date, -1))!.ptf!;
  const lep = series((h) => 30000 + 4000 * Math.sin(((h - 6) / 24) * 2 * Math.PI));
  return { date, days, target: { lep, windF: series(() => 3500) }, prevPtf, limit: null, ...over };
};

describe("buildPreBid", () => {
  it("girdi eksikse neden söyleyerek reddeder", () => {
    const i = base("2026-09-16");
    expect(buildPreBid({ ...i, target: { lep: null, windF: i.target.windF } })).toMatchObject({ ok: false });
    expect(buildPreBid({ ...i, target: { lep: i.target.lep, windF: null } })).toMatchObject({ ok: false });
  });

  it("benzer gün yoksa (arife, bayram) kurmaz", () => {
    const v = buildPreBid(base("2026-05-26")); // 2026 Kurban Bayramı arifesi
    expect(v.ok).toBe(false);
    expect((v as { reason: string }).reason).toContain("benzer gün");
  });

  it("net yük ve dünkü artık ilişkisini öğrenir, referanstan daha iyi tahmin eder", () => {
    const v = buildPreBid(base("2026-09-16"));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.coefficients.load).toBeGreaterThan(0.03);
    expect(v.coefficients.load).toBeLessThan(0.09);
    expect(v.backtest!.improvementPct).toBeGreaterThan(10);
    expect(v.backtest!.betterDaysPct).toBeGreaterThan(60);
    expect(v.rows.every((r) => r.lo! <= r.hi!)).toBe(true);
  });

  it("± aralık gerçek fiyatın büyük kısmını kapsar (geçmiş günde deneme)", () => {
    const i = base("2026-09-16");
    const days = world("2026-04-01", "2026-09-16");
    const input: PreBidInput = { ...i, days, actual: days.get("2026-09-16")!.ptf, target: { lep: days.get("2026-09-16")!.lep, windF: days.get("2026-09-16")!.windF }, prevPtf: days.get("2026-09-15")!.ptf };
    const v = buildPreBid(input);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.summary.actualCheck!.inInterval).toBeGreaterThanOrEqual(14);
    expect(v.summary.actualCheck!.mae).toBeLessThan(v.summary.actualCheck!.baselineMae);
  });

  it("hedef gün ve sonrası ile gerçekleşen fiyat beklentiyi değiştirmez (sızıntı yok)", () => {
    const a = buildPreBid(base("2026-09-16"));
    const i = base("2026-09-16");
    const future = world("2026-04-01", "2026-09-20");
    const leaked = buildPreBid({ ...i, days: future, actual: Array(24).fill(99999) });
    expect(a.ok && leaked.ok).toBe(true);
    if (!a.ok || !leaked.ok) return;
    expect(leaked.rows.map((r) => r.expected)).toEqual(a.rows.map((r) => r.expected));
  });

  it("fiyat limitiyle kırpar ve üst ucun tavana dayandığı saatleri sayar", () => {
    const limit = inferPriceLimit([{ date: "2026-09-01", ptf: Array(24).fill(1800) }])!;
    const v = buildPreBid(base("2026-09-16", { limit }));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.rows.every((r) => r.expected! <= 1800 && r.hi! <= 1800)).toBe(true);
    expect(v.summary.hiAtCapHours).toBeGreaterThan(0);
  });
});
