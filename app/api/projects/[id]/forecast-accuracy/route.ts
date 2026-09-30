import { NextResponse } from "next/server";
import { withProjectCache } from "@/lib/services/response-cache";
import { findProjectWithRecords } from "@/lib/services/project-records";
import { analyzePlantAccuracy, computeAccuracyStats } from "@/lib/analysis/forecast-accuracy";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/forecast-accuracy
 * Santral ve portföy bazında fiyattan bağımsız tahmin doğruluğu (bias, WAPE, sistematik hata payı,
 * aylık ve saatlik kırılımlar). Piyasa verisi eşleşmeyen saatler de dahil edilir.
 */
async function handleGET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const project = await findProjectWithRecords(params.id);

    if (!project) {
      return NextResponse.json(
        { success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` },
        { status: 404 }
      );
    }

    const plantsWithData = project.plants.filter((p) => p.records.length > 0);

    return NextResponse.json({
      success: true,
      plants: plantsWithData.map((p) =>
        analyzePlantAccuracy({ plantId: p.id, plantName: p.name, plantType: p.type }, p.records)
      ),
      portfolio: computeAccuracyStats(plantsWithData.flatMap((p) => p.records)),
    });
  } catch (error) {
    console.error("Forecast accuracy error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Tahmin doğruluğu hesaplanırken hata oluştu.",
      },
      { status: 500 }
    );
  }
}

/** Sonuç projenin veri sürümüne göre önbellekten (PLAN 10.2) */
export const GET = withProjectCache(handleGET);
