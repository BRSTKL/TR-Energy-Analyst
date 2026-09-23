import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Fiyatı güvenilir kabul edilen piyasa verisi kaynakları */
const VERIFIED_SOURCES = ["EPIAS", "FILE"];

/**
 * GET /api/projects/[id]/data-quality
 * Projedeki saatlik üretim kayıtlarının hangi kaynaktan gelen piyasa fiyatıyla hesaplandığını özetler.
 * Sentetik (SEED), kaynağı doğrulanmamış (LEGACY) veya eksik fiyatlı saatler dashboard'da uyarı olarak gösterilir.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: `ID'si '${projectId}' olan proje bulunamadı.` },
        { status: 404 }
      );
    }

    const projectRecords = { plant: { projectId } };

    const [totalHours, missingPriceHours, sourceRows, range] = await Promise.all([
      prisma.generationRecord.count({ where: projectRecords }),
      prisma.generationRecord.count({ where: { ...projectRecords, marketDataId: null } }),
      prisma.marketData.findMany({
        where: { records: { some: projectRecords } },
        select: { source: true, _count: { select: { records: { where: projectRecords } } } },
      }),
      prisma.generationRecord.aggregate({
        where: projectRecords,
        _min: { timestamp: true },
        _max: { timestamp: true },
      }),
    ]);

    const hoursBySource: Record<string, number> = {};
    for (const row of sourceRows) {
      hoursBySource[row.source] = (hoursBySource[row.source] || 0) + row._count.records;
    }

    const verifiedHours = VERIFIED_SOURCES.reduce((sum, s) => sum + (hoursBySource[s] || 0), 0);
    const unverifiedHours = totalHours - verifiedHours - missingPriceHours;

    return NextResponse.json({
      success: true,
      totalHours,
      verifiedHours,
      unverifiedHours,
      missingPriceHours,
      syntheticHours: hoursBySource.SEED || 0,
      legacyHours: hoursBySource.LEGACY || 0,
      hoursBySource,
      isFullyVerified: totalHours > 0 && verifiedHours === totalHours,
      dateRange: {
        start: range._min.timestamp,
        end: range._max.timestamp,
      },
    });
  } catch (error) {
    console.error("Data quality error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Veri kalitesi hesaplanırken hata oluştu.",
      },
      { status: 500 }
    );
  }
}
