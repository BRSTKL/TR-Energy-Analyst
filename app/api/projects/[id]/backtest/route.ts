import { NextResponse } from "next/server";
import { withProjectCache } from "@/lib/services/response-cache";
import { ImbalancePricingProfile, REGULATORY_IMBALANCE_REGIMES } from "@/lib/calculations/types";
import { BacktestResult, combineBacktests, MIN_FEASIBLE_LAG_HOURS, persistenceStrategy, runBacktest } from "@/lib/analysis/backtest";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { settleByCompanyGroups } from "@/lib/report/plant-report";
import { loadGipCapImpact } from "@/lib/services/gip-liquidity";
import { INFO_TIMES } from "@/lib/analysis/direction-features";
import { directionBiasStrategy, directionPersistenceStrategy, kupstDeltaFor } from "@/lib/analysis/direction-strategy";
import { loadDirectionForecasts } from "@/lib/services/direction-forecast";

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
async function handleGET(_request: Request, { params }: { params: { id: string } }) {
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

    // Aşama 14.4: yön tahminiyle plan ayarı (projenin fiyat profiliyle; ölçüm, işlem önerisi değil). Strateji yalnız
    // piyasa sınamasında kapıyı geçen karar anı için çalıştırılır. KÜPST farkı santrallerin kendi saatlerinden.
    const forecasts = await loadDirectionForecasts();
    // Karşılaştırma için düz gün içi kalıcılık (2 saat) da aynı kartta; birleşik kural gün içi tahmin kapıyı geçtiyse
    const directionStrategies = (plants: typeof data.plants) => [
      ...INFO_TIMES.filter((it) => forecasts[it].gate.passed).map((it) =>
        directionBiasStrategy(forecasts[it].probabilities, it, kupstDeltaFor(plants))
      ),
      persistenceStrategy(MIN_FEASIBLE_LAG_HOURS),
      ...(forecasts["H-2"].gate.passed ? [directionPersistenceStrategy(forecasts["H-2"].probabilities)] : []),
    ];
    const unitKey = (p: (typeof data.plants)[number]) => (p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`);
    const direction = {
      gates: Object.fromEntries(INFO_TIMES.map((it) => [it, forecasts[it].gate])),
      portfolio: combineBacktests(
        settleByCompanyGroups(data.plants, data.profile).map((g) =>
          runBacktest(g.hourly, data.profile, {
            trainMonths: TRAIN_MONTHS,
            strategies: directionStrategies(data.plants.filter((p) => unitKey(p) === g.key)),
          })
        )
      ) as BacktestResult | null,
      plants: data.plants.map((p) => ({
        plantId: p.plantId,
        plantName: p.plantName,
        plantType: p.plantType,
        result: runBacktest(p.hourly, data.profile, { trainMonths: TRAIN_MONTHS, strategies: directionStrategies([p]) }),
      })),
    };

    return NextResponse.json({
      success: true,
      project: data.project,
      trainMonths: TRAIN_MONTHS,
      direction,
      // PLAN 18.4: GİP işlem sınırının bu portföydeki etkisi (scripts/gip-cap-impact.mts; yoksa null)
      gipCap: loadGipCapImpact(params.id),
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

/** Sonuç projenin veri sürümüne göre önbellekten (PLAN 10.2) */
export const GET = withProjectCache(handleGET);
