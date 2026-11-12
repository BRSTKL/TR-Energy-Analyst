import { NextResponse } from "next/server";
import { searchCompanies } from "@/lib/analysis/company-profile";
import { loadCompanies } from "@/lib/services/company-profile";

export const dynamic = "force-dynamic";

/**
 * GET /api/companies?q=&year=&limit=
 * Şirket listesi: sektör karnesindeki santraller sahip şirkete göre, kurulu güce göre azalan (en çok 500 sonuç).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 50));
  try {
    const data = await loadCompanies(Number(sp.get("year")) || null);
    if (!data) return NextResponse.json({ success: false, error: "Sektör karnesi toplanmamış" }, { status: 404 });
    return NextResponse.json({
      success: true,
      year: data.year,
      years: data.years,
      period: data.period,
      companies: data.index.rows.length,
      unknown: data.index.unknown,
      errors: data.errors,
      ...searchCompanies(data.index.rows, sp.get("q") ?? "", limit),
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Şirket listesi okunamadı" }, { status: 500 });
  }
}
