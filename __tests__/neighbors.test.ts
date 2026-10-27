import { describe, expect, it } from "vitest";
import { emptyEntsoeDoc } from "@/lib/pool/entsoe-codec";
import { neighborFeatures, neighborOutlook } from "@/lib/analysis/neighbors";

const flat = (v: number) => Array<number>(24).fill(v);

function world() {
  const d = emptyEntsoeDoc();
  d.fx = { "2026-10-26": 50, "2026-10-27": 55 };
  d.prices.BG["2026-10-26"] = flat(100);
  d.prices.GR["2026-10-26"] = flat(100);
  d.prices.BG["2026-10-27"] = Array.from({ length: 24 }, (_, h) => 80 + h);
  d.prices.GR["2026-10-27"] = Array.from({ length: 24 }, (_, h) =>
    h < 12 ? 80 + h : 90 + h
  );
  d.flows.TR_BG["2026-10-27"] = flat(300);
  d.flows.BG_TR["2026-10-27"] = flat(50);
  d.flows.TR_GR["2026-10-27"] = flat(100);
  d.flows.GR_TR["2026-10-27"] = flat(0);
  d.fetchedAt = "2026-10-27T17:00:00.000Z";
  return d;
}

describe("neighborOutlook", () => {
  it("hedef günden önceki tam günü seçer, PTF'yi kurla EUR'ya çevirir, farkı ve net ihracatı hesaplar", () => {
    const ptf = new Map([["2026-10-27", flat(5500)]]);
    const o = neighborOutlook(world(), ptf, "2026-10-28")!;
    expect(o.day).toBe("2026-10-27");
    expect(o.daysBefore).toBe(1);
    expect(o.fx).toBe(55);
    expect(o.hours[0].ptfEur).toBeCloseTo(100, 6);
    expect(o.hours[0].spreadBg).toBeCloseTo(20, 6); // 100 − 80
    expect(o.hours[23].spreadBg).toBeCloseTo(100 - 103, 6);
    expect(o.hours[5].netBg).toBe(250);
    expect(o.hours[5].netGr).toBe(100);
    expect(o.mean.netBg).toBe(250);
    expect(o.coupledPct).toBeCloseTo(50, 6); // ilk 12 saat aynı, sonrası 10 EUR farklı
    expect(o.targetDay).toBeNull();
  });

  it("hedef günün fiyatı yayımlandıysa bilgi olarak verir; tam gün yoksa daha eskiye bakar; hiç yoksa null", () => {
    const d = world();
    d.prices.BG["2026-10-28"] = flat(70);
    d.prices.GR["2026-10-28"] = flat(70);
    expect(neighborOutlook(d, new Map(), "2026-10-28")!.targetDay).toEqual({
      bg: 70,
      gr: 70,
    });
    d.prices.BG["2026-10-27"][3] = null;
    const o = neighborOutlook(d, new Map(), "2026-10-28")!;
    expect(o.day).toBe("2026-10-26");
    expect(o.daysBefore).toBe(2);
    expect(o.hours[0].ptfEur).toBeNull(); // o günün PTF'si verilmedi
    expect(neighborOutlook(null, new Map(), "2026-10-28")).toBeNull();
    expect(neighborOutlook(emptyEntsoeDoc(), new Map(), "2026-10-28")).toBeNull();
  });
});

describe("neighborFeatures", () => {
  it("PTF − fiyat×kur farkını ve toplam net ihracatı gün bazında verir; eksik günü atlar", () => {
    const ptf = new Map([
      ["2026-10-26", flat(5000)],
      ["2026-10-27", flat(5500)],
    ]);
    const f = neighborFeatures(world(), ptf);
    expect(f.spread.get("2026-10-26")![0]).toBeCloseTo(5000 - 100 * 50, 6);
    expect(f.spread.get("2026-10-27")![0]).toBeCloseTo(5500 - 80 * 55, 6);
    expect(f.netExport.get("2026-10-27")![0]).toBe(300 - 50 + (100 - 0));
    expect(f.netExport.has("2026-10-26")).toBe(false);
    expect(neighborFeatures(null, ptf).spread.size).toBe(0);
  });
});
