import { NextResponse } from "next/server";
import { withProjectCache } from "@/lib/services/response-cache";
import { projectValidationPack } from "@/lib/services/validation-pack";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/validation?month=YYYY-MM
 * Kör doğrulama paketi: ayın uzlaştırma birimi bazında dengesizlik miktarı, alacak / borç tutarı, maliyet ve KÜPST
 * (son KGÜP pozisyon vekili). Ay verilmezse son ay.
 */
async function handleGET(request: Request, { params }: { params: { id: string } }) {
  const month = new URL(request.url).searchParams.get("month");
  try {
    const out = await projectValidationPack(params.id, month);
    // Proje yoksa 404 (diğer uçlarla aynı); veri eksikliği (karne, saatlik seri) 422
    if ("error" in out) return NextResponse.json({ success: false, error: out.error }, { status: out.error === "Proje bulunamadı." ? 404 : 422 });
    return NextResponse.json({ success: true, ...out });
  } catch (error) {
    console.error("Validation pack error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Doğrulama paketi hazırlanamadı." }, { status: 500 });
  }
}

export const GET = withProjectCache(handleGET);
