import { NextResponse } from "next/server";
import { isPreBidDate, loadPreBid } from "@/lib/services/pre-bid";
import { trClock } from "@/lib/services/live-day";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/pre-bid?date=YYYY-AA-GG (ÖNİZLEME)
 *
 * Teklif öncesi görünüm: hedef gün için saatlik PTF beklentisi ve ± aralık (lib/analysis/pre-bid.ts). Tarih verilmezse yarın.
 * Hedef gün geçmişse (en erken 2026-06-15) aynı hesap o günün girdileriyle yapılır ve gerçekleşenle karşılaştırılır.
 */
export async function GET(request: Request) {
  const { tomorrow } = trClock();
  const date = new URL(request.url).searchParams.get("date") ?? tomorrow;
  if (!isPreBidDate(date))
    return NextResponse.json(
      { success: false, error: "Tarih YYYY-AA-GG biçiminde ve geçerli olmalı." },
      { status: 400 }
    );
  if (date > tomorrow)
    return NextResponse.json(
      { success: false, error: `En geç yarın (${tomorrow}) seçilebilir.` },
      { status: 400 }
    );
  try {
    const result = await loadPreBid(date);
    if (date < result.meta.earliest)
      return NextResponse.json(
        {
          success: false,
          error: `En erken ${result.meta.earliest} seçilebilir (EPİAŞ rüzgâr tahmini serisi 2026-06-01'den başlıyor).`,
        },
        { status: 400 }
      );
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Teklif öncesi görünüm hesaplanamadı.",
      },
      { status: 502 }
    );
  }
}
