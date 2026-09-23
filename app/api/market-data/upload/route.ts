import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backupDatabase } from "@/lib/db-backup";
import { parseMarketFile, mergeMarketRows, PartialMarketRow } from "@/lib/parsers/epias-parser";
import { upsertMarketRecords, recalculateProjectImbalances } from "@/lib/services/epias-service";

export const dynamic = "force-dynamic";

const dayStr = (d: Date) => d.toISOString().split("T")[0];

/**
 * POST /api/market-data/upload
 * EPİAŞ Şeffaflık Platformu'ndan indirilmiş bir veya birden fazla piyasa verisi dosyasını
 * (PTF, SMF, Sistem Yönü, GİP AÖF; .xlsx veya .csv) saat bazında birleştirip `MarketData`
 * tablosuna "FILE" kaynağıyla yazar. `projectId` verilirse projenin maliyetlerini yeniden hesaplar.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    const projectId = (formData.get("projectId") as string | null) || undefined;

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: "Lütfen en az bir piyasa verisi dosyası (.xlsx veya .csv) seçin." },
        { status: 400 }
      );
    }

    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
      if (!project) {
        return NextResponse.json(
          { success: false, error: `ID'si '${projectId}' olan proje bulunamadı.` },
          { status: 404 }
        );
      }
    }

    // 1. Her dosyayı ayrı ayrı ayrıştır
    const parts: PartialMarketRow[][] = [];
    const fileSummaries: Array<{ name: string; rows: number; columns: string[] }> = [];
    const warnings: string[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        const parsed = await parseMarketFile(buffer, file.name);
        parts.push(parsed.rows);
        fileSummaries.push({ name: file.name, rows: parsed.rows.length, columns: parsed.columnsFound });
        warnings.push(...parsed.warnings.map((w) => `${file.name}: ${w}`));
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            error: `${file.name}: ${err instanceof Error ? err.message : "Dosya okunamadı."}`,
          },
          { status: 400 }
        );
      }
    }

    // 2. Dosyaları saat bazında birleştir; PTF ve SMF'si tam olan saatler yazılır
    const { complete, incompleteHours } = mergeMarketRows(parts);

    if (complete.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Hiçbir saat için hem PTF hem SMF bulunamadı. PTF ve SMF raporlarını birlikte yükleyin " +
            "(Sistem Yönü ve GİP AÖF opsiyoneldir).",
          files: fileSummaries,
        },
        { status: 400 }
      );
    }

    if (incompleteHours.length > 0) {
      warnings.push(
        `${incompleteHours.length} saat PTF veya SMF eksik olduğu için yazılmadı ` +
          `(ilk: ${incompleteHours[0].toISOString().slice(0, 16).replace("T", " ")}).`
      );
    }
    const withoutGip = complete.filter((c) => c.gipPrice === null).length;
    if (withoutGip > 0) {
      warnings.push(`${withoutGip} saatte GİP AÖF yok; bu saatler GİP arbitraj analizine girmez.`);
    }

    // 3. Veritabanına yaz ve (istenirse) proje maliyetlerini yeniden hesapla
    await backupDatabase(prisma, "market-upload", { minIntervalMs: 10 * 60_000 });
    const totalMarketRecords = await upsertMarketRecords(complete, "FILE");

    const start = complete[0].timestamp;
    const end = complete[complete.length - 1].timestamp;

    const totalGenerationRecordsUpdated = projectId
      ? await recalculateProjectImbalances(projectId, start, end, true)
      : 0;

    return NextResponse.json({
      success: true,
      message: `${dayStr(start)} - ${dayStr(end)} dönemi için ${totalMarketRecords.toLocaleString("tr-TR")} saatlik piyasa verisi kaydedildi.`,
      totalMarketRecords,
      totalGenerationRecordsUpdated,
      incompleteHours: incompleteHours.length,
      dateRange: { start: dayStr(start), end: dayStr(end) },
      files: fileSummaries,
      warnings,
    });
  } catch (error) {
    console.error("Market data upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Piyasa verisi yüklenirken beklenmeyen bir hata oluştu.",
      },
      { status: 500 }
    );
  }
}
