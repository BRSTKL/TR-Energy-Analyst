import { NextResponse } from "next/server";
import { projectWeatherPlants, weatherDay } from "@/lib/services/weather-preview";
import { lossCalendar, plantLoss, withLoss } from "@/lib/services/production-loss";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/losses?plant=<epiasPlantId>&date=YYYY-MM-DD
 * Kayıp üretim sayfası (eski adı "Üretim tahmini"; 16.10.2026 ayrıldı): projenin güneş santralleri, konum ve hava verisi durumu; hava verisi olan
 * seçili santral için günün saatlik ışınım tahmini, üretimi ve ilk KGÜP'ü. Santral verilmezse hava verisi olan ilki;
 * gün verilmezse son ortak gün. Kayıp üretim (PLAN 20.3): seçili santralin uyduyla kayıp özeti, günün ayının takvimi,
 * günün saatlerinde uydu ışınımı ve beklenen üretim. Açık referans sıralaması /api/projects/[id]/forecast'ta.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  try {
    const list = await projectWeatherPlants(params.id);
    if (!list) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });
    const ready = list.plants.filter((p) => p.epiasPlantId !== null && p.weatherYears.length > 0);
    const requested = Number(url.searchParams.get("plant"));
    const id = ready.find((p) => p.epiasPlantId === requested)?.epiasPlantId ?? ready[0]?.epiasPlantId ?? null;
    const raw = id !== null ? await weatherDay(id, url.searchParams.get("date")) : null;
    const day = raw && !("error" in raw) ? await withLoss(raw) : null;
    const loss = id !== null ? await plantLoss(id) : null;
    const calendar = id !== null && day ? await lossCalendar(id, day.date.slice(0, 7)) : [];
    return NextResponse.json({
      success: true,
      ...list,
      day,
      dayError: raw && "error" in raw ? raw.error : null,
      loss,
      calendar,
    });
  } catch (error) {
    console.error("Loss page error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Kayıp üretim verisi hazırlanamadı." }, { status: 500 });
  }
}
