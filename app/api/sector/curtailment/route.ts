import { NextResponse } from "next/server";
import { loadSectorCurtailment, loadSectorHydroLoss } from "@/lib/services/sector-curtailment";

export const dynamic = "force-dynamic";

/**
 * GET /api/sector/curtailment?tech=GES|RES|HES
 * Sektörde kayıp üretim: güneşte uyduyla (PLAN 20.4; grup bütün / YEKA / diğer), rüzgârda geçmiş rüzgârla (18.10.2026;
 * kalite eşiğini geçen santraller), hidroda bildirilen kullanılamayan kapasite ve nehir tipinde ani düşüşler (18.10.2026;
 * farklı biçim, SectorHydroLoss). Yıl özeti (aynı aylar), aylık seri, santral satırları ve kapsam.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("tech");
  if (q === "HES") {
    const hydro = loadSectorHydroLoss();
    if (!hydro)
      return NextResponse.json(
        { success: false, error: "Sektör hidro kayıp dosyası yok. Üretmek için: npx tsx --env-file=.env --tsconfig tsconfig.json scripts/sector-hydro-curtailment.mts" },
        { status: 422 }
      );
    return NextResponse.json({ success: true, ...hydro });
  }
  const tech = q === "RES" ? "RES" : "GES";
  const data = loadSectorCurtailment(tech);
  if (!data)
    return NextResponse.json(
      {
        success: false,
        error: `Sektör ${tech === "RES" ? "rüzgâr " : ""}kayıp dosyası yok. Üretmek için: npx tsx --env-file=.env --tsconfig tsconfig.json scripts/${tech === "RES" ? "sector-wind-curtailment" : "sector-curtailment"}.mts`,
      },
      { status: 422 }
    );
  return NextResponse.json({ success: true, ...data });
}
