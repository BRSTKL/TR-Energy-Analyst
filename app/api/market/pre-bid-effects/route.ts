import { NextResponse } from "next/server";
import { loadPreBidEffects } from "@/lib/services/pre-bid-effects";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/pre-bid-effects (ÖNİZLEME)
 *
 * Yeni bulunan verilerin (doğal gaz GRF, gerçekleşen güneş) teklif öncesi fiyat modeline etkisi: aynı yürüyen geriye test, mevcut
 * modelle günlük eşleştirilmiş hata farkı (lib/analysis/pre-bid-effects.ts).
 */
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await loadPreBidEffects()) });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Etki ölçümü hesaplanamadı.",
      },
      { status: 502 }
    );
  }
}
