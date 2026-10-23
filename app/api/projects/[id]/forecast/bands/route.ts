import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nextTargetDate } from "@/lib/solar-engine/learning/forecast-log";
import { readForecastLog } from "@/lib/solar-engine/learning/forecast-log-store";
export const dynamic = "force-dynamic";
/** 22.5: yalnız değişmez günlük gölge kaydındaki düzeltilmiş güneş bantları; yeniden tahmin yapmaz. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { plants: { where: { type: "GES" }, select: { epiasPlantId: true } } },
    });
    if (!project)
      return NextResponse.json(
        { success: false, error: "Proje bulunamadı" },
        { status: 404 }
      );
    const date = nextTargetDate(Date.now()),
      log = await readForecastLog(date);
    const ids = new Set(project.plants.map((p) => p.epiasPlantId));
    const shadow = log?.shadow?.find((s) => s.modelId.endsWith("-ens-weighted-corr"));
    const plants = (shadow?.plants ?? [])
      .filter((p) => ids.has(p.epiasPlantId) && p.status === "ok" && p.bands)
      .map((p) => ({ epiasPlantId: p.epiasPlantId, bands: p.bands }));
    return NextResponse.json({
      success: true,
      date,
      issuedAt: log?.issuedAt ?? null,
      modelId: shadow?.modelId ?? null,
      plants,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Bantlar okunamadı" },
      { status: 500 }
    );
  }
}
