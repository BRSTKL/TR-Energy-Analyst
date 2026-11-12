import { NextResponse } from "next/server";
import { loadCompanyProfile } from "@/lib/services/company-profile";

export const dynamic = "force-dynamic";

/** GET /api/companies/<şirket adının yalın hâli>?year= : Şirket profili (lib/services/company-profile.ts) */
export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const year = Number(new URL(request.url).searchParams.get("year")) || null;
  try {
    const profile = await loadCompanyProfile(params.slug, year);
    if (!profile) return NextResponse.json({ success: false, error: "Bu yılın sektör karnesinde böyle bir şirket yok" }, { status: 404 });
    return NextResponse.json({ success: true, profile });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Şirket profili okunamadı" }, { status: 500 });
  }
}
