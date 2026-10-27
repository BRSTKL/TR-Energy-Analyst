import { NextResponse } from "next/server";
import { isPreBidDate } from "@/lib/services/pre-bid";
import { loadPreBidContext } from "@/lib/services/pre-bid-context";
import { trClock } from "@/lib/services/live-day";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/pre-bid-context?date=YYYY-AA-GG (ÖNİZLEME)
 *
 * Teklif öncesi görünümün bağlam verileri: doğal gaz GRF, arz–talep eğrisi, teklif miktarları, gün içi işlem özeti
 * (lib/services/pre-bid-context.ts). Tarih verilmezse yarın.
 */
export async function GET(request: Request) {
  const { tomorrow } = trClock();
  const date = new URL(request.url).searchParams.get("date") ?? tomorrow;
  if (!isPreBidDate(date) || date > tomorrow)
    return NextResponse.json(
      { success: false, error: "Tarih geçerli ve en geç yarın olmalı." },
      { status: 400 }
    );
  try {
    return NextResponse.json({ success: true, ...(await loadPreBidContext(date)) });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Bağlam verisi alınamadı.",
      },
      { status: 502 }
    );
  }
}
