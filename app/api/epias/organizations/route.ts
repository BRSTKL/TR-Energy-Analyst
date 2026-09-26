import { NextResponse } from "next/server";
import { listOrganizations } from "@/lib/services/epias-plants";
import { searchOrganizations } from "@/lib/epias-plant/plant-data";
import { searchPeriods } from "@/lib/epias-plant/period";

export const dynamic = "force-dynamic";

/**
 * GET /api/epias/organizations?q=soma → son tam yılda ya da bu yıl EPİAŞ'ta tanımlı şirketler içinde unvana göre arama
 * (en fazla 20). Bu yıl kurulan şirketler (ör. yeni toplayıcılar) de bulunur.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const lists = await Promise.all(searchPeriods().map(({ start, end }) => listOrganizations(start, end)));
    const orgs = Array.from(new Map(lists.flat().map((o) => [o.id, o])).values());
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
