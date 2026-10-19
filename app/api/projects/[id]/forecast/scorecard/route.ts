import { NextResponse } from "next/server";
import { projectScorecard } from "@/lib/solar-engine/learning/scorecard-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/forecast/scorecard?month=YYYY-MM
 * Tahmin karnesi (PLAN 21.4): projenin güneş santralleri için günlük tahmin kayıtları gerçekleşen üretimle (UEVM, yoksa
 * geçici GZÜ); ilk KGÜP ile maliyet kıyası. Ay verilmezse kaydı olan en son ay.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const month = new URL(req.url).searchParams.get("month") ?? undefined;
    const r = await projectScorecard(params.id, month && /^\d{4}-\d{2}$/.test(month) ? month : undefined);
    if (!r) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });
    return NextResponse.json({ success: true, ...r });
  } catch (error) {
    console.error("Forecast scorecard error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Karne hazırlanamadı." }, { status: 500 });
  }
}
