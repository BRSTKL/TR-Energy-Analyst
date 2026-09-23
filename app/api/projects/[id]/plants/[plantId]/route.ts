import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backupDatabase } from "@/lib/db-backup";
import { plantNameKey, removePlantFromTemplate, validatePlantInput } from "@/lib/plants/validation";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; plantId: string } };

/** Santrali projesiyle birlikte getirir; santral bu projeye ait değilse null. */
async function findPlant({ id, plantId }: Params["params"]) {
  const plant = await prisma.powerPlant.findUnique({
    where: { id: plantId },
    select: { id: true, name: true, type: true, capacityMw: true, projectId: true },
  });
  return plant && plant.projectId === id ? plant : null;
}

const notFound = (plantId: string) =>
  NextResponse.json({ success: false, error: `Bu projede '${plantId}' ID'li santral bulunamadı.` }, { status: 404 });

/**
 * PATCH /api/projects/[id]/plants/[plantId]
 * Santralin adını, türünü ve/veya kurulu gücünü günceller. Gönderilmeyen alanlar korunur.
 * Saatlik kayıtlar değişmez; kurulu güç gerçekleşen tepe üretimin altına düşerse uyarı döner.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const plant = await findPlant(params);
    if (!plant) return notFound(params.plantId);

    const body = (await request.json().catch(() => null)) ?? {};
    const siblings = await prisma.powerPlant.findMany({
      where: { projectId: params.id, id: { not: plant.id } },
      select: { name: true },
    });
    const result = validatePlantInput(
      {
        name: body.name ?? plant.name,
        type: body.type ?? plant.type,
        capacityMw: body.capacityMw ?? plant.capacityMw,
      },
      new Set(siblings.map((s) => plantNameKey(s.name)))
    );
    if (!result.ok) {
      return NextResponse.json({ success: false, error: `Santral güncellenemedi: ${result.error}.` }, { status: 400 });
    }

    const updated = await prisma.powerPlant.update({
      where: { id: plant.id },
      data: result.value,
      select: { id: true, name: true, type: true, capacityMw: true, _count: { select: { records: true } } },
    });

    const warnings: string[] = [];
    const peak = await prisma.generationRecord.aggregate({ where: { plantId: plant.id }, _max: { actualMwh: true } });
    const peakMwh = peak._max.actualMwh ?? 0;
    if (peakMwh > updated.capacityMw * 1.05) {
      warnings.push(
        `Kayıtlardaki en yüksek saatlik üretim (${peakMwh.toLocaleString("tr-TR")} MWh) yeni kurulu gücün ` +
          `(${updated.capacityMw.toLocaleString("tr-TR")} MW) üzerinde; değeri kontrol edin.`
      );
    }

    return NextResponse.json({
      success: true,
      plant: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        capacityMw: updated.capacityMw,
        recordCount: updated._count.records,
      },
      warnings,
    });
  } catch (error) {
    console.error("Plant update error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Santral güncellenirken hata oluştu." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]/plants/[plantId]
 * Santrali ve saatlik kayıtlarını tek işlemde siler, kayıtlı kolon eşleştirme şablonundan çıkarır.
 * Silmeden önce veritabanı yedeklenir; yedek alınamazsa hiçbir şey silinmez.
 */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const plant = await findPlant(params);
    if (!plant) return notFound(params.plantId);

    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { importTemplate: true } });

    await backupDatabase(prisma, "delete-plant");

    const [records] = await prisma.$transaction([
      prisma.generationRecord.deleteMany({ where: { plantId: plant.id } }),
      prisma.powerPlant.delete({ where: { id: plant.id } }),
      prisma.project.update({
        where: { id: params.id },
        data: { importTemplate: removePlantFromTemplate(project?.importTemplate ?? null, plant.id) },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `"${plant.name}" santrali ve ${records.count.toLocaleString("tr-TR")} saatlik kaydı silindi.`,
      deleted: { generationRecords: records.count },
    });
  } catch (error) {
    console.error("Plant delete error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Santral silinirken hata oluştu." },
      { status: 500 }
    );
  }
}
