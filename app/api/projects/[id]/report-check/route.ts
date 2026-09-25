import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReportContext } from "@/lib/services/report-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/report-check → rapor indirilmeden önce gösterilecek uyarılar (portföy eksikliği, sahibi
 * bilinmeyen santral, YEKDEM çıkışı bilinmeyen santral). Saatlik veriyi yüklemez; yalnızca santral bilgisi okunur.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const plants = await prisma.powerPlant.findMany({
      where: { projectId: params.id, records: { some: {} } },
      select: {
        id: true,
        name: true,
        organizationId: true,
        organizationName: true,
        yekdem: true,
        yekdemNextYear: true,
        epiasPlantId: true,
      },
    });
    const first = await prisma.generationRecord.findFirst({
      where: { plantId: { in: plants.map((p) => p.id) } },
      orderBy: { timestamp: "asc" },
      select: { timestamp: true },
    });
    const { check } = await buildReportContext(
      plants.map((p) => ({ ...p, plantName: p.name })),
      (first?.timestamp ?? new Date()).getUTCFullYear()
    );
    return NextResponse.json({ success: true, ...check });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Kontrol yapılamadı." }, { status: 500 });
  }
}
