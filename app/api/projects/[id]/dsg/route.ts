import { NextResponse } from "next/server";
import { analyzeDsgScenario } from "@/lib/analysis/dsg-scenarios";
import { loadProjectHourly } from "@/lib/services/project-hourly";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/dsg?plants=id1,id2,...
 * Seçilen santral grubu için DSG senaryosu: netleşme faydası, aylık istikrar, marjinal değerler,
 * en iyi alt gruplar ve paylaştırma yöntemleri. `plants` verilmezse verisi olan tüm santraller seçilir.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await loadProjectHourly(params.id);
    if (!data) {
      return NextResponse.json({ success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` }, { status: 404 });
    }

    const withData = data.plants.filter((p) => p.hourly.length > 0);
    const requested = new URL(request.url).searchParams.get("plants");
    const selectedIds = requested
      ? requested.split(",").filter((id) => withData.some((p) => p.plantId === id))
      : withData.map((p) => p.plantId);

    const result = analyzeDsgScenario(withData, selectedIds, data.profile);

    return NextResponse.json({
      success: true,
      project: data.project,
      plants: data.plants.map((p) => ({
        plantId: p.plantId,
        plantName: p.plantName,
        plantType: p.plantType,
        capacityMw: p.capacityMw,
        hasData: p.hourly.length > 0,
        selected: selectedIds.includes(p.plantId),
      })),
      ...result,
    });
  } catch (error) {
    console.error("DSG scenario error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "DSG senaryosu hesaplanamadı." },
      { status: 500 }
    );
  }
}
