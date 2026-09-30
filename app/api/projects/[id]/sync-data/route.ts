import { NextResponse } from "next/server";
import { syncProjectData } from "@/lib/services/project-data-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * POST /api/projects/[id]/sync-data → projenin eksik EPİAŞ verisini tamamlar (piyasa verisi, resmi dengesizlik
 * fiyatları, santrallerin ilk ve son KGÜP ile UEVM serileri). Yalnız eksik olan çekilir; VPN gerekir.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const r = await syncProjectData(params.id);
    return NextResponse.json({ success: r.errors.length === 0, ...r });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Veri tamamlanamadı." },
      { status: 500 }
    );
  }
}
