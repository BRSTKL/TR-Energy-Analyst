import { describe, expect, it } from "vitest";
import { LeakageError, PtfView, shiftDay, type PtfDay } from "@/lib/ptf/history";
import { buildFeatures, FEATURE_NAMES, inferCap } from "@/lib/ptf/features";
import { FeatureCache, gbmModel, learModel, referenceModels } from "@/lib/ptf/models";
import { compare, replay, scoreModels } from "@/lib/ptf/replay";

let seed = 3;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296 - 0.5;
};
const series = (f: (h: number) => number) => Array.from({ length: 24 }, (_, h) => f(h));

/** Yapay dünya: PTF = 2000 + 0,08 × (yük − rüzgâr − güneş − 25000) + gürültü; rüzgâr tahmini = gerçek + hata */
function world(from: string, to: string) {
  seed = 3;
  const days = new Map<string, PtfDay>();
  for (let d = from; d <= to; d = shiftDay(d, 1)) {
    const lep = series(
      (h) => 32000 + 5000 * Math.sin(((h - 7) / 24) * 2 * Math.PI) + 600 * rnd()
    );
    const wind = series(() => 4000 + 3000 * rnd());
    const sun = series((h) => (h >= 7 && h <= 17 ? 8000 * (0.7 + 0.3 * rnd()) : 0));
    const ptf = lep.map((l, h) =>
      Math.max(
        0,
        Math.min(4500, 2000 + 0.08 * (l - wind[h] - sun[h] - 25000) + 80 * rnd())
      )
    );
    days.set(d, {
      ptf,
      lep,
      cons: lep.map((x) => x + 300 * rnd()),
      windRt: wind,
      sunRt: sun.map((x) => x * 0.6),
      kgup: {
        sun,
        naturalGas: series(() => 9000),
        importedCoal: series(() => 5000),
        lignite: series(() => 4000),
        dam: series(() => 3000),
        river: series(() => 1500),
      },
      windF: wind.map((x) => x + 600 * rnd()),
      gas: 20000,
    });
  }
  return days;
}

describe("PtfView: bilgi zamanı kuralı", () => {
  const days = world("2026-01-01", "2026-03-31");
  const v = new PtfView(days, "2026-03-10");

  it("hedef günün PTF'si, tüketimi ve gerçek zamanlı rüzgârı okunamaz; dünün PTF'si okunur", () => {
    expect(() => v.series("ptf", "2026-03-10")).toThrow(LeakageError);
    expect(v.series("ptf", "2026-03-09")).not.toBeNull();
    expect(() => v.series("cons", "2026-03-09")).toThrow(LeakageError); // T-1 tüketimi kesimde tam değil
    expect(v.series("cons", "2026-03-08")).not.toBeNull();
    expect(() => v.series("windRt", "2026-03-10")).toThrow(LeakageError);
    expect(v.series("lep", "2026-03-10")).not.toBeNull(); // yük planı hedef gün için yayımlı
    expect(() => v.kgup("naturalGas", "2026-03-10")).toThrow(LeakageError); // termik plan fiyattan sonra
    expect(v.kgup("naturalGas", "2026-03-09")).not.toBeNull();
  });

  it("kusursuz girdi tanısı yalnız açılan alanı açar: güneş açılınca termik KGÜP kapalı kalır", () => {
    const o = new PtfView(days, "2026-03-10", new Set(["kgupSun"]));
    expect(o.kgup("sun", "2026-03-10")).not.toBeNull();
    expect(() => o.kgup("naturalGas", "2026-03-10")).toThrow(LeakageError);
  });

  it("özellikler hedef günün PTF'sinden bağımsızdır (hedef PTF'yi değiştirmek özellikleri değiştirmez)", () => {
    const f1 = buildFeatures(new PtfView(days, "2026-03-10"))!;
    const changed = new Map(days);
    changed.set("2026-03-10", {
      ...days.get("2026-03-10")!,
      ptf: series(() => 99999),
      cons: series(() => 1),
      windRt: series(() => 1),
    });
    const f2 = buildFeatures(new PtfView(changed, "2026-03-10"))!;
    expect(f2.rows).toEqual(f1.rows);
    expect(f1.rows[0]).toHaveLength(FEATURE_NAMES.length);
    expect(f1.rows.flat().every((x) => Number.isFinite(x))).toBe(true);
  });

  it("tavan, son 60 günde en az 3 saat görülen en yüksek fiyattır", () => {
    const d = world("2026-01-01", "2026-03-31");
    for (const k of ["2026-03-01", "2026-03-02"]) {
      const p = [...d.get(k)!.ptf!];
      p[18] = 4500;
      p[19] = 4500;
      d.set(k, { ...d.get(k)!, ptf: p });
    }
    expect(inferCap(new PtfView(d, "2026-03-10"))).toBe(4500);
  });
});

describe("modeller ve yeniden oynatma", () => {
  const days = world("2025-06-01", "2026-03-31");
  const ctx = { days };
  const cache = new FeatureCache(ctx);
  const models = [
    ...referenceModels(ctx, cache),
    learModel(ctx, cache),
    gbmModel(
      ctx,
      cache,
      { windowDays: 180, retrainDays: 28, minDays: 90 },
      { trees: 80, depth: 3 }
    ),
  ];
  const res = replay(models, days, "2026-01-01", "2026-03-31");

  it("öğrenen modeller net yük ilişkisini yakalar ve referansları geçer", () => {
    expect(res.length).toBeGreaterThan(60);
    const s = Object.fromEntries(
      scoreModels(
        res,
        models.map((m) => m.id)
      ).map((x) => [x.id, x.mae])
    );
    expect(s["LEAR-ridge"]).toBeLessThan(s["R2-sinif-ortancasi"] * 0.8);
    expect(s["GBM"]).toBeLessThan(s["R2-sinif-ortancasi"]);
    const c = compare(res, "LEAR-ridge", "R2-sinif-ortancasi");
    expect(c.verdict).toBe("better");
    expect(c.lo).toBeLessThanOrEqual(c.diff);
    expect(c.hi).toBeGreaterThanOrEqual(c.diff);
  });

  it("tahminler [0, tavan] içinde", () => {
    for (const r of res)
      for (const p of Object.values(r.preds))
        expect(p.every((x) => x >= 0 && x <= 4500)).toBe(true);
  });

  it("aynı model kendisiyle karşılaştırılınca fark sıfır, gürültü", () => {
    const c = compare(res, "LEAR-ridge", "LEAR-ridge");
    expect(c.diff).toBe(0);
    expect(c.verdict).toBe("noise");
  });
});
