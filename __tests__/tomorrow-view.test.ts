import { describe, expect, it } from "vitest";
import { buildTomorrowView, type Series24 } from "@/lib/analysis/tomorrow-view";
import { inferPriceLimit } from "@/lib/analysis/price-limit";

const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const series = (f: (h: number) => number): Series24 => Array.from({ length: 24 }, (_, h) => f(h));
/** 2026-11-04 çarşamba; önceki 28 günün hepsi aynı seri (hafta içi günleri kıyasa girer) */
const history = (f: (h: number) => number) => new Map(Array.from({ length: 28 }, (_, i) => [shift("2026-11-04", -(i + 1)), series(f)] as const));
const base = { date: "2026-11-04", gopVolume: series(() => 20000) };

describe("buildTomorrowView", () => {
  it("referansa göre konum, ortalama sapma ve akşam–öğle farkını hesaplar", () => {
    const ref = (h: number) => 2000 + (h >= 18 && h <= 21 ? 1000 : 0);
    const v = buildTomorrowView({
      ...base,
      ptf: series((h) => ref(h) * 1.1),
      lep: series(() => 35000),
      ptfHistory: history(ref),
      lepHistory: history(() => 34000),
      limit: null,
    });
    expect(v.published).toEqual({ ptf: true, lep: true });
    expect(v.ptf.vsReferencePct).toBeCloseTo(10, 5);
    expect(v.ptf.hoursAbove).toBe(24);
    expect(v.ptf.eveningMinusNoon).toBeCloseTo(1100, 5);
    expect(v.ptf.refEveningMinusNoon).toBeCloseTo(1000, 5);
    expect(v.load.meanVsRefPct).toBeCloseTo((35000 / 34000 - 1) * 100, 5);
    expect(v.sentences.some((s) => s.includes("fiyat tahmini değildir"))).toBe(true);
  });

  it("tavandaki ve tavana yakın saatleri sayar", () => {
    const limit = inferPriceLimit([{ date: "2026-10-27", ptf: series(() => 4500) }])!;
    const ptf = series((h) => (h < 3 ? 4500 : h < 5 ? 4200 : h < 6 ? 0 : 2000));
    const v = buildTomorrowView({ ...base, ptf, lep: series(() => 30000), ptfHistory: history(() => 2000), lepHistory: history(() => 30000), limit });
    expect(v.ptf.capHours).toBe(3);
    expect(v.ptf.nearHours).toBe(2);
    expect(v.ptf.zeroHours).toBe(1);
    expect(v.sentences.join(" ")).toContain("3 saat fiyat limitinde");
  });

  it("PTF yayımlanmadıysa uyarı verir ve özet üretmez", () => {
    const v = buildTomorrowView({ ...base, ptf: Array(24).fill(null), lep: series(() => 30000), ptfHistory: history(() => 2000), lepHistory: history(() => 30000), limit: null });
    expect(v.published.ptf).toBe(false);
    expect(v.ptf.mean).toBeNull();
    expect(v.warnings.some((w) => w.includes("henüz yayımlanmadı"))).toBe(true);
    expect(v.sentences.join(" ")).not.toContain("zaten açıklandı");
  });

  it("kıyas günü yoksa konum null, uyarı var", () => {
    const v = buildTomorrowView({ ...base, ptf: series(() => 2000), lep: Array(24).fill(null), ptfHistory: new Map(), lepHistory: new Map(), limit: null });
    expect(v.rows.every((r) => r.position === null)).toBe(true);
    expect(v.warnings.some((w) => w.includes("Kıyas bandı yok"))).toBe(true);
    expect(v.warnings.some((w) => w.includes("yük tahmini henüz"))).toBe(true);
  });
});
