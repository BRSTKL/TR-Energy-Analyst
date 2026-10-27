import { NextResponse } from "next/server";
import { loadSectorEpdkMap } from "@/lib/services/sector-epdk-map";

export const dynamic = "force-dynamic";

/** GET /api/sector/epdk-il: EPDK üretim lisanslarının il bazında toplamı (RES / GES / HES; dosya yoksa o tür null) */
export async function GET() {
  const data = await loadSectorEpdkMap();
  return NextResponse.json({ success: true, ...data });
}
