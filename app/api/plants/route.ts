import { NextResponse } from "next/server";
import { searchPlants, type DirectoryType } from "@/lib/analysis/plant-search";
import { loadDirectory } from "@/lib/services/plant-directory";

export const dynamic = "force-dynamic";

/**
 * GET /api/plants?q=&type=RES|HES|GES&limit=
 * Santral rehberi: havuzdaki santrallerde ad ya da sahip şirkete göre arama (en çok 500 sonuç).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const t = sp.get("type");
  const type: DirectoryType | "ALL" = t === "RES" || t === "HES" || t === "GES" ? t : "ALL";
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 50));
  try {
    const list = await loadDirectory();
    return NextResponse.json({ success: true, directorySize: list.length, ...searchPlants(list, sp.get("q") ?? "", type, limit) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Santral dizini okunamadı" }, { status: 500 });
  }
}
