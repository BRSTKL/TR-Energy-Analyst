import { NextResponse } from "next/server";
import { withProjectCache } from "@/lib/services/response-cache";
import { displayDescription } from "@/lib/projects/description";
import { prisma } from "@/lib/prisma";
import { aggregateMonthly, aggregateYearly } from "@/lib/calculations";
import { HourlyResult, MonthlyAggregate, YearlyAggregate } from "@/lib/calculations/types";
import {
  findHighestCostHours,
  generateMitigationSuggestions,
  comparePlantProfitability,
  PlantInfo,
  type SectorScoreContext,
} from "@/lib/strategy/insights";
import { buildReportContext } from "@/lib/services/report-context";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { settleByCompany } from "@/lib/report/plant-report";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/insights
 *
 * Santral görünümleri santralin kendi saatleriyle; "Tüm Portföy" görünümü ise sonuç sayfası ve raporla aynı tabanla,
 * yani uzlaştırma biriminde (şirket ya da toplayıcı) saat saat netleşmiş dengesizlikle hesaplanır. Böylece portföyün
 * en pahalı saatleri ve önerileri tek tek santral saatlerinden değil, fiilen uzlaştırılan net sapmadan çıkar.
 */
async function handleGET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const data = await loadProjectHourly(projectId);
    if (!data) {
      return NextResponse.json({ success: false, error: `ID'si '${projectId}' olan proje bulunamadı.` }, { status: 404 });
    }
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { description: true } });
    const profile = data.profile;

    const plantsInfo: PlantInfo[] = data.plants.map((p) => ({
      plantId: p.plantId,
      plantName: p.plantName,
      plantType: p.plantType,
      capacityMw: p.capacityMw,
    }));
    const plantResultsMap: Record<string, { hourly: HourlyResult[]; monthly: MonthlyAggregate[]; yearly: YearlyAggregate }> = {};
    for (const p of data.plants) {
      const monthly = aggregateMonthly(p.hourly);
      plantResultsMap[p.plantId] = { hourly: p.hourly, monthly, yearly: aggregateYearly(monthly) };
    }

    // Tüm Portföy: uzlaştırma biriminde netleşmiş saatler (birden çok şirket varsa her şirketin net saati ayrı satırdır)
    const withData = data.plants.filter((p) => p.hourly.length > 0);
    const portfolioHourly = settleByCompany(withData, profile);
    const portfolioCapacity = withData.reduce((sum, p) => sum + p.capacityMw, 0);
    const portfolioCost = findHighestCostHours(portfolioHourly, 20, portfolioCapacity);
    const types = Array.from(new Set(withData.map((p) => p.plantType)));
    const portfolioSuggestions = generateMitigationSuggestions(
      {
        plantId: "portfolio",
        plantName: "Tüm Portföy",
        // Teknolojiye özgü kural yalnızca portföy tek teknolojiyse uygulanır
        plantType: types.length === 1 ? types[0] : "MIXED",
        capacityMw: portfolioCapacity,
      },
      portfolioCost,
      portfolioHourly,
      profile
    );

    // Santral karnesi puanı: aynı dönemin sektör karnesindeki yer (varsa)
    let sector: SectorScoreContext | undefined;
    if (withData.length) {
      const year = new Date(withData[0].hourly[0].timestamp).getUTCFullYear();
      const s = (await buildReportContext(withData, year)).context.sector;
      if (s) {
        sector = {
          label: s.label ?? String(s.year),
          byType: Object.fromEntries(
            Object.entries(s.byType).map(([t, v]) => [t, v ? { values: v.values, median: v.unitImbalanceTl.median } : undefined])
          ),
        };
      }
    }

    const plantInsights = data.plants.map((p) => {
      const costAnalysis = findHighestCostHours(p.hourly, 20, p.capacityMw);
      return {
        plantId: p.plantId,
        plantName: p.plantName,
        plantType: p.plantType,
        capacityMw: p.capacityMw,
        highestCostHours: costAnalysis,
        suggestions: generateMitigationSuggestions(
          { plantId: p.plantId, plantName: p.plantName, plantType: p.plantType, capacityMw: p.capacityMw },
          costAnalysis,
          p.hourly,
          profile
        ),
      };
    });

    return NextResponse.json({
      success: true,
      project: {
        id: data.project.id,
        name: data.project.name,
        description: displayDescription(project?.description ?? null),
      },
      portfolioAnalysis: {
        highestCostHours: portfolioCost,
        suggestions: portfolioSuggestions,
        settlementUnit: data.aggregator ? `${data.aggregator.name} portföyü` : "şirket bazında",
      },
      plantInsights,
      profitabilityComparison: comparePlantProfitability(plantsInfo, plantResultsMap, sector),
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

/** Sonuç projenin veri sürümüne göre önbellekten (PLAN 10.2) */
export const GET = withProjectCache(handleGET);
