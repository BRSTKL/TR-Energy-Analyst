import { NextResponse } from "next/server";
import { loadSectorCapture } from "@/lib/services/sector-capture";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/capture
 * Sektör capture rate (PLAN 19.3): teknoloji ve ay bazında capture rate, santraller arası dağılım; yıllar aynı aylarla.
 * Santral başına oranlar döndürülmez (sayfa için gerekmez).
 */
export async function GET() {
  const data = loadSectorCapture();
  if (!data)
    return NextResponse.json(
      { success: false, error: "Sektör capture dosyası yok. Üretmek için: npx tsx --env-file=.env --tsconfig tsconfig.json scripts/sector-capture.mts" },
      { status: 422 }
    );
  const strip = <T extends { plantRates?: unknown }>(y: T) => {
    const { plantRates: _omit, ...rest } = y;
    return rest;
  };
  return NextResponse.json({ success: true, generatedAt: data.generatedAt, lastMonth: data.lastMonth, years: data.years.map(strip), fullYear: data.fullYear ? strip(data.fullYear) : null });
}
