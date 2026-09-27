import { NextResponse } from "next/server";
import { projectCostChange } from "@/lib/services/cost-change";

export const dynamic = "force-dynamic";

/**
 * GET /api/compare/change?ids=proje1,proje2
 *
 * Aynı santrallerin iki döneminde MWh başına dengesizlik maliyeti farkının ayrıştırması (tahmin hatası, fiyat makası,
 * katsayı kuralı, hacim ve profil, etkileşim). Önce başlayan proje A kabul edilir.
 */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length !== 2) return NextResponse.json({ success: false, error: "Ayrıştırma için tam iki proje seçin." }, { status: 400 });
  try {
    const out = await projectCostChange(ids[0], ids[1]);
    if ("error" in out) return NextResponse.json({ success: false, error: out.error }, { status: 422 });
    return NextResponse.json({ success: true, ...out });
  } catch (error) {
    console.error("Cost change error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Ayrıştırma hesaplanamadı." }, { status: 500 });
  }
}
