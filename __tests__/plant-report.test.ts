import { describe, it, expect } from "vitest";
import { buildPlantReport } from "@/lib/report/plant-report";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, SystemDirection } from "@/lib/calculations/types";

const at = (y: number, m: number, d: number, h: number) => new Date(Date.UTC(y, m, d, h));
const hour = (t: Date, forecastMwh: number, actualMwh: number, ptf: number, smf: number, dir: SystemDirection) =>
  processHourlyRecord({ timestamp: t, forecastMwh, actualMwh }, { timestamp: t, ptf, smf, systemDirection: dir }, DEFAULT_IMBALANCE_PROFILE);

const project = (
  plants: Array<{ name: string; type: string; hourly: ReturnType<typeof hour>[]; org?: number; yekdem?: boolean; yekdemNextYear?: boolean }>
) => ({
  project: { id: "p", name: "Deneme" },
  profile: DEFAULT_IMBALANCE_PROFILE,
  plants: plants.map((p, i) => ({
    plantId: `id${i}`,
    plantName: p.name,
    plantType: p.type,
    capacityMw: 10,
    organizationId: p.org ?? null,
    organizationName: p.org ? `Şirket ${p.org}` : null,
    yekdem: p.yekdem ?? null,
    yekdemNextYear: p.yekdemNextYear ?? null,
    epiasPlantId: null,
    hourly: p.hourly,
  })),
});

