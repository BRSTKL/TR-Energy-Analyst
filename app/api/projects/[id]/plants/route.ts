import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { plantNameKey, validatePlantInput } from "@/lib/plants/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[id]/plants
 * Projeye yeni santral ekler: { name, type: "RES"|"HES"|"GES", capacityMw }.
 * Veri, içe aktarma ekranından bu santrale eşlenerek yüklenir.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, plants: { select: { name: true } } },
    });
    if (!project) {
      return NextResponse.json({ success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const taken = new Set(project.plants.map((p) => plantNameKey(p.name)));
    const result = validatePlantInput(body, taken);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: `Santral eklenemedi: ${result.error}.` }, { status: 400 });
    }

    const plant = await prisma.powerPlant.create({
      data: { ...result.value, projectId: project.id },
      select: { id: true, name: true, type: true, capacityMw: true },
    });

    return NextResponse.json({ success: true, plant: { ...plant, recordCount: 0 } }, { status: 201 });
  } catch (error) {
    console.error("Plant create error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Santral eklenirken hata oluştu." },
      { status: 500 }
    );
  }
}
