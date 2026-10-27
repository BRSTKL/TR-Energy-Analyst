import { describe, expect, it } from "vitest";
import { aggregateByProvince, normalizeIl, quantileBreaks, stepOf, type EpdkRow } from "@/lib/sector/epdk-by-province";

const PLATES = new Map([
  ["SANLIURFA", "63"],
  ["HAKKARI", "30"],
  ["KONYA", "42"],
]);

const row = (over: Partial<EpdkRow>): EpdkRow => ({ licenseNo: "EÜ/1", status: "Yürürlükte", plant: "A RES", il: "KONYA", ilce: "-", mwm: "0", mwe: "10", opMwe: "0", ...over });

describe("normalizeIl", () => {
  it("Türkçe harfleri ve şapkalı yazımı aynı anahtara indirir", () => {
    expect(normalizeIl("Şanlıurfa")).toBe("SANLIURFA");
    expect(normalizeIl("ŞANLIURFA")).toBe("SANLIURFA");
    expect(normalizeIl("Hakkâri")).toBe("HAKKARI");
    expect(normalizeIl("HAKKARİ")).toBe("HAKKARI");
  });
});

describe("aggregateByProvince", () => {
  it("yalnız yürürlükteki ana kaynak lisansları sayar", () => {
    const m = aggregateByProvince(
      [row({}), row({ status: "Sonlandırıldı" }), row({ status: "" }), row({ role: "Yardımcı Kaynak" }), row({ licenseNo: "EÜ/2", mwe: "5" })],
      "RES",
      PLATES,
    );
    expect(m.byPlate["42"]).toEqual({ mw: 15, count: 2 });
  });

  it("rüzgârda işletmedeki MWe, güneşte lisans MWe alınır", () => {
    const rows = [row({ mwe: "20", opMwe: "12" })];
    expect(aggregateByProvince(rows, "RES", PLATES).byPlate["42"].mw).toBe(12);
    expect(aggregateByProvince(rows, "GES", PLATES).byPlate["42"].mw).toBe(20);
  });

  it("ili okunamayan lisansı ayrı sayar ve listeyi büyükten küçüğe sıralar", () => {
    const m = aggregateByProvince([row({ il: "-", mwe: "7" }), row({ il: "KONYA", mwe: "3", licenseNo: "EÜ/3" }), row({ il: "KONYA", mwe: "9", licenseNo: "EÜ/4" })], "RES", PLATES);
    expect(m.unplaced).toEqual({ mw: 7, count: 1 });
    expect(m.licenses["42"].map((l) => l.licenseNo)).toEqual(["EÜ/4", "EÜ/3"]);
  });
});

describe("quantileBreaks / stepOf", () => {
  it("değerleri basamaklara böler", () => {
    const b = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(b).toHaveLength(4);
    expect(stepOf(1, b)).toBe(0);
    expect(stepOf(10, b)).toBe(4);
  });
  it("boş girdide eşik yoktur", () => {
    expect(quantileBreaks([], 5)).toEqual([]);
  });
});
