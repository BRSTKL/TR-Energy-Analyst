import { NextResponse } from "next/server";
import { listUevcbsForPlant } from "@/lib/services/epias-plants";

export const dynamic = "force-dynamic";

/** POST /api/epias/plants/resolve { powerPlantId, startDay } → santralin uzlaştırma birimleri (UEVÇB) */
export async function POST(request: Request) {
  try {
    const { powerPlantId, startDay } = await request.json();
    if (!Number.isFinite(Number(powerPlantId)) || typeof startDay !== "string") {
      return NextResponse.json({ success: false, error: "powerPlantId ve startDay gerekli." }, { status: 400 });
    }
    const uevcbs = await listUevcbsForPlant(Number(powerPlantId), startDay);
    return NextResponse.json({ success: true, uevcbs });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Uzlaştırma birimleri alınamadı." },
      { status: 502 }
    );
  }
}
