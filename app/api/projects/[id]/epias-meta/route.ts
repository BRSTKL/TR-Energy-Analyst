import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectPeriod } from "@/lib/services/project-records";
import { listUevmPowerPlants, resolvePlantMeta } from "@/lib/services/epias-plants";
import { normalizePlantName } from "@/lib/epias-plant/plant-data";
import { resolveInstalledCapacities } from "@/lib/services/installed-capacity";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[id]/epias-meta
 * Projedeki santrallerin EPİAŞ kimliğini, sahibini (şirket), YEKDEM durumunu ve kurulu gücünü doldurur.
 * EPİAŞ kimliği yoksa önce proje açıklamasındaki "EPİAŞ: <ad>: ... Santral kimliği N" notundan, sonra
 * EPİAŞ santral listesinde birebir ad eşleşmesinden bulunur. YEKDEM durumu verinin ilk yılı ve son yılından sonraki
 * yıl için alınır (sonraki yıl YEKDEM'de değilse santral YEKDEM'den çıkıyor demektir).
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const project = await prisma.project.findUnique({ where: { id: params.id }, include: { plants: true } });
    if (!project) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });

    const period = await projectPeriod(project);
    const year = period ? Number(period.start.slice(0, 4)) : new Date().getUTCFullYear();
    const lastYear = period ? Number(period.end.slice(0, 4)) : year;

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
    // Kurulu güç (kural: lib/epias-plant/installed-capacity.ts): elle girilmemiş santrallerde YEKDEM kaydı, yoksa tahmin
    const fresh = await prisma.powerPlant.findMany({ where: { projectId: project.id } });
    const auto = fresh.filter((p) => p.capacitySource !== "USER" && p.poolBacked);
    const cap = await resolveInstalledCapacities(auto, period);
    errors.push(...cap.errors);
    const capacity = [];
    for (let i = 0; i < auto.length; i++) {
      const m = cap.matches[i];
      if (m.mw <= 0) continue;
      await prisma.powerPlant.update({
        where: { id: auto[i].id },
        data: {
          capacityMw: m.mw,
          capacitySource: m.source,
          capacityRef: m.ref + (m.warning ? ` · Uyarı: ${m.warning}` : ""),
          capacityPeakMw: cap.peaks[i].peakMw,
        },
      });
      capacity.push({ name: auto[i].name, from: auto[i].capacityMw, to: m.mw, source: m.source });
    }
    return NextResponse.json({ success: true, year, updated, unmatched, errors, capacity });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "EPİAŞ bilgileri güncellenemedi." },
      { status: 500 }
    );
  }
}
