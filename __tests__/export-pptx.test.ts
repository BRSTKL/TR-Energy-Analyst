import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { exportToPptx, PptxExportProjectData, PptxExportInsightsData } from "../lib/export/pptx";
import { computeAccuracyStats } from "../lib/analysis/forecast-accuracy";
import type { NettingGroupResult } from "../lib/analysis/portfolio-netting";

/** Sunumu açar; slayt boyutunu ve her slayttaki öğelerin sağ/alt kenarlarını (EMU) döner */
async function inspectPptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const presentation = await zip.file("ppt/presentation.xml")!.async("string");
  const [, cx, cy] = presentation.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/)!;
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  const slides = await Promise.all(
    slideFiles.map(async (f) => {
      const xml = await zip.file(f)!.async("string");
      const boxes = Array.from(
        xml.matchAll(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)
      ).map(([, x, y, w, h]) => ({ right: Number(x) + Number(w), bottom: Number(y) + Number(h) }));
      return { file: f, xml, boxes };
    })
  );

  return { width: Number(cx), height: Number(cy), slides };
}

describe("PowerPoint Export Modülü (PptxGenJS)", () => {
  const mockProject: PptxExportProjectData = {
    projectName: "Ege & Akdeniz Yenilenebilir Enerji Portföyü",
    projectDescription: "RES ve GES santralleri 2026 Q1 dengesizlik ve karlılık analizi",
    totalActualMwh: 12500.5,
    totalRevenue: 28450000,
    totalImbalanceCost: 1120000,
    unitImbalanceCost: 89.6,
    monthlyBreakdown: [
      { month: "2026-01", actualMwh: 4100, revenue: 9200000, imbalanceCost: 380000 },
      { month: "2026-02", actualMwh: 3900, revenue: 8900000, imbalanceCost: 350000 },
      { month: "2026-03", actualMwh: 4500.5, revenue: 10350000, imbalanceCost: 390000 },
    ],
    plantComparison: [
      {
        plantId: "res-1",
        plantName: "Karaburun RES",
        plantType: "RES",
        capacityMw: 50,
        unitRevenue: 2280.5,
        unitImbalanceCost: 74.2,
        imbalanceCostRatio: 3.25,
        score: 92,
        rankInType: 1,
        totalInType: 1,
        assessment: "EXCELLENT",
        rationale: "Düşük sapma ve yüksek tahmin doğruluğu ile mükemmel portföy performansı.",
      },
      {
        plantId: "ges-1",
        plantName: "Toroslar GES",
        plantType: "GES",
        capacityMw: 30,
        unitRevenue: 2250.0,
        unitImbalanceCost: 115.4,
        imbalanceCostRatio: 5.13,
        score: 78,
        rankInType: 1,
        totalInType: 1,
        assessment: "GOOD",
        rationale: "Öğle saatleri stabil, sabah-akşam geçişlerinde hafif dengesizlik riski var.",
      },
    ],
  };

  const mockInsights: PptxExportInsightsData = {
    portfolioHighestCostHours: {
      totalAnalyzedHours: 2160,
      topNHours: 20,
      topHours: [],
      directionDistribution: {
        DEFICIT: { count: 14, percentage: 70 },
        SURPLUS: { count: 5, percentage: 25 },
        BALANCED: { count: 1, percentage: 5 },
        dominantDirection: "DEFICIT",
      },
      timeIntervalDistribution: {
        MORNING: { count: 10, percentage: 50, label: "Sabah (06:00 - 12:00)" },
        AFTERNOON: { count: 4, percentage: 20, label: "Öğle (12:00 - 17:00)" },
        EVENING: { count: 5, percentage: 25, label: "Akşam (17:00 - 22:00)" },
        NIGHT: { count: 1, percentage: 5, label: "Gece (22:00 - 06:00)" },
      },
      dominantInterval: {
        interval: "MORNING",
        label: "Sabah (06:00 - 12:00)",
        percentage: 50,
        count: 10,
      },
      topNMeanErrorRate: 0.285,
      overallMeanErrorRate: 0.121,
      errorRateRatio: 2.35,
      systematicBias: "OVER_FORECASTING",
      overForecastCount: 15,
      underForecastCount: 5,
      totalTopNCost: 345000,
      percentageOfTotalCost: 30.8,
    },
    plantInsights: [
      {
        plantName: "Karaburun RES",
        plantType: "RES",
        highestCostHours: {
          totalAnalyzedHours: 2160,
          topNHours: 20,
          topHours: [],
          directionDistribution: {
            DEFICIT: { count: 14, percentage: 70 },
            SURPLUS: { count: 5, percentage: 25 },
            BALANCED: { count: 1, percentage: 5 },
            dominantDirection: "DEFICIT",
          },
          timeIntervalDistribution: {
            MORNING: { count: 10, percentage: 50, label: "Sabah (06:00 - 12:00)" },
            AFTERNOON: { count: 4, percentage: 20, label: "Öğle (12:00 - 17:00)" },
            EVENING: { count: 5, percentage: 25, label: "Akşam (17:00 - 22:00)" },
            NIGHT: { count: 1, percentage: 5, label: "Gece (22:00 - 06:00)" },
          },
          dominantInterval: {
            interval: "MORNING",
            label: "Sabah (06:00 - 12:00)",
            percentage: 50,
            count: 10,
          },
          topNMeanErrorRate: 0.28,
          overallMeanErrorRate: 0.12,
          errorRateRatio: 2.3,
          systematicBias: "OVER_FORECASTING",
          overForecastCount: 14,
          underForecastCount: 6,
          totalTopNCost: 200000,
          percentageOfTotalCost: 32,
        },
        suggestions: [
          {
            id: "s1",
            title: "Sabah Diliminde GİP Pozisyon Güncellemesi",
            category: "INTRADAY",
            priority: "HIGH",
            triggerRule: "Kritik saatlerin %50'si sabah dilimindedir.",
            description: "Sabah saatlerinde rüzgar düşüşleri yaşandığında GİP'ten alım yapılmalıdır.",
            actionItems: ["Sabah 05:00'te SCADA verilerini inceleyin.", "GİP kontratları açın."],
            expectedImpact: "Geçmiş veride 120.000 ₺ tasarruf (dengesizlik maliyetinin %19 payı).",
            impact: {
              savingTl: 120000,
              percentOfCost: 19,
              method: "Sabah saatlerinde dengesizliğin %25 payı GİP'ten kapatıldı.",
              caveat: "Likidite dikkate alınmaz.",
            },
            recommended: true,
          },
        ],
      },
    ],
  };

  it("PowerPoint sunum dosyasını (.pptx Buffer) başarıyla üretmelidir", async () => {
    const buffer = await exportToPptx(mockProject, mockInsights);
    expect(buffer).toBeDefined();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(10000);
  });

  it("İçgörü veya santral karşılaştırma verisi eksik olduğunda da hata vermeden tamamlanmalıdır", async () => {
    const minimalProject: PptxExportProjectData = {
      projectName: "Minimal Proje",
      totalActualMwh: 100,
      totalRevenue: 200000,
      totalImbalanceCost: 5000,
      unitImbalanceCost: 50,
    };

    const buffer = await exportToPptx(minimalProject);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(5000);
  });

  it("Tüm slayt öğeleri slayt sınırları içinde kalmalıdır (16:9, 13,33 x 7,5 inç)", async () => {
    const buffer = await exportToPptx(mockProject, mockInsights);
    const { width, height, slides } = await inspectPptx(buffer);

    // LAYOUT_WIDE: 12192000 x 6858000 EMU (16:9)
    expect(width).toBe(12192000);
    expect(height).toBe(6858000);

    for (const slide of slides) {
      for (const box of slide.boxes) {
        expect(box.right, `${slide.file} sağ kenar`).toBeLessThanOrEqual(width);
        expect(box.bottom, `${slide.file} alt kenar`).toBeLessThanOrEqual(height);
      }
    }
  });

  it("Tahmin doğruluğu verisi varsa ayrı bir slayt olarak eklemelidir", async () => {
    const rec = (h: number, forecastMwh: number, actualMwh: number) => ({
      timestamp: new Date(Date.UTC(2025, 0, 1, h)),
      forecastMwh,
      actualMwh,
    });
    const hes = computeAccuracyStats([rec(0, 5, 10), rec(1, 3, 6)]);
    const res = computeAccuracyStats([rec(0, 10, 12), rec(1, 10, 7)]);

    const withAccuracy = await exportToPptx(
      {
        ...mockProject,
        forecastAccuracy: {
          plants: [
            {
              plantName: "HES_2",
              plantType: "HES",
              overall: hes,
              scaling: {
                scaleFactor: 1.2,
                baselineImbalanceCost: 3705379,
                scaledImbalanceCost: 3606778,
                changeTl: -98601,
                changeRatio: -98601 / 3705379,
              },
            },
            { plantName: "RES_1", plantType: "RES", overall: res },
          ],
          portfolio: computeAccuracyStats([rec(0, 5, 10), rec(1, 3, 6), rec(0, 10, 12), rec(1, 10, 7)]),
        },
      },
      mockInsights
    );
    const without = await exportToPptx(mockProject, mockInsights);

    const a = await inspectPptx(withAccuracy);
    const b = await inspectPptx(without);
    expect(a.slides.length).toBe(b.slides.length + 1);

    const accuracySlide = a.slides.find((s) => s.xml.includes("Tahmin Doğruluğu &amp; Sistematik Sapma"));
    expect(accuracySlide).toBeDefined();
    expect(accuracySlide!.xml).toContain("HES_2 (HES)");
    expect(accuracySlide!.xml).toContain("Ölçekli WAPE");
    expect(accuracySlide!.xml).toContain("Tahmin Ölçeklemesinin Dengesizlik Maliyetine Etkisi");
    expect(accuracySlide!.xml).toContain("−98.601 ₺");

    for (const box of accuracySlide!.boxes) {
      expect(box.right).toBeLessThanOrEqual(a.width);
      expect(box.bottom).toBeLessThanOrEqual(a.height);
    }
  });

  it("DSG netleştirme verisi varsa sınırlar içinde kalan ayrı bir slayt eklemelidir", async () => {
    const group = (label: string, kind: NettingGroupResult["kind"], standalone: number, netted: number): NettingGroupResult => ({
      key: label,
      label,
      kind,
      plantNames: kind === "technology" ? ["RES_1", "RES_2"] : label.split(" + "),
      hours: 8760,
      standaloneCost: standalone,
      nettedCost: netted,
      benefitTl: standalone - netted,
      benefitRatio: (standalone - netted) / standalone,
      grossImbalanceMwh: 89773,
      netImbalanceMwh: 59856,
      offsettingHourShare: 0.85,
    });

    const buffer = await exportToPptx(
      {
        ...mockProject,
        netting: {
          portfolio: group("Tüm Portföy", "portfolio", 34115987, 23556525),
          technologies: [group("RES Grubu", "technology", 26626013, 21085676)],
          pairs: [
            group("RES_1 + RES_2", "pair", 26626013, 21085676),
            group("RES_1 + HES_2", "pair", 22709396, 20257626),
            group("RES_1 + HES_1", "pair", 22788611, 20357214),
            group("RES_2 + HES_2", "pair", 11327376, 9148371),
          ],
        },
      },
      mockInsights
    );
    const { width, height, slides } = await inspectPptx(buffer);

    const nettingSlide = slides.find((s) => s.xml.includes("Dengeden Sorumlu Grup (DSG) Netleştirme Analizi"));
    expect(nettingSlide).toBeDefined();
    expect(nettingSlide!.xml).toContain("10.559.462 ₺");
    // Teknoloji grubuyla aynı çift (RES_1 + RES_2) atlanır, kalanlardan ilk 3 çift gösterilir
    // RES_1 + RES_2 tablo satırı olarak değil, yalnızca yorumdaki "en yüksek ikili fayda" cümlesinde geçer
    expect(nettingSlide!.xml.match(/RES_1 \+ RES_2/g)).toHaveLength(1);
    expect(nettingSlide!.xml).toContain("En yüksek ikili fayda RES_1 + RES_2");
    expect(nettingSlide!.xml).toContain("RES_1 + HES_2");
    expect(nettingSlide!.xml).toContain("RES_2 + HES_2");

    for (const slide of slides) {
      for (const box of slide.boxes) {
        expect(box.right, `${slide.file} sağ kenar`).toBeLessThanOrEqual(width);
        expect(box.bottom, `${slide.file} alt kenar`).toBeLessThanOrEqual(height);
      }
    }
  });
});
