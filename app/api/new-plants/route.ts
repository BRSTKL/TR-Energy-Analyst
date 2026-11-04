import { NextResponse } from "next/server";
import { loadNewPlantRadar } from "@/lib/services/new-plants";

export const dynamic = "force-dynamic";

/** GET /api/new-plants : Yeni santral radarı (lib/services/new-plants.ts) */
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await loadNewPlantRadar()) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Yeni santral radarı okunamadı" }, { status: 500 });
  }
}
