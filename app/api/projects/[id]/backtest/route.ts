import { NextResponse } from "next/server";
import { withProjectCache } from "@/lib/services/response-cache";
import { ImbalancePricingProfile, REGULATORY_IMBALANCE_REGIMES } from "@/lib/calculations/types";
import { BacktestResult, combineBacktests, hourTime, MIN_FEASIBLE_LAG_HOURS, persistenceStrategy, priceHours, runBacktest, type PricedHour } from "@/lib/analysis/backtest";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { dsgPlanBasis, settleByCompanyGroups } from "@/lib/report/plant-report";
import { intradayTradeCost } from "@/lib/analysis/intraday-trade";
import { timeOf, utcMonthKey } from "@/lib/calculations/time-keys";
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

    /**
     * Şirketin kendi gün içi düzeltmesinin aynı test aylarındaki kazancı: ilk plana göre maliyet − son plana göre maliyet −
     * gün içi plan değişikliğinin GİP işlem maliyeti (uzlaştırma biriminde netleşmiş). Gün içi kuralları ilk plana uygulanır;
     * şirket zaten gün içinde düzeltiyorsa kıyas bu sayıyladır (15.11.2026 denetimi: 15 projenin 14'ünde şirketin kendi
     * düzeltmesi 2 saatlik kalıcılık kuralından fazla kazandırmış). Son plan saatlerin %90'ından azındaysa null.
     * Fiyatlar plana bağlı değildir: sınamanın fiyatladığı saatler (priceHours, önbellekte) yeniden kullanılır.
     */
    const unitKeyOf = (p: (typeof data.plants)[number]) => (p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`);
    const costAt = (d: number, h: PricedHour) => (d > 0 ? d * (h.source.ptf - h.positivePrice) : d < 0 ? -d * (h.negativePrice - h.source.ptf) : 0);
    const companyIntraday = (
      plants: typeof data.plants,
      units: Array<{ hourly: (typeof data.plants)[number]["hourly"]; plants: typeof data.plants }>,
      profile: ImbalancePricingProfile,
      months: string[]
    ) => {
      if (!months.length || dsgPlanBasis(plants) !== "final") return null;
      const inTest = new Set(months);
      let saving = 0;
      for (const u of units) {
        // Birimin saat başı son planı (son plan yoksa ilk plan): santrallerin toplamı
        const finalAt = new Map<number, number>();
        for (const p of u.plants)
          for (const h of p.hourly) {
            const t = timeOf(h.timestamp);
            finalAt.set(t, (finalAt.get(t) ?? 0) + (h.forecastFinalMwh ?? h.forecastMwh));
          }
        for (const h of priceHours(u.hourly, profile)) {
          if (!inTest.has(h.month)) continue;
          const t = hourTime(h);
          saving += h.baselineCost - costAt(h.source.actualMwh - (finalAt.get(t) ?? h.source.forecastMwh), h);
        }
      }
      const trade = intradayTradeCost(plants.flatMap((p) => p.hourly.filter((h) => inTest.has(utcMonthKey(h.timestamp))))).costTl;
      return { savingTl: Number((saving - trade).toFixed(2)), tradeCostTl: Number(trade.toFixed(2)) };
    };

    const run = (profile: ImbalancePricingProfile) => {
      const plants = data.plants.map((p) => {
        const result = runBacktest(p.hourly, profile, { trainMonths: TRAIN_MONTHS });
        return {
          plantId: p.plantId,
          plantName: p.plantName,
          plantType: p.plantType,
          result,
          // Santral tek başına: kendi saatleri (fiyatlanmış saatler runBacktest'ten önbellekte)
          companyIntraday: companyIntraday([p], [{ hourly: p.hourly, plants: [p] }], profile, result.testMonths),
        };
      });
      const groups = settleByCompanyGroups(data.plants, profile);
      const units = groups.map((g) => runBacktest(g.hourly, profile, { trainMonths: TRAIN_MONTHS }));
      const portfolio = combineBacktests(units) as BacktestResult | null;
      return {
        portfolio,
        portfolioCompanyIntraday: portfolio
          ? companyIntraday(
              data.plants,
              groups.map((g) => ({ hourly: g.hourly, plants: data.plants.filter((p) => unitKeyOf(p) === g.key) })),
              profile,
              portfolio.testMonths
            )
          : null,
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
    const direction = {
      gates: Object.fromEntries(INFO_TIMES.map((it) => [it, forecasts[it].gate])),
      portfolio: combineBacktests(
        settleByCompanyGroups(data.plants, data.profile).map((g) =>
          runBacktest(g.hourly, data.profile, {
            trainMonths: TRAIN_MONTHS,
            strategies: directionStrategies(data.plants.filter((p) => unitKeyOf(p) === g.key)),
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
