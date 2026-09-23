import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  processHourlyRecord,
  aggregateMonthly,
  aggregateYearly,
} from "@/lib/calculations";
import {
  DEFAULT_IMBALANCE_PROFILE,
  HourlyRecord,
  HourlyResult,
  MarketPriceRecord,
  MonthlyAggregate,
  SystemDirection,
  YearlyAggregate,
  toPricingProfile,
} from "@/lib/calculations/types";
import {
  findHighestCostHours,
  generateMitigationSuggestions,
  comparePlantProfitability,
  PlantInfo,
} from "@/lib/strategy/insights";
import {
  exportToPptx,
  PptxExportProjectData,
  PptxExportInsightsData,
} from "@/lib/export/pptx";
import { computeAccuracyStats } from "@/lib/analysis/forecast-accuracy";
import { simulateForecastScaling } from "@/lib/analysis/scaling-impact";
import { analyzePortfolioNetting } from "@/lib/analysis/portfolio-netting";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        pricingProfiles: true,
        plants: {
          include: {
            records: {
              include: {
                marketData: true,
              },
              orderBy: {
                timestamp: "asc",
              },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        {
          success: false,
          error: `ID'si '${projectId}' olan proje bulunamadı.`,
        },
        { status: 404 }
      );
    }

    const allHourlyResults: HourlyResult[] = [];
    const plantResultsMap: Record<
      string,
      {
        hourly: HourlyResult[];
        monthly: MonthlyAggregate[];
        yearly: YearlyAggregate;
      }
    > = {};
    const plantsInfo: PlantInfo[] = [];

    const projectProfile = toPricingProfile(project.pricingProfiles?.[0]);

    // 1. Santral bazlı hesaplamalar
    for (const plant of project.plants) {
      plantsInfo.push({
        plantId: plant.id,
        plantName: plant.name,
        plantType: plant.type,
        capacityMw: plant.capacityMw,
      });

      const plantHourly: HourlyResult[] = [];

      for (const record of plant.records) {
        if (!record.marketData) continue;

        const hourlyRecord: HourlyRecord = {
          timestamp: record.timestamp,
          actualMwh: record.actualMwh,
          forecastMwh: record.forecastMwh,
          plantId: plant.id,
          plantName: plant.name,
        };

        const marketPriceRecord: MarketPriceRecord = {
          timestamp: record.marketData.timestamp,
          ptf: record.marketData.ptf,
          smf: record.marketData.smf,
          systemDirection: record.marketData.systemDirection as SystemDirection,
        };

        const result = processHourlyRecord(
          hourlyRecord,
          marketPriceRecord,
          projectProfile
        );
        result.plantId = plant.id;
        result.plantName = plant.name;

        plantHourly.push(result);
        allHourlyResults.push(result);
      }

      const monthly = aggregateMonthly(plantHourly);
      const yearly = aggregateYearly(monthly);

      plantResultsMap[plant.id] = {
        hourly: plantHourly,
        monthly,
        yearly,
      };
    }

    // 2. Portföy Geneli Aylık ve Yıllık
    const portfolioMonthly = aggregateMonthly(allHourlyResults);
    const portfolioYearly = aggregateYearly(portfolioMonthly);

    // 3. Strateji ve İçgörüler
    const portfolioHighestCostHours = findHighestCostHours(allHourlyResults, 20);

    const plantInsights = project.plants.map((plant) => {
      const plantHourly = plantResultsMap[plant.id]?.hourly || [];
      const costAnalysis = findHighestCostHours(plantHourly, 20);
      const suggestions = generateMitigationSuggestions(
        {
          plantId: plant.id,
          plantName: plant.name,
          plantType: plant.type,
          capacityMw: plant.capacityMw,
        },
        costAnalysis
      );

      return {
        plantName: plant.name,
        plantType: plant.type,
        highestCostHours: costAnalysis,
        suggestions,
      };
    });

    const plantComparison = comparePlantProfitability(
      plantsInfo,
      plantResultsMap
    );

    // 4. PPTX Veri Yapısını Hazırla
    const pptxProjectData: PptxExportProjectData = {
      projectName: project.name,
      projectDescription: project.description || undefined,
      totalActualMwh: portfolioYearly.totalActualMwh,
      totalRevenue: portfolioYearly.totalRevenue,
      totalImbalanceCost: portfolioYearly.totalImbalanceCost,
      unitImbalanceCost: portfolioYearly.unitImbalanceCost,
      monthlyBreakdown: portfolioMonthly.map((m) => ({
        month: m.yearMonth,
        actualMwh: m.totalActualMwh,
        revenue: m.totalRevenue,
        imbalanceCost: m.totalImbalanceCost,
      })),
      plantComparison,
      // Fiyattan bağımsız: piyasa verisi eşleşmeyen saatler de dahil edilir
      forecastAccuracy: {
        plants: project.plants
          .filter((plant) => plant.records.length > 0)
          .map((plant) => ({
            plantName: plant.name,
            plantType: plant.type,
            overall: computeAccuracyStats(plant.records),
            scaling:
              plantResultsMap[plant.id]?.hourly.length > 0
                ? simulateForecastScaling(plantResultsMap[plant.id].hourly, projectProfile)
                : undefined,
          })),
        portfolio: computeAccuracyStats(project.plants.flatMap((plant) => plant.records)),
      },
      netting: analyzePortfolioNetting(
        project.plants.map((plant) => ({
          plantId: plant.id,
          plantName: plant.name,
          plantType: plant.type,
          hourly: plantResultsMap[plant.id]?.hourly ?? [],
        })),
        projectProfile
      ),
    };

    const pptxInsightsData: PptxExportInsightsData = {
      portfolioHighestCostHours,
      plantInsights,
    };

    const pptxBuffer = await exportToPptx(pptxProjectData, pptxInsightsData);

    const safeFilename = encodeURIComponent(
      `TR-Energy_${project.name.replace(/\s+/g, "_")}.pptx`
    );

    return new NextResponse(pptxBuffer as any, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      },
    });
  } catch (error) {
    console.error("PPTX export error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "PowerPoint sunumu oluşturulurken bir hata meydana geldi.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
