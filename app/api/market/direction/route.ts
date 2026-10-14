import { NextResponse } from "next/server";
import { INFO_TIMES } from "@/lib/analysis/direction-features";
import { loadDirectionForecasts } from "@/lib/services/direction-forecast";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/direction
 * Sistem yönü tahmininin geçmişle sınaması (Aşama 14.3): iki karar anı için model ve rakiplerin aylık ve toplam
 * skorları, kalibrasyon ve kapı sonucu. Saatlik tahminler döndürülmez.
 */
export async function GET() {
  try {
    const forecasts = await loadDirectionForecasts();
    return NextResponse.json({ success: true, results: INFO_TIMES.map((it) => forecasts[it].summary) });
  } catch (error) {
    console.error("Direction forecast error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Yön tahmini sınaması çalıştırılamadı." },
      { status: 500 }
    );
  }
}
