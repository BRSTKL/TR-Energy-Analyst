import { describe, it, expect } from "vitest";
import { buildCompanies, companyRank, companySlug, companyTotals, searchCompanies, type CompanyPlant } from "@/lib/analysis/company-profile";

const plant = (o: Partial<CompanyPlant> & Pick<CompanyPlant, "id" | "owner">): CompanyPlant => ({
  name: `S${o.id}`,
  type: "RES",
  mw: 10,
  recorded: true,
  capacityLabel: "YEKDEM",
  actualMwh: 1000,
  imbalanceCostTl: 50_000,
  kupstTl: 10_000,
  deviationPct: 20,
  rankPct: 50,
  yekdem: false,
  yekdemStatus: "NEVER",
  ...o,
});

describe("companySlug", () => {
  it("Türkçe harf, noktalama ve boşluk farkını yok sayar", () => {
    expect(companySlug("ÇAL  ENERJİ A.Ş.")).toBe("cal-enerji-a-s");
    expect(companySlug("Çal Enerji A.Ş")).toBe("cal-enerji-a-s");
  });
});

describe("companyTotals", () => {
  it("kayıtlı ve tahmini gücü ayrı toplar; birim maliyet toplam / toplam üretimdir", () => {
    const r = companyTotals("A", [
      plant({ id: 1, owner: "A", mw: 30, actualMwh: 3000, imbalanceCostTl: 300_000, kupstTl: 30_000, deviationPct: 10, yekdem: true }),
      plant({ id: 2, owner: "A", type: "GES", mw: 10, recorded: false, actualMwh: 1000, imbalanceCostTl: 20_000, kupstTl: 10_000, deviationPct: 30 }),
    ]);
    expect(r.mw).toBe(40);
    expect(r.recordedMw).toBe(30);
    expect(r.estimatedMw).toBe(10);
    expect(r.unitImbalanceTl).toBeCloseTo(80);
    expect(r.unitTotalTl).toBeCloseTo(90);
    // (300 + 300) MWh sapma / 4000 MWh üretim
    expect(r.deviationPct).toBeCloseTo(15);
    expect(r.byType.map((t) => [t.type, t.plants, t.mw])).toEqual([
      ["RES", 1, 30],
      ["GES", 1, 10],
    ]);
    expect(r.yekdem).toEqual({ plants: 1, mw: 30 });
  });
  it("üretim yoksa birim değerler null (NaN değil)", () => {
    const r = companyTotals("A", [plant({ id: 1, owner: "A", actualMwh: 0, imbalanceCostTl: 0, kupstTl: 0 })]);
    expect(r.unitImbalanceTl).toBeNull();
    expect(r.unitTotalTl).toBeNull();
    expect(r.deviationPct).toBeNull();
  });
});

describe("buildCompanies", () => {
  const idx = buildCompanies([
    plant({ id: 1, owner: "ÇAL ENERJİ A.Ş.", mw: 5 }),
    plant({ id: 2, owner: "ÇAL  ENERJİ A.Ş.", mw: 20 }),
    plant({ id: 3, owner: "Büyük Şirket", mw: 100 }),
    plant({ id: 4, owner: null, mw: 7 }),
    plant({ id: 5, owner: "  ", mw: 3 }),
  ]);
  it("yazım farkı olan adları birleştirir, sahipsizleri ayırır", () => {
    expect(idx.rows.map((r) => [r.slug, r.plants, r.mw])).toEqual([
      ["buyuk-sirket", 1, 100],
      ["cal-enerji-a-s", 2, 25],
    ]);
    expect(idx.unknown).toEqual({ plants: 2, mw: 10 });
  });
  it("şirketin santralleri kurulu güce göre azalan sıradadır", () => {
    expect(idx.bySlug.get("cal-enerji-a-s")!.plants.map((p) => p.id)).toEqual([2, 1]);
  });
  it("sıra ve arama", () => {
    expect(companyRank(idx.rows, "cal-enerji-a-s")).toEqual({ rank: 2, of: 2 });
    expect(companyRank(idx.rows, "yok")).toBeNull();
    expect(searchCompanies(idx.rows, "çal").items.map((r) => r.slug)).toEqual(["cal-enerji-a-s"]);
    expect(searchCompanies(idx.rows, "").total).toBe(2);
    expect(searchCompanies(idx.rows, "", 1).items).toHaveLength(1);
  });
});
