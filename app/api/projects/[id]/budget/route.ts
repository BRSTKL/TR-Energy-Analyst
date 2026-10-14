import { NextResponse } from "next/server";
import { withProjectCache } from "@/lib/services/response-cache";
import { BUDGET_HYDRO, BUDGET_RULES, BUDGET_SPREADS, projectBudget, type BudgetHydro, type BudgetRule, type BudgetSpread } from "@/lib/services/imbalance-budget";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/budget?spread=y2026|y2025|wide&rule=r2026|r2025|strict&hydro=dry|normal|wet|custom&gwh=1000&intraday=1|0&inflation=25
 *
 * Gelecek yılın aylık dengesizlik + KÜPST bütçesi (PLAN 17.3): medyan, P90, P95, MWh başına maliyet; reel TL. gwh yalnız
 * hydro=custom ile: yıllık üretim tahmini (GWh), normal yılın aylık profiliyle dağıtılır. intraday (varsayılan 1): gün içi düzeltme
 * son yıldaki gibi sürer. inflation: yıllık enflasyon (%); verilirse nominal TL de hesaplanır (aylık bileşik yol).
 */
async function handleGET(request: Request, { params }: { params: { id: string } }) {
  const q = new URL(request.url).searchParams;
  const pick = <T extends string>(v: string | null, allowed: Record<T, unknown>, fallback: T): T => (v !== null && v in allowed ? (v as T) : fallback);
  const spread = pick<BudgetSpread>(q.get("spread"), BUDGET_SPREADS, "y2026");
  const rule = pick<BudgetRule>(q.get("rule"), BUDGET_RULES, "r2026");
  const hydro = pick<BudgetHydro>(q.get("hydro"), BUDGET_HYDRO, "normal");
  const gwh = Number(q.get("gwh"));
  const inflation = q.get("inflation") !== null && q.get("inflation") !== "" ? Number(q.get("inflation")) : null;
  try {
    const out = await projectBudget(params.id, {
      spread,
      rule,
      hydro,
      customGwh: Number.isFinite(gwh) && gwh > 0 ? gwh : null,
      intraday: q.get("intraday") !== "0",
      inflation: inflation !== null && Number.isFinite(inflation) && inflation > -50 && inflation < 500 ? inflation : null,
    });
    if ("error" in out) return NextResponse.json({ success: false, error: out.error }, { status: 422 });
    return NextResponse.json({ success: true, ...out });
  } catch (error) {
    console.error("Budget error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Bütçe hesaplanamadı." }, { status: 500 });
  }
}

/** Sonuç projenin veri sürümüne göre önbellekten (PLAN 10.2) */
export const GET = withProjectCache(handleGET);
