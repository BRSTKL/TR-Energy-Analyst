import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processHourlyRecord } from "@/lib/calculations/engine";
import {
  HourlyResult,
  ImbalancePricingProfile,
  REGULATORY_IMBALANCE_REGIMES,
  SystemDirection,
  toPricingProfile,
} from "@/lib/calculations/types";
import { BacktestResult, combineBacktests, runBacktest } from "@/lib/analysis/backtest";

export const dynamic = "force-dynamic";

const TRAIN_MONTHS = 4;

/**
 * GET /api/projects/[id]/backtest
 * Her santral için kaydırmalı geriye dönük testi iki fiyat rejiminde çalıştırır:
 * - "project": projenin fiyat profili (mevzuat modunda her saat kendi tarihinin kuralıyla)
 * - "rules2026": tüm veri 2026 kurallarıyla (sistem yönüne bağlı %3 / %6) yeniden fiyatlanır
 * Portföy sonucu santral sonuçlarının toplamıdır (DSG netleştirmesi uygulanmaz).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        pricingProfiles: true,
        plants: {
          include: { records: { include: { marketData: true }, orderBy: { timestamp: "asc" } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!project) {
      return NextResponse.json({ success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` }, { status: 404 });
    }

    const projectProfile = toPricingProfile(project.pricingProfiles?.[0]);
    const rules2026: ImbalancePricingProfile = {
      mode: "CUSTOM",
      ...REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].coefficients,
    };

    const plantHourly = project.plants.map((plant) => ({
      plant,
      hourly: plant.records.flatMap((r): HourlyResult[] =>
        r.marketData
          ? [
              processHourlyRecord(
                { timestamp: r.timestamp, actualMwh: r.actualMwh, forecastMwh: r.forecastMwh, plantId: plant.id, plantName: plant.name },
                {
                  timestamp: r.marketData.timestamp,
                  ptf: r.marketData.ptf,
                  smf: r.marketData.smf,
                  systemDirection: r.marketData.systemDirection as SystemDirection,
                  gipPrice: r.marketData.gipPrice,
                },
                projectProfile
              ),
            ]
          : []
      ),
    }));

    const run = (profile: ImbalancePricingProfile) => {
      const plants = plantHourly.map(({ plant, hourly }) => ({
        plantId: plant.id,
        plantName: plant.name,
        plantType: plant.type,
        result: runBacktest(hourly, profile, { trainMonths: TRAIN_MONTHS }),
      }));
      return {
        portfolio: combineBacktests(plants.map((p) => p.result)) as BacktestResult | null,
        plants,
      };
    };

    return NextResponse.json({
      success: true,
      project: { id: project.id, name: project.name },
      trainMonths: TRAIN_MONTHS,
      scenarios: {
        project: { label: "Projenin fiyat profili", ...run(projectProfile) },
        rules2026: { label: "Tüm veri 2026 kurallarıyla (%3 / %6)", ...run(rules2026) },
      },
    });
  } catch (error) {
    console.error("Backtest error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Geriye dönük test çalıştırılamadı." },
      { status: 500 }
    );
  }
}
