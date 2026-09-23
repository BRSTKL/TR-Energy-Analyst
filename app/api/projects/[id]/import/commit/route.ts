import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backupDatabase } from "@/lib/db-backup";
import { PlantImportMapping } from "@/lib/import/column-mapping";
import { writePlantImports } from "@/lib/import/persist";
import { ImportRequestError, evaluateMappings, readImportRequest, serializeResults } from "@/lib/import/request";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[id]/import/commit
 * Kullanıcının onayladığı kolon eşleştirmesiyle üretim verisini yazar. Yalnızca "mappings" içindeki
 * santrallere yazılır; santral oluşturulmaz, tahmin yürütülmez.
 *
 * Reddedilen durumlar (hiçbir şey yazılmaz):
 * - herhangi bir eşleştirmede veya eşleştirmeler arasında hata varsa (400)
 * - verisi olan ama eşlenmeyen sayfalar varsa ve "confirmSkippedSheets" onayı yoksa (409)
 * - eşleştirilmeyen proje santralleri varsa ve "confirmSkippedPlants" onayı yoksa (409)
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await readImportRequest(request, params.id);

    if (!ctx.mappings || ctx.mappings.length === 0) {
      throw new ImportRequestError("En az bir santral için eşleştirme seçilmelidir.");
    }

    const evaluation = evaluateMappings(ctx, ctx.mappings);

    if (evaluation.hasErrors) {
      return NextResponse.json(
        {
          success: false,
          error: "Eşleştirmede hatalar var; hiçbir veri yazılmadı.",
          results: serializeResults(evaluation.results),
          setIssues: evaluation.setIssues,
        },
        { status: 400 }
      );
    }

    const confirmed = (key: string) => ctx.form.get(key) === "true";
    const plantName = (id: string) => ctx.plants.find((p) => p.id === id)?.name ?? id;

    if (evaluation.unusedSheets.length > 0 && !confirmed("confirmSkippedSheets")) {
      return NextResponse.json(
        {
          success: false,
          needsConfirmation: "sheets",
          error: `Şu sayfalar hiçbir santrale eşlenmedi ve yüklenmeyecek: ${evaluation.unusedSheets.join(", ")}. Atlamayı onaylayın.`,
          unusedSheets: evaluation.unusedSheets,
        },
        { status: 409 }
      );
    }
    if (evaluation.unmappedPlants.length > 0 && !confirmed("confirmSkippedPlants")) {
      return NextResponse.json(
        {
          success: false,
          needsConfirmation: "plants",
          error: `Şu santraller için veri seçilmedi: ${evaluation.unmappedPlants.map(plantName).join(", ")}. Atlamayı onaylayın.`,
          unmappedPlants: evaluation.unmappedPlants,
        },
        { status: 409 }
      );
    }

    // İçe aktarma aynı saatlerdeki eski kayıtları siler: önce yedek
    await backupDatabase(prisma, "import");
    const written = await writePlantImports(
      evaluation.results.map((r) => ({ plantId: r.plantId, rows: r.rows })),
      ctx.profile
    );

    // Şablonu kaydet: bu yüklemede eşleştirilen santraller güncellenir, diğerlerinin eski şablonu korunur
    if (ctx.form.get("saveTemplate") !== "false") {
      const templates: Record<string, PlantImportMapping> = { ...ctx.templates };
      for (const m of ctx.mappings) templates[m.plantId] = m;
      await prisma.project.update({
        where: { id: ctx.projectId },
        data: { importTemplate: JSON.stringify(templates) },
      });
    }

    const totalWritten = written.reduce((s, w) => s + w.written, 0);
    const missingMarket = written.reduce((s, w) => s + w.missingMarketHours, 0);

    return NextResponse.json({
      success: true,
      message: `${written.length} santral için toplam ${totalWritten.toLocaleString("tr-TR")} saatlik kayıt yazıldı.`,
      plants: written.map((w) => ({ ...w, plantName: plantName(w.plantId) })),
      missingMarketHours: missingMarket,
      skippedSheets: evaluation.unusedSheets,
      skippedPlants: evaluation.unmappedPlants.map(plantName),
    });
  } catch (error) {
    if (error instanceof ImportRequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Import commit error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Veri yazılırken hata oluştu." },
      { status: 500 }
    );
  }
}
