import { NextResponse } from "next/server";
import { isOutageWindow, loadOutageMonitor } from "@/lib/services/outage-monitor";

export const dynamic = "force-dynamic";

/** GET /api/outages?window=active|24h|7d : Arıza izleme (lib/services/outage-monitor.ts) */
export async function GET(request: Request) {
  const w = new URL(request.url).searchParams.get("window");
  try {
    return NextResponse.json({ success: true, ...(await loadOutageMonitor(isOutageWindow(w) ? w : "active")) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Arıza bildirimleri okunamadı" }, { status: 500 });
  }
}
