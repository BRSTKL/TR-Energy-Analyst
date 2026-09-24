import { describe, it, expect } from "vitest";
import { buildPlantReport } from "@/lib/report/plant-report";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, SystemDirection } from "@/lib/calculations/types";

const at = (y: number, m: number, d: number, h: number) => new Date(Date.UTC(y, m, d, h));
const hour = (t: Date, forecastMwh: number, actualMwh: number, ptf: number, smf: number, dir: SystemDirection) =>
  processHourlyRecord({ timestamp: t, forecastMwh, actualMwh }, { timestamp: t, ptf, smf, systemDirection: dir }, DEFAULT_IMBALANCE_PROFILE);

const project = (plants: Array<{ name: string; type: string; hourly: ReturnType<typeof hour>[] }>) => ({
  project: { id: "p", name: "Deneme" },
  profile: DEFAULT_IMBALANCE_PROFILE,
  plants: plants.map((p, i) => ({ plantId: `id${i}`, plantName: p.name, plantType: p.type, capacityMw: 10, hourly: p.hourly })),
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

  it("veri tamamen 2026 ve sonrasındaysa katsayı karşılaştırması yapmaz; tek santralde DSG yoktur", () => {
    const r = buildPlantReport(project([{ name: "A", type: "RES", hourly: [hour(at(2026, 0, 5, 3), 10, 11, 2000, 2100, "DEFICIT")] }]));
    expect(r.coefficients2026).toBeNull();
    expect(r.dsg).toBeNull();
  });

  it("piyasa verisi eşleşmemiş projede anlaşılır hata verir", () => {
    expect(() => buildPlantReport(project([{ name: "A", type: "RES", hourly: [] }]))).toThrow(/rapor üretilemez/);
  });
});
