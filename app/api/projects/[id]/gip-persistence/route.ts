import { NextResponse } from "next/server";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { settleByCompanyGroups } from "@/lib/report/plant-report";
import { combineBacktests, intradayClosingStrategy, persistenceStrategy, runBacktest } from "@/lib/analysis/backtest";

export const dynamic = "force-dynamic";

const STRATEGIES = [intradayClosingStrategy(25), persistenceStrategy(1), persistenceStrategy(2), persistenceStrategy(3)];

/**
 * GET /api/projects/[id]/gip-persistence?scope=portfolio|<plantId>
 * Sabit "%25 kapat" varsayımını, gün içi kalıcılık kurallarıyla (1/2/3 saat önce görülen hata) aynı test
 * aylarında, geriye dönük test ile karşılaştırır. Kapatılan oran her santral için önceki aylardan öğrenilir.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await loadProjectHourly(params.id);
    if (!data) {
      return NextResponse.json({ success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` }, { status: 404 });
    }
    const scope = new URL(request.url).searchParams.get("scope") ?? "portfolio";
    const plants = (scope === "portfolio" ? data.plants : data.plants.filter((p) => p.plantId === scope)).filter(
      (p) => p.hourly.length > 0
    );
    if (plants.length === 0) {
      return NextResponse.json({ success: false, error: "Santral veya veri bulunamadı." }, { status: 404 });
    }

    const perPlant = plants.map((p) => ({
      plantName: p.plantName,
      result: runBacktest(p.hourly, data.profile, { strategies: STRATEGIES }),
    }));
    // Portföy: uzlaştırma biriminin netleşmiş serisi (raporla aynı taban); tek santral: santralin kendi serisi
    const combined =
      scope === "portfolio"
        ? combineBacktests(settleByCompanyGroups(plants, data.profile).map((g) => runBacktest(g.hourly, data.profile, { strategies: STRATEGIES })))
        : combineBacktests(perPlant.map((p) => p.result));
    if (!combined || combined.testMonths.length === 0) {
      return NextResponse.json({ success: true, available: false });
    }

    return NextResponse.json({
      success: true,
      available: true,
      testMonths: combined.testMonths,
      baselineCostTl: combined.baselineCostTl,
      strategies: combined.strategies.map((s) => ({
        id: s.id,
        label: s.label,
        outOfSampleSavingTl: s.outOfSampleSavingTl,
        outOfSampleSavingPercent: s.outOfSampleSavingPercent,
        positiveMonths: s.positiveMonths,
        testMonths: s.testMonths,
      })),
      // Bir sonraki ay için santral bazında öğrenilen oranlar
      nextMonth: perPlant.map((p) => ({
        plantName: p.plantName,
        params: Object.fromEntries(p.result.strategies.map((s) => [s.id, s.nextMonthParams])),
      })),
    });
  } catch (error) {
    console.error("GİP persistence error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Hesaplanamadı." },
      { status: 500 }
    );
  }
}
