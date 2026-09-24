import { NextResponse } from "next/server";
import { listPlantsByOrganization, listUevmPowerPlants } from "@/lib/services/epias-plants";
import { lastFullYear } from "@/lib/epias-plant/period";

export const dynamic = "force-dynamic";

/**
 * GET /api/epias/organizations/[id]/plants → şirketin son tam yıldaki santralleri.
 * Yalnızca EPİAŞ'ın santral bazında UEVM yayımladığı santraller analiz edilebilir; diğerleri `withoutUevm` sayısında raporlanır.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "Geçersiz şirket." }, { status: 400 });
  try {
    const { start, end } = lastFullYear();
    const [plants, uevmPlants] = await Promise.all([listPlantsByOrganization(id, start, end), listUevmPowerPlants()]);
    const uevmById = new Map(uevmPlants.map((p) => [p.id, p]));
    // UEVM listesindeki kayıt tercih edilir: arama ve proje akışı bu listedeki ad ve kısa adı kullanır
    const analysable = plants.filter((p) => uevmById.has(p.id)).map((p) => uevmById.get(p.id)!);
    return NextResponse.json({ success: true, plants: analysable, withoutUevm: plants.length - analysable.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Şirketin santralleri alınamadı." },
      { status: 502 }
    );
  }
}
