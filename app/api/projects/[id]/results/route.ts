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
  SystemDirection,
  toPricingProfile,
} from "@/lib/calculations/types";
import { comparePlants } from "@/lib/analysis/plant-comparison";
import { analyzePortfolioNetting } from "@/lib/analysis/portfolio-netting";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;

    // 1. Projeyi, bağlı santralleri, fiyat profilini ve ilişkili piyasa verilerini çek
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

    const projectProfile = toPricingProfile(project.pricingProfiles?.[0]);

    const allHourlyResults: HourlyResult[] = [];
    const plantResults = [];

    // 2. Her santral için saatlik, aylık ve yıllık hesaplamaları yap
    for (const plant of project.plants) {
      const plantHourlyResults: HourlyResult[] = [];

      for (const record of plant.records) {
        if (!record.marketData) {
          continue;
        }

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

        const hourlyResult = processHourlyRecord(
          hourlyRecord,
          marketPriceRecord,
          projectProfile
        );

        // Santral kimlik bilgilerini sonuca ekle
        hourlyResult.plantId = plant.id;
        hourlyResult.plantName = plant.name;

        plantHourlyResults.push(hourlyResult);
        allHourlyResults.push(hourlyResult);
      }

      // Santral aylık ve yıllık agregasyonu
      const monthly = aggregateMonthly(plantHourlyResults);
      const yearly = aggregateYearly(monthly);

      plantResults.push({
        plantId: plant.id,
        plantName: plant.name,
        plantType: plant.type,
        capacityMw: plant.capacityMw,
        hourly: plantHourlyResults,
        monthly,
        yearly,
      });
    }

    // 3. Tüm portföy için konsolide aylık ve yıllık agregasyon
    // Portföy toplamı için plantId filtrelemesini kaldırarak grupluyoruz
    const portfolioHourly = allHourlyResults.map((r) => ({
      ...r,
      plantId: undefined,
      plantName: undefined,
    }));
    const portfolioMonthly = aggregateMonthly(portfolioHourly);
    const portfolioYearly = aggregateYearly(portfolioMonthly);

    const plantInputs = plantResults.map((p) => ({
      plantId: p.plantId,
      plantName: p.plantName,
      plantType: p.plantType,
      hourly: p.hourly,
    }));

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      pricingProfile: project.pricingProfiles?.[0] || {
        name: "EPİAŞ Standart Profil",
        ...DEFAULT_IMBALANCE_PROFILE,
      },
      plants: plantResults,
      portfolio: {
        monthly: portfolioMonthly,
        yearly: portfolioYearly,
      },
      comparison: comparePlants(plantInputs),
      netting: analyzePortfolioNetting(plantInputs, projectProfile),
    });
  } catch (error) {
    console.error("Results API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Sonuçlar hesaplanırken bir hata oluştu.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
