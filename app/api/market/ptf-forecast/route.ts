import { NextResponse } from "next/server";
import { isPreBidDate } from "@/lib/services/pre-bid";
import { getPtfPageForecast } from "@/lib/services/ptf-forecast-page";
import { trClock } from "@/lib/services/live-day";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/ptf-forecast?date=YYYY-AA-GG[&refresh=1]
 *
 * PTF motorunun hedef gün tahmini, girdilerin durumu ve günlük kayıt (lib/services/ptf-forecast-page.ts). Hesap ayrı süreçte
 * yapılır: ilk istek "computing" döner, sayfa birkaç saniyede bir yeniden sorar. Tarih verilmezse yarın.
 */
export async function GET(request: Request) {
  const { tomorrow } = trClock();
  const q = new URL(request.url).searchParams;
  const date = q.get("date") ?? tomorrow;
  if (!isPreBidDate(date) || date > tomorrow)
    return NextResponse.json(
      { success: false, error: "Tarih geçerli ve en geç yarın olmalı." },
      { status: 400 }
    );
  try {
    return NextResponse.json({
      success: true,
      ...(await getPtfPageForecast(date, q.get("refresh") === "1")),
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Tahmin alınamadı." },
      { status: 500 }
    );
  }
}
