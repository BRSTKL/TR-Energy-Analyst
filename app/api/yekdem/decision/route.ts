import { NextResponse } from "next/server";
import { loadYekdemDecision } from "@/lib/services/yekdem-decision";

export const dynamic = "force-dynamic";

/** GET /api/yekdem/decision : YEKDEM 2027 karar listesi (lib/services/yekdem-decision.ts) */
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await loadYekdemDecision()) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "YEKDEM karar listesi okunamadı" }, { status: 500 });
  }
}
