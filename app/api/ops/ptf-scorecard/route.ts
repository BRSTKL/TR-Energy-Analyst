import { NextResponse } from "next/server";
import { loadPtfScorecard } from "@/lib/services/ptf-scorecard";

export const dynamic = "force-dynamic";

/**
 * GET /api/ops/ptf-scorecard
 *
 * PTF motorunun ileriye dönük karnesi: değişmeyen günlük kayıtlar gerçekleşen PTF'yle karşılaştırılır (son gün, son 7 gün,
 * hepsi). Yalnız dosya ve veritabanı okur (lib/services/ptf-scorecard.ts).
 */
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await loadPtfScorecard()) });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Karne okunamadı." },
      { status: 500 }
    );
  }
}
