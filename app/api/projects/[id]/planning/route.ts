import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  processHourlyRecord,
  aggregateMonthly,
} from "@/lib/calculations";
import {
  DEFAULT_IMBALANCE_PROFILE,
  HourlyRecord,
  HourlyResult,
  MarketPriceRecord,
  SystemDirection,
  toPricingProfile,
} from "@/lib/calculations/types";
import {
  rankPeriodsByEfficiency,
  detectForecastBias,
  simulateBiasCorrectedForecast,
  calculatePotentialUplift,
  calculateEfficiencyRatio,
} from "@/lib/analysis/planning-efficiency";
import { evaluateIntradayArbitrage } from "@/lib/analysis/intraday-arbitrage";
import { volumeRatioBacktestSummary } from "@/lib/analysis/backtest";

export const dynamic = "force-dynamic";

interface DayHourHeatmapCell {
  dayOfWeekIndex: number; // 0: Pazartesi ... 6: Pazar
  dayName: string;
  hour: number; // 0..23
  hourStr: string; // "00:00"
  efficiencyRatio: number;
  totalActualMwh: number;
  totalForecastMwh: number;
  totalLossTl: number;
  count: number;
}

const DAY_NAMES_TR = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

const MONTH_NAMES_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

function buildHeatmapMatrix(results: HourlyResult[]): DayHourHeatmapCell[] {
  // 7 gün x 24 saat kova matrisi
  const buckets: {
    totalRevenue: number;
    fictiveRevenue: number;
    totalActualMwh: number;
    totalForecastMwh: number;
    lossTl: number;
    count: number;
  }[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({
      totalRevenue: 0,
      fictiveRevenue: 0,
      totalActualMwh: 0,
      totalForecastMwh: 0,
      lossTl: 0,
      count: 0,
    }))
  );

  for (const item of results) {
    const d = new Date(item.timestamp);
    // JS getUTCDay() (duvar saati UTC alanında): 0 = Pazar, 1 = Pzt, ..., 6 = Cmt
    // Pazartesi = 0, Salı = 1, ..., Pazar = 6
    const dayIndex = (d.getUTCDay() + 6) % 7;
    const hour = d.getUTCHours();

    const cell = buckets[dayIndex][hour];
    cell.totalRevenue += item.totalRevenue;
    cell.fictiveRevenue += item.fictiveRevenue;
    cell.totalActualMwh += item.actualMwh;
    cell.totalForecastMwh += item.forecastMwh;
    cell.lossTl += item.imbalanceCost;
    cell.count += 1;
  }

  const cells: DayHourHeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const b = buckets[d][h];
      const effRatio =
        b.count > 0 ? calculateEfficiencyRatio(b.totalRevenue, b.fictiveRevenue) : 1.0;
      cells.push({
        dayOfWeekIndex: d,
        dayName: DAY_NAMES_TR[d],
        hour: h,
        hourStr: `${h < 10 ? "0" : ""}${h}:00`,
        efficiencyRatio: Number(effRatio.toFixed(3)),
        totalActualMwh: Number(b.totalActualMwh.toFixed(2)),
        totalForecastMwh: Number(b.totalForecastMwh.toFixed(2)),
        totalLossTl: Number(b.lossTl.toFixed(2)),
        count: b.count,
      });
    }
  }

  return cells;
}

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

    const projectProfile = toPricingProfile(project.pricingProfiles?.[0]);

    const allHourlyResults: HourlyResult[] = [];
    const plantResultsMap = new Map<
      string,
      {
        plantId: string;
        plantName: string;
        plantType: string;
        capacityMw: number;
        hourly: HourlyResult[];
      }
    >();

    // 1. Her santral için saatlik sonuçları hesapla
    for (const plant of project.plants) {
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
          gipVolumeMwh: record.marketData.gipVolumeMwh,
          gipMinPrice: record.marketData.gipMinPrice,
          gipMaxPrice: record.marketData.gipMaxPrice,
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

      plantResultsMap.set(plant.id, {
        plantId: plant.id,
        plantName: plant.name,
        plantType: plant.type,
        capacityMw: plant.capacityMw,
        hourly: plantHourly,
      });
    }

    // Tarihe göre saatlik harita (en verimsiz günlerin 24 saatlik detayını hızlı çekmek için)
    const hourlyByDatePortfolio = new Map<string, HourlyResult[]>();
    for (const r of allHourlyResults) {
      const dStr = new Date(r.timestamp).toISOString().substring(0, 10);
      const arr = hourlyByDatePortfolio.get(dStr) || [];
      arr.push(r);
      hourlyByDatePortfolio.set(dStr, arr);
    }

    // Helper: Bir saatlik veri dizisi için drill-down gün detayını oluşturur
    const attachHourlyDetails = (
      worstDays: ReturnType<typeof rankPeriodsByEfficiency>,
      hourlyMap: Map<string, HourlyResult[]>
    ) => {
      return worstDays.map((wd) => {
        const dayHours = hourlyMap.get(wd.period) || [];
        // Saat bazında (00:00 - 23:00) topla/grupla (eğer portföy ise birden çok santral olabilir)
        const hourMap = new Map<
          number,
          {
            hour: string;
            timestamp: string;
            actualMwh: number;
            forecastMwh: number;
            ptf: number;
            smf: number;
            gipPrice?: number | null;
            systemDirection: SystemDirection;
            imbalanceMwh: number;
            imbalanceCost: number;
            totalRevenue: number;
            fictiveRevenue: number;
            count: number;
          }
        >();

        for (const h of dayHours) {
          const hr = new Date(h.timestamp).getUTCHours();
          const existing = hourMap.get(hr);
          if (!existing) {
            hourMap.set(hr, {
              hour: `${hr < 10 ? "0" : ""}${hr}:00`,
              timestamp:
                typeof h.timestamp === "string"
                  ? h.timestamp
                  : h.timestamp.toISOString(),
              actualMwh: h.actualMwh,
              forecastMwh: h.forecastMwh,
              ptf: h.ptf,
              smf: h.smf,
              gipPrice: h.gipPrice ?? null,
              systemDirection: h.systemDirection,
              imbalanceMwh: h.imbalanceMwh,
              imbalanceCost: h.imbalanceCost,
              totalRevenue: h.totalRevenue,
              fictiveRevenue: h.fictiveRevenue,
              count: 1,
            });
          } else {
            existing.actualMwh += h.actualMwh;
            existing.forecastMwh += h.forecastMwh;
            existing.imbalanceMwh += h.imbalanceMwh;
            existing.imbalanceCost += h.imbalanceCost;
            existing.totalRevenue += h.totalRevenue;
            existing.fictiveRevenue += h.fictiveRevenue;
            // Fiyatlar piyasa geneli aynıdır
            existing.count += 1;
          }
        }

        const hourly24 = Array.from({ length: 24 }, (_, i) => {
          const item = hourMap.get(i);
          if (item) {
            return {
              hour: item.hour,
              timestamp: item.timestamp,
              actualMwh: Number(item.actualMwh.toFixed(2)),
              forecastMwh: Number(item.forecastMwh.toFixed(2)),
              ptf: Number(item.ptf.toFixed(2)),
              smf: Number(item.smf.toFixed(2)),
              gipPrice: item.gipPrice ?? null,
              systemDirection: item.systemDirection,
              imbalanceMwh: Number(item.imbalanceMwh.toFixed(2)),
              imbalanceCost: Number(item.imbalanceCost.toFixed(2)),
              totalRevenue: Number(item.totalRevenue.toFixed(2)),
              fictiveRevenue: Number(item.fictiveRevenue.toFixed(2)),
            };
          }
          return {
            hour: `${i < 10 ? "0" : ""}${i}:00`,
            timestamp: `${wd.period}T${i < 10 ? "0" : ""}${i}:00:00.000Z`,
            actualMwh: 0,
            forecastMwh: 0,
            ptf: 0,
            smf: 0,
            gipPrice: null,
            systemDirection: "BALANCED" as SystemDirection,
            imbalanceMwh: 0,
            imbalanceCost: 0,
            totalRevenue: 0,
            fictiveRevenue: 0,
          };
        });

        return {
          ...wd,
          hourlyDetail: hourly24,
        };
      });
    };

    // 2. Portföy Geneli Hesaplamalar
    const portfolioTotalRevenue = allHourlyResults.reduce((s, r) => s + r.totalRevenue, 0);
    const portfolioFictiveRevenue = allHourlyResults.reduce((s, r) => s + r.fictiveRevenue, 0);
    const portfolioTotalActual = allHourlyResults.reduce((s, r) => s + r.actualMwh, 0);
    const portfolioTotalForecast = allHourlyResults.reduce((s, r) => s + r.forecastMwh, 0);
    const portfolioLossTl = portfolioFictiveRevenue - portfolioTotalRevenue;
    const portfolioEfficiencyRatio = calculateEfficiencyRatio(
      portfolioTotalRevenue,
      portfolioFictiveRevenue
    );

    const portfolioBias = detectForecastBias(allHourlyResults);
    const portfolioSimulatedHourly = simulateBiasCorrectedForecast(
      allHourlyResults,
      portfolioBias,
      projectProfile
    );
    const portfolioUplift = calculatePotentialUplift(
      allHourlyResults,
      portfolioSimulatedHourly
    );

    // Portföy Aylık Trend (Kronolojik: Ocak - Aralık)
    const portfolioMonthlyEfficiency = rankPeriodsByEfficiency(
      allHourlyResults,
      "month"
    )
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((m) => {
        const monthNum = parseInt(m.period.split("-")[1], 10);
        return {
          yearMonth: m.period,
          monthName: MONTH_NAMES_TR[monthNum - 1] || m.period,
          totalRevenue: m.totalRevenue,
          fictiveRevenue: m.fictiveRevenue,
          lossTl: m.lossTl,
          efficiencyRatio: m.efficiencyRatio,
          efficiencyPercent: Number((m.efficiencyRatio * 100).toFixed(1)),
          totalActualMwh: m.totalActualMwh,
          totalForecastMwh: m.totalForecastMwh,
        };
      });

    // Portföy En Verimsiz 10 Gün
    const portfolioRankedDays = rankPeriodsByEfficiency(allHourlyResults, "day");
    const portfolioWorst10Days = attachHourlyDetails(
      portfolioRankedDays.slice(0, 10),
      hourlyByDatePortfolio
    );

    // Portföy Isı Haritası
    const portfolioHeatmap = buildHeatmapMatrix(allHourlyResults);

    // Portföy GİP Arbitraj Analizi
    const portfolioArbitrage = evaluateIntradayArbitrage(allHourlyResults);

    // 3. Santral Bazlı Hesaplamalar
    const plantsData = project.plants.map((plant) => {
      const plantHourly = plantResultsMap.get(plant.id)?.hourly || [];

      const plantHourlyByDate = new Map<string, HourlyResult[]>();
      for (const r of plantHourly) {
        const dStr = new Date(r.timestamp).toISOString().substring(0, 10);
        const arr = plantHourlyByDate.get(dStr) || [];
        arr.push(r);
        plantHourlyByDate.set(dStr, arr);
      }

      const totalRevenue = plantHourly.reduce((s, r) => s + r.totalRevenue, 0);
      const fictiveRevenue = plantHourly.reduce((s, r) => s + r.fictiveRevenue, 0);
      const totalActualMwh = plantHourly.reduce((s, r) => s + r.actualMwh, 0);
      const totalForecastMwh = plantHourly.reduce((s, r) => s + r.forecastMwh, 0);
      const lossTl = fictiveRevenue - totalRevenue;
      const efficiencyRatio = calculateEfficiencyRatio(totalRevenue, fictiveRevenue);

      const bias = detectForecastBias(plantHourly, plant.id);
      const simulatedHourly = simulateBiasCorrectedForecast(
        plantHourly,
        bias,
        projectProfile
      );
      const uplift = calculatePotentialUplift(plantHourly, simulatedHourly);

      // Aylık verimlilik (Kronolojik: Ocak - Aralık)
      const monthlyEfficiency = rankPeriodsByEfficiency(plantHourly, "month")
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((m) => {
          const monthNum = parseInt(m.period.split("-")[1], 10);
          return {
            yearMonth: m.period,
            monthName: MONTH_NAMES_TR[monthNum - 1] || m.period,
            totalRevenue: m.totalRevenue,
            fictiveRevenue: m.fictiveRevenue,
            lossTl: m.lossTl,
            efficiencyRatio: m.efficiencyRatio,
            efficiencyPercent: Number((m.efficiencyRatio * 100).toFixed(1)),
            totalActualMwh: m.totalActualMwh,
            totalForecastMwh: m.totalForecastMwh,
          };
        });

      const rankedDays = rankPeriodsByEfficiency(plantHourly, "day");
      const worst10Days = attachHourlyDetails(
        rankedDays.slice(0, 10),
        plantHourlyByDate
      );
      const heatmap = buildHeatmapMatrix(plantHourly);
      const plantArbitrage = evaluateIntradayArbitrage(plantHourly);

      return {
        plantId: plant.id,
        plantName: plant.name,
        plantType: plant.type,
        capacityMw: plant.capacityMw,
        summary: {
          totalActualMwh: Number(totalActualMwh.toFixed(2)),
          totalForecastMwh: Number(totalForecastMwh.toFixed(2)),
          totalRevenue: Number(totalRevenue.toFixed(2)),
          fictiveRevenue: Number(fictiveRevenue.toFixed(2)),
          lossTl: Number(lossTl.toFixed(2)),
          efficiencyRatio: Number(efficiencyRatio.toFixed(4)),
          efficiencyPercent: Number((efficiencyRatio * 100).toFixed(1)),
        },
        bias,
        uplift,
        upliftBacktest: volumeRatioBacktestSummary(plantHourly, projectProfile),
        monthlyEfficiency,
        worst10Days,
        heatmap,
        arbitrage: plantArbitrage,
      };
    });

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      pricingProfile: projectProfile,
      portfolio: {
        summary: {
          totalActualMwh: Number(portfolioTotalActual.toFixed(2)),
          totalForecastMwh: Number(portfolioTotalForecast.toFixed(2)),
          totalRevenue: Number(portfolioTotalRevenue.toFixed(2)),
          fictiveRevenue: Number(portfolioFictiveRevenue.toFixed(2)),
          lossTl: Number(portfolioLossTl.toFixed(2)),
          efficiencyRatio: Number(portfolioEfficiencyRatio.toFixed(4)),
          efficiencyPercent: Number((portfolioEfficiencyRatio * 100).toFixed(1)),
        },
        bias: portfolioBias,
        uplift: portfolioUplift,
        upliftBacktest: volumeRatioBacktestSummary(allHourlyResults, projectProfile),
        monthlyEfficiency: portfolioMonthlyEfficiency,
        worst10Days: portfolioWorst10Days,
        heatmap: portfolioHeatmap,
        arbitrage: portfolioArbitrage,
      },
      plants: plantsData,
    });
  } catch (error) {
    console.error("Planning Efficiency API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Planlama verimliliği ve simülasyon hesaplanırken bir hata oluştu.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
