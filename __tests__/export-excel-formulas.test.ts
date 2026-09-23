import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { exportToExcel, HourlyExportRow } from "../lib/export/excel";
import { processHourlyRecord } from "../lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, ImbalancePricingProfile, SystemDirection } from "../lib/calculations/types";
import { createEvaluator } from "./helpers/excel-formula-eval";

/**
 * Dışa aktarılan Excel'deki formüller bağımsız bir değerlendiriciyle hesaplanır ve hesaplama motorunun
 * sonuçlarıyla karşılaştırılır. Excel'i açan kişi uygulamayla aynı rakamları görmelidir.
 */
describe("Excel formülleri uygulama sonuçlarıyla aynı rakamı üretir", () => {
  // 2025 → 2026 rejim sınırını, üç sistem yönünü, fazla/eksik/sıfır dengesizliği ve PTF > SMF / PTF < SMF
  // durumlarını kapsayan satırlar; iki santral, iki ay.
  const scenarios: Array<[string, number, number, number, number, SystemDirection]> = [
    ["2025-12-31T21:00:00Z", 40, 48, 2500, 1900, "SURPLUS"],
    ["2025-12-31T22:00:00Z", 40, 31, 2500, 3100, "DEFICIT"],
    ["2025-12-31T23:00:00Z", 40, 40, 2500, 2500, "BALANCED"],
    ["2026-01-01T00:00:00Z", 40, 48, 2500, 1900, "SURPLUS"],
    ["2026-01-01T01:00:00Z", 40, 31, 2500, 3100, "DEFICIT"],
    ["2026-01-01T02:00:00Z", 40, 45, 2500, 3100, "DEFICIT"],
    ["2026-01-01T03:00:00Z", 40, 35, 2500, 1900, "SURPLUS"],
    ["2026-01-01T04:00:00Z", 0, 0, 2500, 2500, "BALANCED"],
  ];

  const build = (profile: ImbalancePricingProfile) => {
    const rows: HourlyExportRow[] = [];
    const engine: Array<{ plant: string; month: string; cost: number; revenue: number; actual: number }> = [];
    for (const plant of ["RES_A", "HES_B"]) {
      scenarios.forEach(([ts, f, a, ptf, smf, dir], i) => {
        const forecast = plant === "HES_B" ? f * 0.5 : f;
        const actual = plant === "HES_B" ? a * 0.5 + (i % 3) : a;
        const r = processHourlyRecord(
          { timestamp: ts, forecastMwh: forecast, actualMwh: actual },
          { timestamp: ts, ptf, smf, systemDirection: dir },
          profile
        );
        rows.push({
          timestamp: ts,
          yearMonth: ts.slice(0, 7),
          hourStr: ts.slice(11, 16),
          plantName: plant,
          plantType: plant.slice(0, 3),
          forecastMwh: forecast,
          actualMwh: actual,
          ptf,
          smf,
          systemDirection: dir as HourlyExportRow["systemDirection"],
        });
        engine.push({ plant, month: ts.slice(0, 7), cost: r.imbalanceCost, revenue: r.totalRevenue, actual });
      });
    }
    return { rows, engine };
  };

  const exportAndEvaluate = async (profile: ImbalancePricingProfile) => {
    const { rows, engine } = build(profile);
    const buffer = await exportToExcel({
      projectName: "Formül Doğrulama",
      pricingProfile: profile,
      hourlyRecords: rows,
      uniqueMonths: ["2025-12", "2026-01"],
      uniquePlants: [
        { plantName: "RES_A", plantType: "RES" },
        { plantName: "HES_B", plantType: "HES" },
      ],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    return { wb, rows, engine, ev: createEvaluator(wb) };
  };

  it.each([
    ["mevzuat modu (2025 sabit %3, 2026 yöne bağlı)", DEFAULT_IMBALANCE_PROFILE],
    [
      "özel mod",
      { mode: "CUSTOM", positiveSurplusCoef: 0.9, positiveOtherCoef: 0.95, negativeDeficitCoef: 1.1, negativeOtherCoef: 1.05 },
    ],
  ] as Array<[string, ImbalancePricingProfile]>)("%s", async (_label, profile) => {
    const { wb, rows, engine, ev } = await exportAndEvaluate(profile);
    const hourly = wb.getWorksheet("Saatlik Veriler")!;

    // 1. Her saatlik satır: dengesizlik maliyeti (S) ve toplam gelir (P) motorla aynı
    for (let r = 2; r <= hourly.rowCount; r++) {
      const plant = hourly.getCell(`D${r}`).value as string;
      if (!plant) continue;
      const idx = rows.findIndex((x, i) => i === r - 2);
      expect(ev.value("Saatlik Veriler", `S${r}`)).toBeCloseTo(engine[idx].cost, 6);
      expect(ev.value("Saatlik Veriler", `P${r}`)).toBeCloseTo(engine[idx].revenue, 6);
    }

    // 2. Aylık özet: her santral × ay için üretim (D), gelir (G) ve maliyet (I) motor toplamlarıyla aynı
    const summary = wb.getWorksheet("Aylık Özet")!;
    let checked = 0;
    for (let r = 2; r <= summary.rowCount; r++) {
      const month = summary.getCell(`A${r}`).value as string;
      const plant = summary.getCell(`B${r}`).value as string;
      if (!month || !plant) continue;
      const group = engine.filter((e) => e.plant === plant && e.month === month);
      const sum = (k: "cost" | "revenue" | "actual") => group.reduce((s, e) => s + e[k], 0);
      expect(ev.value("Aylık Özet", `D${r}`)).toBeCloseTo(sum("actual"), 6);
      expect(ev.value("Aylık Özet", `G${r}`)).toBeCloseTo(sum("revenue"), 6);
      expect(ev.value("Aylık Özet", `I${r}`)).toBeCloseTo(sum("cost"), 6);
      checked++;
    }
    expect(checked).toBe(4);
  });
});
