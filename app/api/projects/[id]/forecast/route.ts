import { NextResponse } from "next/server";
import { projectWeatherPlants, weatherDay } from "@/lib/services/weather-preview";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/forecast?plant=<epiasPlantId>&date=YYYY-MM-DD
 * Üretim tahmini sayfası (PLAN 15.2 önizleme): projenin güneş santralleri, konum ve hava verisi durumu; hava verisi olan
 * seçili santral için günün saatlik ışınım tahmini, üretimi ve ilk KGÜP'ü. Santral verilmezse hava verisi olan ilki;
 * gün verilmezse son ortak gün.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  try {
    const list = await projectWeatherPlants(params.id);
    if (!list) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });
    const ready = list.plants.filter((p) => p.epiasPlantId !== null && p.weatherYears.length > 0);
    const requested = Number(url.searchParams.get("plant"));
    const id = ready.find((p) => p.epiasPlantId === requested)?.epiasPlantId ?? ready[0]?.epiasPlantId ?? null;
    const day = id !== null ? await weatherDay(id, url.searchParams.get("date")) : null;
    return NextResponse.json({
      success: true,
      ...list,
      day: day && !("error" in day) ? day : null,
      dayError: day && "error" in day ? day.error : null,
    });
  } catch (error) {
    console.error("Forecast page error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Üretim tahmini verisi hazırlanamadı." }, { status: 500 });
  }
}
