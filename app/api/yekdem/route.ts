import { NextResponse } from "next/server";
import { loadYekdemCalendar } from "@/lib/services/yekdem-calendar";

export const dynamic = "force-dynamic";

/** GET /api/yekdem : YEKDEM çıkış takvimi (lib/services/yekdem-calendar.ts) */
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await loadYekdemCalendar()) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "YEKDEM takvimi okunamadı" }, { status: 500 });
  }
}
