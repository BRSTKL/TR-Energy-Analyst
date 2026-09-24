import { NextResponse } from "next/server";
import { listUevmPowerPlants } from "@/lib/services/epias-plants";
import { searchPowerPlants } from "@/lib/epias-plant/plant-data";

export const dynamic = "force-dynamic";

/** GET /api/epias/plants?q=bahce → UEVM yayımlanan santraller içinde ada göre arama (en fazla 20) */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const plants = await listUevmPowerPlants();
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
