import { NextResponse } from "next/server";
import { suggestMappings } from "@/lib/import/suggest-mapping";
import { PlantImportMapping } from "@/lib/import/column-mapping";
import { ImportRequestError, evaluateMappings, readImportRequest, serializeResults } from "@/lib/import/request";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[id]/import/preview
 * Dosyayı okur ve veritabanına HİÇBİR ŞEY yazmadan döndürür:
 * - sayfa önizlemeleri (başlık satırı, kolonlar, ilk satırlar)
 * - eşleştirmeler: istekte "mappings" varsa onlar, yoksa şablon / otomatik öneriler
 * - her santral için doğrulama sonucu (istatistik, hata ve uyarılar)
 * Eşleştirme ekranı her değişiklikte bu uç noktayı çağırarak canlı doğrulama yapar.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await readImportRequest(request, params.id);

    let mappings: PlantImportMapping[];
    let suggestions: Array<{ plantId: string; source: string; reason: string }> | undefined;

    if (ctx.mappings) {
      mappings = ctx.mappings;
    } else {
      const suggested = suggestMappings(ctx.plants, ctx.previews, ctx.templates);
      mappings = suggested.map((s) => s.mapping).filter((m): m is PlantImportMapping => m !== null);
      suggestions = suggested.map(({ plantId, source, reason }) => ({ plantId, source, reason }));
    }

    const evaluation = evaluateMappings(ctx, mappings);

    return NextResponse.json({
      success: true,
      fileName: ctx.fileName,
      project: { id: ctx.projectId, name: ctx.projectName },
      plants: ctx.plants,
      sheets: ctx.previews,
      mappings,
      suggestions,
      results: serializeResults(evaluation.results),
      setIssues: evaluation.setIssues,
      unusedSheets: evaluation.unusedSheets,
      unmappedPlants: evaluation.unmappedPlants,
      hasErrors: evaluation.hasErrors,
    });
  } catch (error) {
    if (error instanceof ImportRequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Import preview error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Dosya önizlenirken hata oluştu." },
      { status: 500 }
    );
  }
}
