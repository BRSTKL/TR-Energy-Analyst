import { NextResponse } from "next/server";
import { projectLiveForecast } from "@/lib/solar-engine/forecast";
import { forecastReference } from "@/lib/services/production-loss";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/forecast
 * Üretim tahmini sayfası (kullanıcı kararı 16.10.2026; eski "Üretim tahmini" sayfası artık /losses): projenin konumu olan
 * güneş santralleri için yarın ve öbür gün saatlik beklenen üretim (lib/solar-engine/forecast.ts) ve modelin geçmiş
 * başarısı (geriye dönük test: kalıcılıksız sürüm 3 ile şirketin ilk KGÜP'ü).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const live = await projectLiveForecast(params.id);
    if (!live) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });
    const ids = live.plants.map((p) => p.epiasPlantId).filter((x): x is number => x !== null);
    return NextResponse.json({ success: true, ...live, reference: forecastReference(ids) });
  } catch (error) {
    console.error("Live forecast error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Üretim tahmini hazırlanamadı." }, { status: 500 });
  }
}
