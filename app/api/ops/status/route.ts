import { NextResponse } from "next/server";
import { loadOpsStatus } from "@/lib/services/ops-status";

export const dynamic = "force-dynamic";

/**
 * GET /api/ops/status
 *
 * Yarının günlük tahmin kayıtlarının (PTF, güneş, rüzgâr) durumu: üst şerit ve Bugün kokpiti. Yalnız dosya okur;
 * EPİAŞ'a ya da hava servisine istek atmaz (lib/services/ops-status.ts).
 */
export async function GET() {
  try {
    return NextResponse.json({ success: true, ...(await loadOpsStatus()) });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Durum okunamadı." },
      { status: 500 }
    );
  }
}
