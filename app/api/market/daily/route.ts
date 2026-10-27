import { NextResponse } from "next/server";
import { loadDailyMarket } from "@/lib/services/daily-market";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/daily?date=YYYY-AA-GG
 *
 * Günlük piyasa panosu: günün PTF / SMF / sistem yönü, net yük ve akşam rampası, kaynak karması, aynı sınıftaki son 28 günün
 * PTF bandı (lib/analysis/daily-market.ts). Tarih verilmezse doğrulanmış verinin son tam günü. Veri tabanı ve veri havuzundan okur,
 * EPİAŞ'a gitmez.
 */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  const result = await loadDailyMarket(date);
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, day: result.data, available: result.available, limit: result.limit });
}
