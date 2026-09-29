import { NextResponse } from "next/server";
import { displayDescription } from "@/lib/projects/description";
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
import { buildPlantReport, settleByCompany } from "@/lib/report/plant-report";
import { buildReportContext } from "@/lib/services/report-context";
import { parseAggregatorPortfolio, settlementIdentity } from "@/lib/projects/aggregator";

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
          imbalancePosPrice: record.marketData.imbalancePosPrice,
          imbalanceNegPrice: record.marketData.imbalanceNegPrice,
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
        ...settlementIdentity(plant, project.aggregatorName),
        yekdem: plant.yekdem,
        yekdemNextYear: plant.yekdemNextYear,
        epiasPlantId: plant.epiasPlantId,
        hourly: plantHourlyResults,
        monthly,
        yearly,
      });
    }

    // 3. Tüm portföy: dengesizlik şirket bazında uzlaştırılır (her piyasa katılımcısı kendi dengesinden sorumludur;
    // aynı şirketin santralleri her saat birlikte netleşir). Santral bazındaki toplam `settlement.plantLevelCostTl`'dedir.
    const portfolioHourly = settleByCompany(plantResults, projectProfile).map((r) => ({
      ...r,
      plantId: undefined,
      plantName: undefined,
    }));
    const portfolioMonthly = aggregateMonthly(portfolioHourly);
    const portfolioYearly = aggregateYearly(portfolioMonthly);

    // 4. Sapma yükü özeti (Dengesizlik Karnesi ile aynı motor): KÜPST, YEKDEM varsayımları, 2026, portföy kapsamı
    const withData = plantResults.filter((p) => p.hourly.length > 0);
    let sapma = null;
    if (withData.length > 0) {
      const year = new Date(withData[0].hourly[0].timestamp).getUTCFullYear();
      const { context, check } = await buildReportContext(withData, year);
      const report = buildPlantReport(
        {
          project: { id: project.id, name: project.name },
          profile: projectProfile,
          aggregator: project.aggregatorName
            ? { name: project.aggregatorName, portfolio: parseAggregatorPortfolio(project.aggregatorPortfolio) }
            : null,
          plants: withData,
        },
        context,
        { intraday: false }
      );
      sapma = {
        settlement: report.settlement,
        kupst: report.kupst,
        kupstByPlant: Object.fromEntries(report.plants.map((p) => [p.name, p.kupstTl])),
        coefficients2026: report.coefficients2026,
        yekdem: report.yekdem,
        coverage: report.coverage,
        dsg: report.dsg,
        riskPremium: report.riskPremium
          ? {
              rules: report.riskPremium.rules,
              portfolio: report.riskPremium.portfolio,
              plants: report.riskPremium.plants.map(({ months: _m, ...p }) => p),
            }
          : null,
        sector: report.sector,
        aggregator: report.aggregator,
        outages: report.outages,
        fairShare: report.fairShare,
        marketProfile: report.marketProfile,
        check,
      };
    }

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
        description: displayDescription(project.description),
      },
      pricingProfile: project.pricingProfiles?.[0] || {
        name: "EPİAŞ Standart Profil",
        ...DEFAULT_IMBALANCE_PROFILE,
      },
      plants: plantResults,
      // Başlık altındaki sade özet: şirket(ler), santral sayısı, kurulu güç ve veri kaynağı
      summary: {
        plantCount: project.plants.length,
        capacityMw: project.plants.reduce((sum, p) => sum + p.capacityMw, 0),
        companies: Array.from(new Set(project.plants.map((p) => p.organizationName).filter((n): n is string => !!n))),
        source: (() => {
          const epias = project.plants.filter((p) => p.epiasPlantId !== null);
          if (epias.length === 0) return "Dosyadan yüklenen veri";
          const versions = new Set(epias.map((p) => p.kgupVersion ?? "FIRST"));
          const v = versions.size > 1 ? "KGÜP ilk ve son versiyon" : versions.has("FINAL") ? "KGÜP son versiyon" : "KGÜP ilk versiyon";
          return epias.length === project.plants.length ? `EPİAŞ (${v}, UEVM)` : `EPİAŞ (${v}) ve dosya`;
        })(),
      },
      portfolio: {
        monthly: portfolioMonthly,
        yearly: portfolioYearly,
      },
      comparison: comparePlants(plantInputs),
      netting: analyzePortfolioNetting(plantInputs, projectProfile),
      sapma,
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
