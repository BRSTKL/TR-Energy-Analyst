import { NextResponse } from "next/server";
import { loadGipLiquidity } from "@/lib/services/gip-liquidity";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/gip
 * GİP likiditesi (PLAN 18.4): saatlik hacmin aya ve günün saatine göre dağılımı, toplayıcıların gerçekleşen katılımı
 * (scripts/gip-participation.mts) ve uygulamanın saatlik işlem sınırı.
 */
export async function GET() {
  const data = loadGipLiquidity();
  if (!data)
    return NextResponse.json(
      { success: false, error: "GİP katılım dosyası yok. Üretmek için: npx tsx --env-file=.env --tsconfig tsconfig.json scripts/gip-participation.mts" },
      { status: 422 }
    );
  return NextResponse.json({ success: true, ...data });
}
