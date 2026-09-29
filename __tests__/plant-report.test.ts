import { describe, it, expect } from "vitest";
import { buildPlantReport } from "@/lib/report/plant-report";
import { settlementIdentity } from "@/lib/projects/aggregator";
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
    // KÜPST (RES %17, plan 10 → tolerans 1,7 MWh): D sapma 2 → 0,3; Çıkan 3 → 1,3; Kalan 4 → 2,3; fiyat max(2000,1800) × 0,03
    const k = (excess: number) => excess * 2000 * 0.03;
    const k26 = (excess: number) => excess * 2000 * 0.05; // 2026 fiyat katsayısı (EPDK 2026 taslağı)
    expect(e.kupstDirectTl).toBeCloseTo(k(0.3), 6);
    expect(e.kupstYekdemTl).toBeCloseTo(k(1.3) + k(2.3), 6);
    // 2026 projeksiyonu 2026 oranlarıyla (RES %15 → tolerans 1,5 MWh, katsayı 0,05): D 0,5; Çıkan 1,5; Kalan 2,5
    expect(e.kupstExposure2026Tl).toBeCloseTo(k26(0.5) + k26(1.5), 6);
    expect(r.kupst.next2026Tl).toBeCloseTo(k26(0.5) + k26(1.5) + k26(2.5), 6);
    expect(r.kupst.totalTl).toBeCloseTo(k(0.3) + k(1.3) + k(2.3), 6);
    expect(e.stayingPlants).toEqual(["Kalan"]);
    expect(r.coverage).toEqual([{ company: "Şirket 1", inProject: 3, total: 4, missing: ["Eksik RES"] }]);
  });

  it("risk primi: 2026 kurallarıyla MWh başına beklenen yük, aylık P90 ve en kötü ay (en az 6 ay)", () => {
    // 2025'in 6 ayı, her ay bir saat: sistem fazlasında fazla üretim (2026'da %6 katsayı), sapma aydan aya artıyor
    const hourly = [0, 1, 2, 3, 4, 5].map((m) => hour(at(2025, m, 1, 12), 10, 11 + m, 2000, 1800, "SURPLUS"));
    const r = buildPlantReport(project([{ name: "A", type: "RES", hourly }]), {}, { intraday: false });
    const rp = r.riskPremium!;
    const per26 = 2000 - 1800 * 0.94; // MWh başına 2026 dengesizlik bedeli
    // KÜPST (2026, RES %15 → tolerans 1,5; katsayı 0,05): sapma 1..6 → aşan 0, 0,5, 1,5, 2,5, 3,5, 4,5 × 2000 × 0,05
    const kupst = [0, 0.5, 1.5, 2.5, 3.5, 4.5].map((x) => x * 2000 * 0.05);
    const months = [0, 1, 2, 3, 4, 5].map((m) => ((1 + m) * per26 + kupst[m]) / (11 + m));
    expect(rp.portfolio.months.map((m) => m.tlPerMwh)).toEqual(months.map((v) => expect.closeTo(v, 6)));
    const totalMwh = [11, 12, 13, 14, 15, 16].reduce((a, b) => a + b, 0);
    const totalCost = [1, 2, 3, 4, 5, 6].reduce((a, d) => a + d * per26, 0) + kupst.reduce((a, b) => a + b, 0);
    expect(rp.portfolio.expectedTlPerMwh).toBeCloseTo(totalCost / totalMwh, 6);
    expect(rp.portfolio.worstMonth.month).toBe("2025-06");
    expect(rp.plants).toHaveLength(1);
    // 6 veride 0,9 yüzdelik: 4,5. sıra → 5. ve 6. ayın arası
    const sorted = [...months].sort((x, y) => x - y);
    expect(rp.portfolio.p90MonthTlPerMwh).toBeCloseTo(sorted[4] + (sorted[5] - sorted[4]) * 0.5, 6);
  });

  it("veri tamamen 2026 ve sonrasındaysa katsayı karşılaştırması yapmaz; tek santralde DSG yoktur", () => {
    const r = buildPlantReport(project([{ name: "A", type: "RES", hourly: [hour(at(2026, 0, 5, 3), 10, 11, 2000, 2100, "DEFICIT")] }]));
    expect(r.coefficients2026).toBeNull();
    expect(r.dsg).toBeNull();
  });

  it("piyasa verisi eşleşmemiş projede anlaşılır hata verir", () => {
    expect(() => buildPlantReport(project([{ name: "A", type: "RES", hourly: [] }]))).toThrow(/rapor üretilemez/);
  });

  it("toplayıcı portföyü: santraller tek dengede netleşir, portföy değeri sahiplerin kendi dengesine göre", () => {
    const t = at(2025, 5, 1, 12);
    // Sistem fazlasında: A 2 MWh fazla (aynı yön), B 2 MWh eksik (ters yön); portföyde net sapma 0
    const a = hour(t, 10, 12, 2000, 1800, "SURPLUS");
    const b = hour(t, 10, 8, 2000, 1800, "SURPLUS");
    const base = project([
      { name: "A", type: "RES", hourly: [a], org: 1 },
      { name: "B", type: "RES", hourly: [b], org: 2 },
    ]);
    const data = {
      ...base,
      aggregator: { name: "Toplayıcı X" },
      plants: base.plants.map((p) => ({ ...p, ...settlementIdentity(p, "Toplayıcı X") })),
    };
    const r = buildPlantReport(data);
    // Tek başına: A 2 × (2000 − 1800×0,97) = 508; B 2 × (2000×1,03 − 2000) = 120. Portföyde net 0 → 0
    expect(r.aggregator).toMatchObject({ name: "Toplayıcı X", ownerCount: 2 });
    expect(r.aggregator!.standaloneCostTl).toBeCloseTo(628, 6);
    expect(r.aggregator!.portfolioCostTl).toBeCloseTo(0, 6);
    expect(r.aggregator!.benefitPct).toBeCloseTo(100, 6);
    expect(r.aggregator!.offsettingHourSharePct).toBe(100);
    expect(r.totals.imbalanceCostTl).toBeCloseTo(0, 6);
    // Uzlaştırma birimi tek (toplayıcı): şirketler arası DSG senaryosu yok; santral satırında lisans sahibi kalır
    expect(r.dsg).toBeNull();
    expect(r.settlement.companies.map((c) => c.name)).toEqual(["Toplayıcı X"]);
    expect(r.plants.map((p) => p.organizationName).sort()).toEqual(["Şirket 1", "Şirket 2"]);
    // Toplayıcı yoksa alan boş
    expect(buildPlantReport(base).aggregator).toBeNull();

    // Shapley: iki sahip, birlikte maliyet 0. A: (508 + (0 − 120)) / 2 = 194; B: (120 + (0 − 508)) / 2 = −194
    expect(r.fairShare?.basis).toBe("owners");
    const fa = r.fairShare!.members.find((m) => m.name === "Şirket 1")!;
    const fb = r.fairShare!.members.find((m) => m.name === "Şirket 2")!;
    expect(fa.shapleyCostTl).toBeCloseTo(194, 4);
    expect(fb.shapleyCostTl).toBeCloseTo(-194, 4);
    expect(fa.shapleyCostTl + fb.shapleyCostTl).toBeCloseTo(r.aggregator!.portfolioCostTl, 4);
    // Aylık fayda: tek ay, %100
    expect(r.aggregator!.monthlyBenefit).toEqual([{ month: "2025-06", benefitPct: 100 }]);
    // Profil: tek saat, PTF 2000 → yakalanan fiyat = baz PTF
    expect(r.marketProfile).toMatchObject({ baseloadPtfTl: 2000, capturePriceTl: 2000, captureRatePct: 100 });
  });
});


