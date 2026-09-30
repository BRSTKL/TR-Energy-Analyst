import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectPeriod } from "@/lib/services/project-records";
import { buildReportContext } from "@/lib/services/report-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/report-check → rapor indirilmeden önce gösterilecek uyarılar (portföy eksikliği, sahibi
 * bilinmeyen santral, YEKDEM çıkışı bilinmeyen santral). Saatlik veriyi yüklemez; yalnızca santral bilgisi okunur.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, periodStart: true, periodEnd: true } });
    if (!project) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });
    // Verisi olan santraller: havuzdan okunanlar ya da veritabanında kaydı olanlar
    const plants = await prisma.powerPlant.findMany({
      where: { projectId: params.id, OR: [{ poolBacked: true }, { records: { some: {} } }] },
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
    const period = await projectPeriod(project);
    const { check } = await buildReportContext(
      plants.map((p) => ({ ...p, plantName: p.name })),
      period ? Number(period.start.slice(0, 4)) : new Date().getUTCFullYear()
    );
    return NextResponse.json({ success: true, ...check });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Kontrol yapılamadı." }, { status: 500 });
  }
}
