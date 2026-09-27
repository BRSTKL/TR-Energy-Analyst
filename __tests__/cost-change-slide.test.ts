import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildPlantReport } from "@/lib/report/plant-report";
import { exportPlantReportPptx, yearLocative } from "@/lib/export/plant-report-pptx";
import { decomposeCostChange, type CostChangePeriodInput } from "@/lib/analysis/cost-change";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, type SystemDirection } from "@/lib/calculations/types";

const hours = (year: number, spread: number) =>
  Array.from({ length: 48 }, (_, i) => {
    const t = new Date(Date.UTC(year, 2, 1 + Math.floor(i / 24), i % 24));
    const dir: SystemDirection = i % 3 === 0 ? "SURPLUS" : "DEFICIT";
    const ptf = 2000;
    const err = i % 2 === 0 ? 3 : -2;
    return processHourlyRecord(
      { timestamp: t, forecastMwh: 20, actualMwh: 20 + err },
      { timestamp: t, ptf, smf: dir === "SURPLUS" ? ptf - spread : ptf + spread, systemDirection: dir },
      DEFAULT_IMBALANCE_PROFILE
    );
  });

const input = (year: number, spread: number): CostChangePeriodInput => ({
  label: String(year),
  profile: DEFAULT_IMBALANCE_PROFILE,
  plants: [{ key: "epias:1", name: "RES 1", unit: "org:1", hourly: hours(year, spread) }],
});

async function slideTexts(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return Promise.all(names.map((n) => zip.file(n)!.async("string")));
}

describe("Rapor: Ne değişti? slaytı", () => {
  it("yılın bulunma eki", () => {
    expect(["2025", "2026", "2027", "2029", "2030", "2040", "2100", "2000"].map(yearLocative)).toEqual([
      "2025'te",
      "2026'da",
      "2027'de",
      "2029'da",
      "2030'da",
      "2040'ta",
      "2100'de",
      "2000'de",
    ]);
    expect(yearLocative("Proje B")).toBe("Proje B döneminde");
  });

  it("önceki yıl ayrıştırması verilince slayt eklenir; verilmezse eklenmez", async () => {
    const report = buildPlantReport({
      project: { id: "p", name: "Deneme 2026" },
      profile: DEFAULT_IMBALANCE_PROFILE,
      plants: [
        {
          plantId: "p1",
          plantName: "RES 1",
          plantType: "RES",
          capacityMw: 30,
          organizationId: 1,
          organizationName: "Şirket",
          yekdem: false,
          yekdemNextYear: false,
          epiasPlantId: 1,
          hourly: hours(2026, 600),
        },
      ],
    });
    const result = decomposeCostChange(input(2025, 400), input(2026, 600))!;
    const withSlide = await slideTexts(await exportPlantReportPptx(report, {}, { costChange: { previousProject: "Deneme 2025", result, sector: null } }));
    const without = await slideTexts(await exportPlantReportPptx(report));
    expect(withSlide.length).toBe(without.length + 1);
    const slide = withSlide.find((x) => x.includes("NE DEĞİŞTİ?"))!;
    expect(slide).toBeDefined();
    expect(slide).toContain("2026&apos;da MWh başına dengesizlik maliyeti");
    expect(slide).toContain("karşılaştırılan proje: Deneme 2025");
    expect(slide).toContain("Etkileşim");
    expect(without.some((x) => x.includes("NE DEĞİŞTİ?"))).toBe(false);
    // Sektör karnesi yoksa okuma notu
    expect(slide).toContain("NASIL OKUNUR");

    const sector = {
      prevLabel: "2025",
      curLabel: "2026 (Ocak–Ağustos)",
      byType: { RES: { plants: 294, increasedPct: 100, medianCostChangePct: 55, medianDeviationPct: { prev: 18, cur: 18.2 } } },
    };
    const withSector = await slideTexts(await exportPlantReportPptx(report, {}, { costChange: { previousProject: "Deneme 2025", result, sector } }));
    const sectorSlide = withSector.find((x) => x.includes("NE DEĞİŞTİ?"))!;
    expect(sectorSlide).toContain("SEKTÖR · 2025 → 2026 (Ocak–Ağustos)");
    expect(sectorSlide).toContain("Rüzgâr: 294 santral · maliyeti artan pay %100 · medyan +%55 · medyan sapma %18,0 → %18,2");
  });
});
