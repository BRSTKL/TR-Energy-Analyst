import { NextResponse } from "next/server";
import { loadToday, loadTomorrow } from "@/lib/services/live-day";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/live?day=today|tomorrow
 *
 * today: bugünün şu ana kadarki piyasa ve sistem verisi (günlük pano hesabıyla); tomorrow: yarının açıklanmış PTF'si, yük
 * tahmini ve GÖP hacmi (yarın görünümü). EPİAŞ'tan istek anında sorulur, 5 dakika bellekte tutulur (lib/services/live-day.ts).
 */
export async function GET(request: Request) {
  const day = new URL(request.url).searchParams.get("day");
  if (day !== "today" && day !== "tomorrow") return NextResponse.json({ success: false, error: "day today ya da tomorrow olmalı." }, { status: 400 });
  try {
    if (day === "today") return NextResponse.json({ success: true, ...(await loadToday()) });
    return NextResponse.json({ success: true, ...(await loadTomorrow()) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Canlı veri alınamadı." }, { status: 502 });
  }
}
