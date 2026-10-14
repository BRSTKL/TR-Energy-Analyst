import { NextResponse } from "next/server";
import { withProjectCache } from "@/lib/services/response-cache";
import { analyzeDsgScenario } from "@/lib/analysis/dsg-scenarios";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { loadAggregatorMembership } from "@/lib/services/aggregator-membership";
import { dsgPlanBasis, settleByCompany, toFinalPlan } from "@/lib/report/plant-report";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/dsg?plants=uye1,uye2,...
 *
 * DSG'yi santraller değil piyasa katılımcıları (şirketler) kurar; her şirket zaten kendi dengesinden sorumludur ve
 * santralleri her saat birlikte netleşir. Bu yüzden grubun üyeleri şirketlerdir: her şirketin santralleri şirket
 * bazında netleşmiş saatlik veriyle tek üye olur (sahibi bilinmeyen santral kendi başına üye sayılır). Fayda böylece
 * yalnızca şirketler arasındaki ek netleşmedir. `plants` üye kimlikleridir; verilmezse tüm üyeler seçilir.
 * YEKDEM santralleri de dahildir: YEKDEM katılımcısı üretimini serbest piyasada kendisi satar, dengesizliği kendisine
 * aittir (YEK Yönetmeliği md. 15/1, 23/1). `yekdemPlants` yalnızca bilgi içindir.
 *
 * Şirket projelerinde hesap son planla (gün içi piyasası kapandıktan sonraki KGÜP, saatlerin en az %90'ında varsa):
 * şirketler gün içinde zaten düzeltme yapıyor, ilk planla hesaplanan fayda gün içi kazancıyla üst üste biner (raporun
 * grup senaryosuyla aynı kural, dsgPlanBasis). Toplayıcı projesinde sayfa raporun toplayıcı bloğuyla aynı tabanda
 * kalır (ilk plan). `basis` yanıtta döner.
 */
async function handleGET(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await loadProjectHourly(params.id);
    if (!data) {
      return NextResponse.json({ success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` }, { status: 404 });
    }

    const yekdemPlants = data.plants.filter((p) => p.yekdem === true && p.hourly.length > 0).map((p) => p.plantName);
    type Plant = (typeof data.plants)[number];
    const basis = data.aggregator ? "first" : dsgPlanBasis(data.plants);
    const plantsOnBasis = basis === "final" ? data.plants.map(toFinalPlan) : data.plants;
    const groups = new Map<string, { id: string; name: string; isCompany: boolean; plants: Plant[] }>();
    for (const p of plantsOnBasis) {
      // Üye lisans sahibidir: toplayıcı portföyünde de sahipler ayrı üye olur, böylece sayfa portföyün netleşme değerini gösterir
      const ownerId = p.ownerOrganizationId !== undefined ? p.ownerOrganizationId : p.organizationId;
      const ownerName = p.ownerName !== undefined ? p.ownerName : p.organizationName;
      const id = ownerId !== null ? `org:${ownerId}` : p.plantId;
      const g = groups.get(id) ?? {
        id,
        name: ownerId !== null ? (ownerName ?? `Şirket ${ownerId}`) : p.plantName,
        isCompany: ownerId !== null,
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
        // Sahibin santralleri kendi aralarında netleşir (toplayıcı kimliği değil sahip kimliği)
        hourly: settleByCompany(
          withData.map((p) => ({ ...p, organizationId: p.ownerOrganizationId !== undefined ? p.ownerOrganizationId : p.organizationId })),
          data.profile
        ),
      };
    });

    // Şirket projesinde başka bir toplayıcının portföyündeki santraller (EPİAŞ toplayıcı listesi): dengesizlikleri orada
    // netleşir, kurulacak bir gruba giremezler. Bütün santralleri toplayıcıda olan üye varsayılan seçime alınmaz (raporun
    // grup senaryosuyla aynı kural); sayfa bunu söyler
    const membership = data.aggregator ? null : await loadAggregatorMembership().catch(() => null);
    const inAggregator = new Map<string, string[]>();
    for (const g of Array.from(groups.values()))
      for (const p of g.plants) {
        const aggs = p.epiasPlantId !== null && p.epiasPlantId !== undefined ? membership?.byPlant.get(p.epiasPlantId) : undefined;
        if (aggs?.length) inAggregator.set(p.plantName, aggs.map((a) => a.name));
      }
    const inAggregatorMember = (m: (typeof members)[number]) => m.memberPlants.length > 0 && m.memberPlants.every((n) => inAggregator.has(n));

    const withData = members.filter((m) => m.hourly.length > 0);
    const requested = new URL(request.url).searchParams.get("plants");
    const selectedIds = requested
      ? requested.split(",").filter((id) => withData.some((m) => m.plantId === id))
      : withData.filter((m) => !inAggregatorMember(m)).map((m) => m.plantId);

    const result = analyzeDsgScenario(withData, selectedIds, data.profile);

    return NextResponse.json({
      success: true,
      project: data.project,
      unit: "company",
      basis,
      aggregatorListAsOf: membership?.asOf ?? null,
      aggregator: data.aggregator ?? null,
      yekdemPlants,
      unknownOwnerPlants: data.plants.filter((p) => (p.ownerOrganizationId !== undefined ? p.ownerOrganizationId : p.organizationId) === null && p.hourly.length > 0).map((p) => p.plantName),
      plants: members.map((m) => ({
        plantId: m.plantId,
        plantName: m.plantName,
        plantType: m.plantType,
        capacityMw: m.capacityMw,
        memberPlants: m.memberPlants,
        isCompany: m.isCompany,
        hasData: m.hourly.length > 0,
        selected: selectedIds.includes(m.plantId),
        /** Üyenin başka bir toplayıcının portföyündeki santralleri ve toplayıcı adları */
        inAggregator: m.memberPlants.filter((n) => inAggregator.has(n)).map((n) => ({ plantName: n, aggregators: inAggregator.get(n)! })),
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

/** Sonuç projenin veri sürümüne göre önbellekten (PLAN 10.2) */
export const GET = withProjectCache(handleGET);
