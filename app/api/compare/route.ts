import { NextResponse } from "next/server";
import { projectKpis, type ProjectKpis } from "@/lib/services/project-kpis";
import { cachedForProject } from "@/lib/services/response-cache";

export const dynamic = "force-dynamic";

const MAX_PROJECTS = 8;

/**
 * GET /api/compare?ids=proje1,proje2,...
 *
 * Seçilen projelerin özet göstergeleri (Dengesizlik Karnesi ile aynı motor). Verisi olmayan projeler `skipped`'de döner.
 */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_PROJECTS);
  if (ids.length === 0) return NextResponse.json({ success: false, error: "Karşılaştırılacak proje seçilmedi." }, { status: 400 });

  try {
    const rows: ProjectKpis[] = [];
    const skipped: string[] = [];
    // Sırayla: her proje tüm saatlik veriyi belleğe alır
    for (const id of ids) {
      // Proje göstergeleri veri sürümüne göre önbellekten (PLAN 10.2): ana sayfa ve Projeler sayfası her açılışta çağırır
      const k = await cachedForProject(id, "kpis", () => projectKpis(id));
      if (k) rows.push(k);
      else skipped.push(id);
    }
    return NextResponse.json({ success: true, rows, skipped });
  } catch (error) {
    console.error("Compare error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Karşılaştırma hesaplanamadı." },
      { status: 500 }
    );
  }
}
