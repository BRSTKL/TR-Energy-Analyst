import { NextResponse } from "next/server";
import { projectCandidates } from "@/lib/services/candidates";
import { SECTOR_TECHS, type SectorTech } from "@/lib/sector/benchmark";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/candidates?types=RES,GES,HES&top=10
 *
 * Portföye eklenince netleşme kazancı en yüksek santraller (aynı yılın sektör karnesinden) ve ilk N aday için adil
 * prim (Shapley). Sektör karnesi ya da saatlik serisi toplanmamışsa 422 ile toplama komutu döner.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const q = new URL(request.url).searchParams;
  const types = (q.get("types") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is SectorTech => (SECTOR_TECHS as string[]).includes(s));
  const top = Math.min(Math.max(Number(q.get("top")) || 10, 1), 30);
  try {
    const out = await projectCandidates(params.id, { types: types.length ? types : SECTOR_TECHS, top });
    if ("error" in out) return NextResponse.json({ success: false, error: out.error }, { status: 422 });
    return NextResponse.json({ success: true, ...out });
  } catch (error) {
    console.error("Candidates error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Aday taraması hesaplanamadı." }, { status: 500 });
  }
}