import { describeAggregatorScope, describePortfolioMix } from "@/lib/projects/aggregator";

describe("Toplayıcı kapsam cümlesi", () => {
  const p = { orgId: 1, orgName: "X (TOPLAYICI)", asOf: "2026-09-27", plantCount: 40, byType: { RES: 6, HES: 29, OTHER: 5 }, plantIds: [] };
  it("portföy dağılımı çoktan aza, kapsam ve kaynak ayı", () => {
    expect(describePortfolioMix(p.byType)).toBe("29 hidro, 6 rüzgâr, 5 diğer");
    expect(describeAggregatorScope("Gain Toplayıcı", p, 6)).toBe(
      "Kapsam: Gain Toplayıcı portföyündeki 40 santralin 6 tanesi (portföy: 29 hidro, 6 rüzgâr, 5 diğer; EPİAŞ, Eylül 2026)"
    );
    expect(describeAggregatorScope("G", { ...p, plantCount: 6 }, 6, 1)).toContain("santralin tamamı");
    expect(describeAggregatorScope("G", { ...p, plantCount: 6 }, 6, 1)).toContain("projedeki 1 santral bu listede yok");
  });
});

import { monthlyRange } from "@/lib/report/deviation-load";

describe("Aylık fayda aralığı", () => {
  it("en az 3 ay varsa en düşük ve en yüksek oran", () => {
    expect(monthlyRange([{ benefitPct: 30 }, { benefitPct: 26 }, { benefitPct: 39 }])).toEqual({ min: 26, max: 39, months: 3 });
    expect(monthlyRange([{ benefitPct: 30 }, { benefitPct: 26 }])).toBeNull();
    expect(monthlyRange(undefined)).toBeNull();
  });
});
