import { NextResponse } from "next/server";
import { listOrganizations } from "@/lib/services/epias-plants";
import { searchOrganizations } from "@/lib/epias-plant/plant-data";
import { lastFullYear } from "@/lib/epias-plant/period";

export const dynamic = "force-dynamic";

/** GET /api/epias/organizations?q=soma → son tam yılda EPİAŞ'ta tanımlı şirketler içinde unvana göre arama (en fazla 20) */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const { start, end } = lastFullYear();
    const orgs = await listOrganizations(start, end);
    return NextResponse.json({ success: true, total: orgs.length, organizations: searchOrganizations(orgs, q) });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          "EPİAŞ'a bağlanılamadı. Bilgisayarın EPİAŞ'a erişimi (Türkiye içi bağlantı veya VPN) olduğundan emin olun." +
          (error instanceof Error ? ` (${error.message})` : ""),
      },
      { status: 502 }
    );
  }
}
