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

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;

    // 1. Projeyi, santralleri, fiyat profilini ve verilerini çek
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

    const projectProfile = toPricingProfile(project.pricingProfiles?.[0]);

    const plantsInfo: PlantInfo[] = [];

    // 2. Santral bazlı saatlik hesaplamaları yap
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
          gipPrice: record.marketData.gipPrice,
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

    // 3. Kural Tabanlı Analiz Fonksiyonlarını Çalıştır
    // A. Portföy Geneli En Maliyetli Saatler
    const portfolioHighestCostHours = findHighestCostHours(allHourlyResults, 20);

    // B. Santral Bazlı En Maliyetli Saatler ve Aksiyon Önerileri
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
        costAnalysis,
        plantHourly,
        projectProfile
      );

      return {
        plantId: plant.id,
        plantName: plant.name,
        plantType: plant.type,
        capacityMw: plant.capacityMw,
        highestCostHours: costAnalysis,
        suggestions,
      };
    });

    // C. Santral Karlılık ve Portföy Yönetim Riski Karşılaştırması
    const profitabilityComparison = comparePlantProfitability(
      plantsInfo,
      plantResultsMap
    );

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      portfolioAnalysis: {
        highestCostHours: portfolioHighestCostHours,
      },
      plantInsights,
      profitabilityComparison,
    });
  } catch (error) {
    console.error("Insights API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Stratejik içgörüler oluşturulurken bir hata oluştu.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
