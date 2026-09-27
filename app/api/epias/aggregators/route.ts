import { NextResponse } from "next/server";
import { listOrganizations } from "@/lib/services/epias-plants";
import { searchOrganizations } from "@/lib/epias-plant/plant-data";
import { searchPeriods } from "@/lib/epias-plant/period";
import { isAggregatorName } from "@/lib/projects/aggregator";

export const dynamic = "force-dynamic";

/**
 * GET /api/epias/aggregators?q=gain → EPİAŞ'ta "(TOPLAYICI)" olarak kayıtlı katılımcılar içinde arama. q boşsa hepsi
 * (alfabetik). Son tam yıl ve bu yıl birlikte taranır: yıl içinde kurulan toplayıcılar da bulunur.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  try {
    const lists = await Promise.all(searchPeriods().map(({ start, end }) => listOrganizations(start, end)));
    const aggregators = Array.from(new Map(lists.flat().filter((o) => isAggregatorName(o.name)).map((o) => [o.id, o])).values());
    const result = q.length >= 2 ? searchOrganizations(aggregators, q) : aggregators.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    return NextResponse.json({ success: true, total: aggregators.length, aggregators: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "EPİAŞ'a bağlanılamadı (VPN açık mı?)" + (error instanceof Error ? ` (${error.message})` : "") },
      { status: 502 }
    );
  }
}
