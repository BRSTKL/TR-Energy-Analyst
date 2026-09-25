import { NextResponse } from "next/server";
import { resolvePlantMeta } from "@/lib/services/epias-plants";

export const dynamic = "force-dynamic";

/** POST /api/epias/plants/meta { ids: number[], year, lastYear? } → santrallerin sahibi ve YEKDEM durumu (yıl ve sonraki yıl) */
export async function POST(request: Request) {
  const { ids, year, lastYear } = await request.json().catch(() => ({}));
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
  const y = Number(year);
  if (list.length === 0 || !Number.isInteger(y)) {
    return NextResponse.json({ success: false, error: "ids ve year gerekli." }, { status: 400 });
  }
  const ly = Number.isInteger(Number(lastYear)) ? Number(lastYear) : y;
  return NextResponse.json({ success: true, ...(await resolvePlantMeta(list, y, ly)) });
}
