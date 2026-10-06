import { NextResponse } from "next/server";
import { resolveInstalledCapacities } from "@/lib/services/installed-capacity";

export const dynamic = "force-dynamic";

/**
 * POST /api/epias/plants/capacity
 * { plants: [{ name, type, organizationName, peakMw, hours }] } → { matches: [{ source, mw, ref, warning }] }
 * Proje kaydından önce formda gösterilecek kurulu güç (EPİAŞ YEKDEM kaydı, yoksa en yüksek üretimden tahmin).
 * Kayıtta sunucu aynı kuralı yeniden uygular; bu yalnızca önizlemedir.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const raw: any[] = Array.isArray(body.plants) ? body.plants.slice(0, 500) : [];
    const plants = raw.map((p) => ({
      name: String(p.name ?? ""),
      type: String(p.type ?? ""),
      organizationName: typeof p.organizationName === "string" ? p.organizationName : null,
      epiasPlantId: null,
    }));
    const peaks = raw.map((p) => ({ peakMw: Number(p.peakMw) || 0, hours: Number(p.hours) || 0 }));
    const { matches, errors } = await resolveInstalledCapacities(plants, null, peaks);
    return NextResponse.json({
      success: true,
      matches: matches.map((m) => ({ source: m.source, mw: m.mw, ref: m.ref, warning: m.warning ?? null })),
      errors,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Kurulu güç bulunamadı." }, { status: 500 });
  }
}
