import { NextResponse } from "next/server";
import { ImbalancePricingProfile, REGULATORY_IMBALANCE_REGIMES } from "@/lib/calculations/types";
import { BacktestResult, combineBacktests, runBacktest } from "@/lib/analysis/backtest";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { settleByCompanyGroups } from "@/lib/report/plant-report";

export const dynamic = "force-dynamic";

const TRAIN_MONTHS = 4;

/**
 * GET /api/projects/[id]/backtest
 * Her santral için kaydırmalı geriye dönük testi iki fiyat rejiminde çalıştırır:
 * - "project": projenin fiyat profili (mevzuat modunda her saat kendi tarihinin kuralıyla)
 * - "rules2026": tüm veri 2026 kurallarıyla (sistem yönüne bağlı %3 / %6) yeniden fiyatlanır
 * Portföy sonucu sonuç sayfası ve raporla aynı tabanda: her uzlaştırma biriminin (şirket ya da toplayıcı) saat saat
 * netleşmiş serisi test edilir ve birimler toplanır. Santral satırları santralin kendi serisiyledir.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await loadProjectHourly(params.id);
    if (!data) {
      return NextResponse.json({ success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` }, { status: 404 });
    }

    const rules2026: ImbalancePricingProfile = {
      mode: "CUSTOM",
      ...REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].coefficients,
    };

    const run = (profile: ImbalancePricingProfile) => {
      const plants = data.plants.map((p) => ({
        plantId: p.plantId,
        plantName: p.plantName,
        plantType: p.plantType,
        result: runBacktest(p.hourly, profile, { trainMonths: TRAIN_MONTHS }),
      }));
      const units = settleByCompanyGroups(data.plants, profile).map((g) => runBacktest(g.hourly, profile, { trainMonths: TRAIN_MONTHS }));
      return {
        portfolio: combineBacktests(units) as BacktestResult | null,
        plants,
      };
    };

    return NextResponse.json({
      success: true,
      project: data.project,
      trainMonths: TRAIN_MONTHS,
      scenarios: {
        project: { label: "Projenin fiyat profili", ...run(data.profile) },
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
