import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backupDatabase } from "@/lib/db-backup";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]
 * Proje, santralleri (kayıt sayılarıyla) ve kayıtlı kolon eşleştirme şablonunun olup olmadığı.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      plants: {
        select: { id: true, name: true, type: true, capacityMw: true, _count: { select: { records: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      hasImportTemplate: !!project.importTemplate,
      plants: project.plants.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        capacityMw: p.capacityMw,
        recordCount: p._count.records,
      })),
    },
  });
}

/**
 * DELETE /api/projects/[id]
 * Projeyi; santrallerini, santrallerin saatlik üretim kayıtlarını ve fiyat profillerini tek bir
 * işlem (transaction) içinde siler. Herhangi bir adım başarısız olursa hiçbir şey silinmez.
 *
 * Şemada PowerPlant.projectId "onDelete: SetNull" olduğu için yalnızca projeyi silmek santralleri ve
 * kayıtlarını sahipsiz bırakırdı; bu yüzden santraller açıkça silinir.
 * Piyasa verisi (MarketData) projeler arasında ortak olduğundan silinmez.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, plants: { select: { id: true } } },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: `ID'si '${projectId}' olan proje bulunamadı.` },
        { status: 404 }
      );
    }

    const plantIds = project.plants.map((p) => p.id);

    // Silme geri alınamaz: önce yedek (başarısız olursa hiçbir şey silinmez)
    await backupDatabase(prisma, "delete-project");

    const [records, plants] = await prisma.$transaction([
      prisma.generationRecord.deleteMany({ where: { plantId: { in: plantIds } } }),
      prisma.powerPlant.deleteMany({ where: { projectId } }),
      prisma.imbalancePricingProfile.deleteMany({ where: { projectId } }),
      prisma.project.delete({ where: { id: projectId } }),
    ]);

    return NextResponse.json({
      success: true,
      message: `"${project.name}" projesi silindi.`,
      deleted: {
        plants: plants.count,
        generationRecords: records.count,
      },
    });
  } catch (error) {
    console.error("Project delete error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Proje silinirken beklenmeyen bir hata oluştu.",
      },
      { status: 500 }
    );
  }
}
