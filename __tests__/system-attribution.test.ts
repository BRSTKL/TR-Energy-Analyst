import { describe, expect, it } from "vitest";
import {
  accumulatePlant,
  addToSourceTotals,
  contribution,
  directional,
  emptySourceTotals,
  plantSource,
  unlicensedRegion,
} from "@/lib/analysis/system-attribution";

const start = "2026-01-01T00:00:00.000Z";
const H = 3_600_000;
const t0 = Date.parse(start);
/** 4 saatlik yıl parçası: saat 0–1 açık, 2–3 fazla */
const side = new Map<number, "DEFICIT" | "SURPLUS">([
  [t0, "DEFICIT"],
  [t0 + H, "DEFICIT"],
  [t0 + 2 * H, "SURPLUS"],
  [t0 + 3 * H, "SURPLUS"],
]);
const series = (kgup: number[], uevm: Array<number | null>) => ({ start, kgup, uevm });

describe("sistem yönü: santral paylaştırması", () => {
  it("yön sapması: açıkta plan altı, fazlada plan üstü; ters yön sıfır", () => {
    expect([directional("DEFICIT", -30), directional("DEFICIT", 20), directional("SURPLUS", 20), directional("SURPLUS", -5)]).toEqual([30, 0, 20, 0]);
  });

  it("itme payı: kaynağın saatlik itmesi o yönde sapanlara sapmaları oranında dağılır, toplam itmeyi verir", () => {
    // A: saat 0 −60, saat 1 −10; B: saat 0 +20 (ters yön), saat 1 −30. Saat 0 net −40 → itme 40, yalnız A'ya (60/60)
    // Saat 1 net −40 → itme 40; A 10/40, B 30/40
    const a = series([100, 100, 100, 100], [40, 90, 100, 100]);
    const b = series([100, 100, 100, 100], [120, 70, 100, 100]);
    const totals = emptySourceTotals(4);
    addToSourceTotals(totals, side, a);
    addToSourceTotals(totals, side, b);
    const accA = accumulatePlant(side, a, totals);
    const accB = accumulatePlant(side, b, totals);
    expect(accA.deficit.alloc).toBeCloseTo(40 + 10);
    expect(accB.deficit.alloc).toBeCloseTo(30);
    // Paylar toplamı = kaynağın itmesi (iki açık saatte 40 + 40), 2 açık saate bölünür
    const total = contribution([accA.deficit, accB.deficit], "deficit", 2);
    expect(total.mw).toBeCloseTo(40);
    // Net katkı: A −70 sapma → +35 MW; B −10 → +5 MW
    expect(contribution([accA.deficit], "deficit", 2).netMw).toBeCloseTo(35);
    expect(contribution([accB.deficit], "deficit", 2).netMw).toBeCloseTo(5);
    expect(contribution([accB.deficit], "deficit", 2).sameDirPct).toBe(50);
    // Plana oranı: A payı 50 MWh / planı 200 MWh
    expect(contribution([accA.deficit], "deficit", 2).ownPct).toBeCloseTo(25);
  });

  it("ay ay birikim: yıl toplamı ayların toplamıdır", () => {
    const feb = Date.UTC(2026, 1, 1);
    const sh = new Map<number, "DEFICIT" | "SURPLUS">([
      [t0, "DEFICIT"],
      [feb, "DEFICIT"],
    ]);
    const kgup = new Array(800).fill(100);
    const uevm = new Array(800).fill(100);
    uevm[0] = 60;
    uevm[(feb - t0) / H] = 90;
    const acc = accumulatePlant(sh, series(kgup, uevm));
    expect(Object.keys(acc.months).sort()).toEqual(["01", "02"]);
    expect(acc.months["01"].deficit.sumDev).toBe(-40);
    expect(acc.months["02"].deficit.sumDev).toBe(-10);
    expect(acc.deficit.sumDev).toBe(-50);
    expect(acc.deficit.hours).toBe(2);
  });

  it("verisi olmayan saat ve yönü olmayan saat sayılmaz", () => {
    const acc = accumulatePlant(new Map([[t0, "DEFICIT"]]), series([100, 100], [null, 50]));
    expect(acc.deficit.hours).toBe(0);
    expect(acc.surplus.hours).toBe(0);
  });

  it("kaynak: EPİAŞ kaynak kırılımından; yoksa türden, hidro belirsiz", () => {
    expect(plantSource({ "01": { river: 500, dam: 10 } })).toBe("river");
    expect(plantSource({ "01": { dam: 900, river: 10 } })).toBeNull();
    expect(plantSource({ "01": { wind: 0 } }, "RES")).toBe("wind");
    expect(plantSource(undefined, "GES")).toBe("sun");
    expect(plantSource(undefined, "HES")).toBeNull();
  });

  it("lisanssız toplamın dağıtım bölgesi addan", () => {
    expect(unlicensedRegion("K3_AKEDAŞ_GÜNEŞ")).toBe("AKEDAŞ");
    expect(unlicensedRegion("LÜM_İLETİM_ÇİVRİL_GÜNEŞ_K3_AYDEM")).toBe("AYDEM");
    expect(unlicensedRegion("LÜY_İLETİM_GES_K3 FIRAT_KUZOVA-1 GES")).toBe("FIRAT");
    expect(unlicensedRegion("ÇATALCA RES")).toBeNull();
  });
});
