import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listUevmPowerPlants, resolvePlantMeta } from "@/lib/services/epias-plants";
import { normalizePlantName } from "@/lib/epias-plant/plant-data";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[id]/epias-meta
 * Projedeki santrallerin EPİAŞ kimliğini, sahibini (şirket) ve YEKDEM durumunu doldurur.
 * EPİAŞ kimliği yoksa önce proje açıklamasındaki "EPİAŞ: <ad>: ... Santral kimliği N" notundan, sonra
 * EPİAŞ santral listesinde birebir ad eşleşmesinden bulunur. YEKDEM durumu verinin ilk yılı ve son yılından sonraki
 * yıl için alınır (sonraki yıl YEKDEM'de değilse santral YEKDEM'den çıkıyor demektir).
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const project = await prisma.project.findUnique({ where: { id: params.id }, include: { plants: true } });
    if (!project) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });

    const plantIds = project.plants.map((p) => p.id);
    const [first, last] = await Promise.all([
      prisma.generationRecord.findFirst({ where: { plantId: { in: plantIds } }, orderBy: { timestamp: "asc" }, select: { timestamp: true } }),
      prisma.generationRecord.findFirst({ where: { plantId: { in: plantIds } }, orderBy: { timestamp: "desc" }, select: { timestamp: true } }),
    ]);
    const year = (first?.timestamp ?? new Date()).getUTCFullYear();
    const lastYear = (last?.timestamp ?? new Date()).getUTCFullYear();

    const fromNotes = new Map<string, number>();
    for (const m of (project.description ?? "").matchAll(/EPİAŞ: (.+?): .*?Santral kimliği (\d+)/g)) {
      fromNotes.set(normalizePlantName(m[1]), Number(m[2]));
    }
    const needName = project.plants.some((p) => !p.epiasPlantId && !fromNotes.has(normalizePlantName(p.name)));
    const byName = needName
      ? new Map((await listUevmPowerPlants()).map((p) => [normalizePlantName(p.shortName?.trim() || p.name), p.id]))
      : new Map<string, number>();

    const ids = new Map<string, number>();
    const unmatched: string[] = [];
    for (const p of project.plants) {
      const key = normalizePlantName(p.name);
      const id = p.epiasPlantId ?? fromNotes.get(key) ?? byName.get(key);
      if (id) ids.set(p.id, id);
      else unmatched.push(p.name);
    }

    const { items, errors } = await resolvePlantMeta(Array.from(new Set(ids.values())), year, lastYear);
    const metaById = new Map(items.map((m) => [m.epiasPlantId, m]));
    const updated = [];
    for (const p of project.plants) {
      const id = ids.get(p.id);
      if (!id) continue;
      const m = metaById.get(id)!;
      const plant = await prisma.powerPlant.update({
        where: { id: p.id },
        data: {
          epiasPlantId: id,
          ...(m.organizationId !== null ? { organizationId: m.organizationId, organizationName: m.organizationName } : {}),
          ...(m.yekdem !== null ? { yekdem: m.yekdem } : {}),
          ...(m.yekdemNextYear !== null ? { yekdemNextYear: m.yekdemNextYear } : {}),
        },
      });
      updated.push({
        name: plant.name,
        epiasPlantId: id,
        organizationName: plant.organizationName,
        yekdem: plant.yekdem,
        yekdemNextYear: plant.yekdemNextYear,
      });
    }
    return NextResponse.json({ success: true, year, updated, unmatched, errors });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "EPİAŞ bilgileri güncellenemedi." },
      { status: 500 }
    );
  }
}