describe("Santral raporu verisi", () => {
  it("toplamları, santral sıralamasını ve 2025 verisi için 2026 katsayı etkisini hesaplar", () => {
    const t = at(2025, 5, 1, 12);
    // A: sistem fazlasında 2 MWh fazla üretim; B: sistem açığında 2 MWh eksik üretim
    const a = hour(t, 10, 12, 2000, 1800, "SURPLUS");
    const b = hour(t, 10, 8, 2000, 2400, "DEFICIT");
    const r = buildPlantReport(project([
      { name: "A", type: "RES", hourly: [a] },
      { name: "B", type: "HES", hourly: [b] },
    ]));

    // 2025: sabit %3. A: 2 × (2000 − 1800×0,97) = 508; B: 2 × (2400×1,03 − 2000) = 944
    expect(r.plants.map((p) => p.name)).toEqual(["B", "A"]);
    expect(r.totals.imbalanceCostTl).toBeCloseTo(508 + 944, 6);
    expect(r.totals.plantCount).toBe(2);
    expect(r.period).toMatchObject({ start: "2025-06-01", end: "2025-06-01", months: 1, hours: 1 });
    // A sistem fazlasında fazla üretti (aynı yön), B sistem açığında eksik üretti (aynı yön)
    expect(r.plants.find((p) => p.name === "A")!.sameDirectionPct).toBe(100);
    expect(r.plants.find((p) => p.name === "A")!.biasPct).toBeCloseTo(((10 - 12) / 12) * 100, 10);
    expect(r.alignment.sameDirectionMwhPct).toBe(100);
    expect(r.alignment.sameDirectionCostPct).toBeCloseTo(100, 10);
    // Isı haritası: Haziran, saat 12
    expect(r.heatmap.cells).toHaveLength(1);
    expect(r.heatmap.cells[0][12]).toBeCloseTo(508 + 944, 6);
    expect(r.heatmap.hourTotals.reduce((a, b) => a + b, 0)).toBeCloseTo(508 + 944, 6);
    // Aylık seri portföy toplamıdır: iki santral aynı ayda tek satır olur
    expect(r.monthly).toHaveLength(1);
    expect(r.monthly[0].imbalanceCostTl).toBeCloseTo(508 + 944, 6);
    // Sapma oranı gerçekleşene göre: A için |12 − 10| / 12
    expect(r.plants[1].deviationPct).toBeCloseTo((2 / 12) * 100, 10);

    // 2026: yön sistemle aynı → %6. A: 2 × (2000 − 1800×0,94) = 616; B: 2 × (2400×1,06 − 2000) = 1088
    expect(r.coefficients2026!.cost2026Tl).toBeCloseTo(616 + 1088, 6);
    expect(r.coefficients2026!.deltaTl).toBeCloseTo(616 + 1088 - 1452, 6);

    // Ters yönlü sapmalar aynı saatte netleşir (senaryo)
    expect(r.dsg!.benefitTl).toBeGreaterThan(0);
    // Tek saatlik veride gün içi testi için önceki aylar yok
    expect(r.intraday).toBeNull();
  });

  it("aynı şirketin santralleri taban maliyette netleşir; DSG faydası yalnızca şirketler arasıdır", () => {
    const t = at(2025, 5, 1, 12);
    const a = hour(t, 10, 12, 2000, 1800, "SURPLUS");
    const b = hour(t, 10, 8, 2000, 2400, "DEFICIT");
    const same = buildPlantReport(project([
      { name: "A", type: "RES", hourly: [a], org: 1 },
      { name: "B", type: "HES", hourly: [b], org: 1 },
    ]));
    // Aynı şirket: +2 ve −2 aynı saatte netleşir, uzlaştırmada maliyet yok
    expect(same.settlement.plantLevelCostTl).toBeCloseTo(1452, 6);
    expect(same.totals.imbalanceCostTl).toBeCloseTo(0, 6);
    expect(same.settlement.sameCompanyNettingTl).toBeCloseTo(1452, 6);
    expect(same.settlement.companies).toHaveLength(1);
    // Tek şirket: DSG ile ek fayda yok
    expect(same.dsg).toBeNull();

    const two = buildPlantReport(project([
      { name: "A", type: "RES", hourly: [a], org: 1 },
      { name: "B", type: "HES", hourly: [b], org: 2 },
    ]));
    expect(two.totals.imbalanceCostTl).toBeCloseTo(1452, 6);
    expect(two.dsg!.benefitTl).toBeCloseTo(1452, 6);
    expect(two.dsg!.offsettingHourSharePct).toBe(100);
  });

  it("YEKDEM santralinde gelir oranı verilmez ve santral işaretlenir", () => {
    const t = at(2025, 5, 1, 12);
    const r = buildPlantReport(project([
      { name: "A", type: "RES", hourly: [hour(t, 10, 12, 2000, 1800, "SURPLUS")], yekdem: true },
      { name: "B", type: "RES", hourly: [hour(t, 10, 11, 2000, 1800, "SURPLUS")], yekdem: false },
    ]));
    expect(r.yekdem).toEqual({ plantNames: ["A"] });
    expect(r.totals.costShareOfRevenuePct).toBeNull();
    expect(r.plants.find((p) => p.name === "A")!.costShareOfRevenuePct).toBeNull();
    expect(r.plants.find((p) => p.name === "B")!.costShareOfRevenuePct).not.toBeNull();
  });

  it("YEKDEM varsa riski doğrudan / YEKDEM olarak ayırır; 2026'da yalnızca YEKDEM'den çıkanları ekler", () => {
    const t = at(2025, 5, 1, 12);
    const r = buildPlantReport(
      project([
        { name: "D", type: "RES", hourly: [hour(t, 10, 12, 2000, 1800, "SURPLUS")], org: 1, yekdem: false },
        { name: "Çıkan", type: "RES", hourly: [hour(t, 10, 13, 2000, 1800, "SURPLUS")], org: 1, yekdem: true, yekdemNextYear: false },
        { name: "Kalan", type: "RES", hourly: [hour(t, 10, 14, 2000, 1800, "SURPLUS")], org: 1, yekdem: true, yekdemNextYear: true },
      ]),
      { companyPlantTotals: new Map([[1, 4]]), missingCompanyPlants: new Map([[1, ["Eksik RES"]]]) }
    );
    const e = r.exposure!;
    // Sistem fazlasında fazla üretim: MWh başına PTF − MIN(PTF,SMF)×(1−l)
    const per25 = 2000 - 1800 * 0.97;
    const per26 = 2000 - 1800 * 0.94;
    expect(e.directCostTl).toBeCloseTo(2 * per25, 6);
    expect(e.yekdemCostTl).toBeCloseTo((3 + 4) * per25, 6);
    expect(e.direct2026Tl).toBeCloseTo(2 * per26, 6);
    // 2026: D + Çıkan birlikte (aynı şirket), Kalan hariç
    expect(e.exposure2026Tl).toBeCloseTo((2 + 3) * per26, 6);
    expect(e.exitingPlants).toEqual(["Çıkan"]);
    expect(e.stayingPlants).toEqual(["Kalan"]);
    expect(r.coverage).toEqual([{ company: "Şirket 1", inProject: 3, total: 4, missing: ["Eksik RES"] }]);
  });

  it("veri tamamen 2026 ve sonrasındaysa katsayı karşılaştırması yapmaz; tek santralde DSG yoktur", () => {
    const r = buildPlantReport(project([{ name: "A", type: "RES", hourly: [hour(at(2026, 0, 5, 3), 10, 11, 2000, 2100, "DEFICIT")] }]));
    expect(r.coefficients2026).toBeNull();
    expect(r.dsg).toBeNull();
  });

  it("piyasa verisi eşleşmemiş projede anlaşılır hata verir", () => {
    expect(() => buildPlantReport(project([{ name: "A", type: "RES", hourly: [] }]))).toThrow(/rapor üretilemez/);
  });
});
