import { NextResponse } from "next/server";
import { analyzeDsgScenario } from "@/lib/analysis/dsg-scenarios";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { settleByCompany } from "@/lib/report/plant-report";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/dsg?plants=uye1,uye2,...
 *
 * DSG'yi santraller değil piyasa katılımcıları (şirketler) kurar; her şirket zaten kendi dengesinden sorumludur ve
 * santralleri her saat birlikte netleşir. Bu yüzden grubun üyeleri şirketlerdir: her şirketin santralleri şirket
 * bazında netleşmiş saatlik veriyle tek üye olur (sahibi bilinmeyen santral kendi başına üye sayılır). Fayda böylece
 * yalnızca şirketler arasındaki ek netleşmedir. `plants` üye kimlikleridir; verilmezse tüm üyeler seçilir.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await loadProjectHourly(params.id);
    if (!data) {
      return NextResponse.json({ success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` }, { status: 404 });
    }

    type Plant = (typeof data.plants)[number];
    const groups = new Map<string, { id: string; name: string; isCompany: boolean; plants: Plant[] }>();
    for (const p of data.plants) {
      const id = p.organizationId !== null ? `org:${p.organizationId}` : p.plantId;
      const g = groups.get(id) ?? {
        id,
        name: p.organizationId !== null ? (p.organizationName ?? `Şirket ${p.organizationId}`) : p.plantName,
        isCompany: p.organizationId !== null,
        plants: [],
      };
      g.plants.push(p);
      groups.set(id, g);
    }
    const members = Array.from(groups.values()).map((g) => {
      const withData = g.plants.filter((p) => p.hourly.length > 0);
      return {
        plantId: g.id,
        plantName: g.name,
        plantType: Array.from(new Set(g.plants.map((p) => p.plantType))).join("+"),
        capacityMw: g.plants.reduce((sum, p) => sum + p.capacityMw, 0),
        memberPlants: g.plants.map((p) => p.plantName),
        isCompany: g.isCompany,
        hourly: settleByCompany(withData, data.profile),
      };
    });

    const withData = members.filter((m) => m.hourly.length > 0);
    const requested = new URL(request.url).searchParams.get("plants");
    const selectedIds = requested
      ? requested.split(",").filter((id) => withData.some((m) => m.plantId === id))
      : withData.map((m) => m.plantId);

    const result = analyzeDsgScenario(withData, selectedIds, data.profile);

    return NextResponse.json({
      success: true,
      project: data.project,
      unit: "company",
      unknownOwnerPlants: data.plants.filter((p) => p.organizationId === null && p.hourly.length > 0).map((p) => p.plantName),
      plants: members.map((m) => ({
        plantId: m.plantId,
        plantName: m.plantName,
        plantType: m.plantType,
        capacityMw: m.capacityMw,
        memberPlants: m.memberPlants,
        isCompany: m.isCompany,
        hasData: m.hourly.length > 0,
        selected: selectedIds.includes(m.plantId),
      })),
      ...result,
    });
  } catch (error) {
    console.error("DSG scenario error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "DSG senaryosu hesaplanamadı." },
      { status: 500 }
    );
  }
}
