import { NextResponse } from "next/server";
import { projectWindPlants, windDay, windLossCalendar, windPlantLoss } from "@/lib/services/wind-loss";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/wind-losses?plant=<epiasPlantId>&date=YYYY-MM-DD
 * Kayıp üretim sayfasının rüzgâr bölümü (lib/services/wind-loss.ts): projenin rüzgâr santralleri konum ve rüzgâr verisi
 * durumuyla; seçili santralin kayıp özeti, kalite (günlük korelasyon), plansız kayıp olayları ve bildirim karşılaştırması,
 * günün ayının takvimi ve günün saatleri. Santral verilmezse rüzgâr verisi olan ilki; gün verilmezse son gün.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  try {
    const plants = await projectWindPlants(params.id);
    if (!plants) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });
    const ready = plants.filter((p) => p.epiasPlantId !== null && p.windYears.length > 0);
    const requested = Number(url.searchParams.get("plant"));
    const sel = ready.find((p) => p.epiasPlantId === requested) ?? ready[0] ?? null;
    if (!sel) return NextResponse.json({ success: true, plants, loss: null, calendar: [], day: null });
    const id = sel.epiasPlantId!;
    const loss = await windPlantLoss(id, sel.capacityMw, sel.capacitySource);
    const day = loss ? await windDay({ epiasPlantId: id, name: sel.name, capacityMw: sel.capacityMw }, url.searchParams.get("date")) : null;
    const calendar = day ? await windLossCalendar(id, sel.capacityMw, day.date.slice(0, 7)) : [];
    return NextResponse.json({ success: true, plants, loss, calendar, day });
  } catch (error) {
    console.error("Wind loss error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Rüzgâr kayıp verisi hazırlanamadı." }, { status: 500 });
  }
}
