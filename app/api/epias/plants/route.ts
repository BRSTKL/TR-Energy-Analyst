import { NextResponse } from "next/server";
import { listUevmPowerPlants } from "@/lib/services/epias-plants";
import { searchPowerPlants } from "@/lib/epias-plant/plant-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/epias/plants?q=bahce → UEVM yayımlanan santraller içinde ada/EIC'ye göre arama (en fazla 20)
 * GET /api/epias/plants?ids=7663,12 → verilen kimliklerdeki santraller (yeni proje penceresinden gelen seçim)
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  const ids = (params.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  try {
    const plants = await listUevmPowerPlants();
    if (ids.length > 0) {
      const byId = new Map(plants.map((p) => [p.id, p]));
      const found = ids.map((id) => byId.get(id)).filter((p) => p !== undefined);
      return NextResponse.json({ success: true, total: plants.length, plants: found });
    }
    return NextResponse.json({ success: true, total: plants.length, plants: searchPowerPlants(plants, q) });
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
