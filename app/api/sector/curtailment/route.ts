import { NextResponse } from "next/server";
import { loadSectorCurtailment } from "@/lib/services/sector-curtailment";

export const dynamic = "force-dynamic";

/**
 * GET /api/sector/curtailment
 * Sektörde uyduyla kayıp üretim (PLAN 20.4): konumlu lisanslı güneş santralleri, grup (bütün / YEKA / diğer) ve yıl
 * özeti (aynı aylar), aylık seri, santral satırları ve kapsam.
 */
export async function GET() {
  const data = loadSectorCurtailment();
  if (!data)
    return NextResponse.json(
      { success: false, error: "Sektör kayıp dosyası yok. Üretmek için: npx tsx --env-file=.env --tsconfig tsconfig.json scripts/sector-curtailment.mts" },
      { status: 422 }
    );
  return NextResponse.json({ success: true, ...data });
}
