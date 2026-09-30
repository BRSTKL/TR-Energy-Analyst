import { NextResponse } from "next/server";
import { displayDescription } from "@/lib/projects/description";
import { prisma } from "@/lib/prisma";
import { plantHourSummaries } from "@/lib/services/project-records";
import { backupDatabase } from "@/lib/db-backup";
import { parseAggregatorPortfolio } from "@/lib/projects/aggregator";
import { fetchAggregatorPortfolio } from "@/lib/services/epias-plants";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]
 * Proje, santralleri (kayıt sayılarıyla), kayıtlı kolon eşleştirme şablonunun olup olmadığı ve
 * üretim verisinin tarih aralığı (dataRange: { start, end } "YYYY-MM-DD", veri yoksa null).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      plants: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) {
    return NextResponse.json(
      { success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` },
      { status: 404 }
    );
  }

  // Üretim verisinin kapsadığı tarih aralığı (duvar saati; UTC alanlarında saklanır): havuz ve veritabanı santralleri
  const counts = await plantHourSummaries([project]);
  let first: Date | null = null;
  let last: Date | null = null;
  for (const c of Array.from(counts.values())) {
    if (c.first && (!first || c.first < first)) first = c.first;
    if (c.last && (!last || c.last > last)) last = c.last;
  }
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const dataRange = first && last ? { start: day(first), end: day(last) } : null;

  return NextResponse.json({
    success: true,
    project: {
      id: project.id,
      name: project.name,
      description: displayDescription(project.description),
      hasImportTemplate: !!project.importTemplate,
      aggregatorName: project.aggregatorName,
      aggregatorPortfolio: parseAggregatorPortfolio(project.aggregatorPortfolio),
      dataRange,
      plants: project.plants.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        capacityMw: p.capacityMw,
        recordCount: counts.get(p.id)?.count ?? 0,
      })),
    },
  });
}

/**
 * PATCH /api/projects/[id] { aggregatorName: string | null, aggregatorOrgId?: number, aggregatorOrgName?: string }
 * Toplayıcı portföyü ayarı: dolu ise projedeki tüm santraller bu adla tek dengede uzlaştırılır; null ise her santral
 * sahibinin dengesinde (varsayılan). aggregatorOrgId verilirse toplayıcının EPİAŞ portföyü (santral sayısı ve
 * teknoloji dağılımı) çekilip kaydedilir; rapordaki kapsam cümlesi buna dayanır. EPİAŞ'a ulaşılamazsa ad yine kaydedilir.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body || !("aggregatorName" in body)) {
    return NextResponse.json({ success: false, error: "aggregatorName alanı gerekli." }, { status: 400 });
  }
  const raw = body.aggregatorName;
  if (raw !== null && typeof raw !== "string") {
    return NextResponse.json({ success: false, error: "aggregatorName metin ya da null olmalı." }, { status: 400 });
  }
  const aggregatorName = raw?.trim().slice(0, 160) || null;
  const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, aggregatorPortfolio: true } });
  if (!exists) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });

  // Toplayıcı kapatılırsa portföy özeti de silinir; yeni toplayıcı seçildiyse EPİAŞ'tan yeniden çekilir
  let aggregatorPortfolio: string | null = aggregatorName ? exists.aggregatorPortfolio : null;
  let warning: string | null = null;
  const orgId = Number(body.aggregatorOrgId);
  if (aggregatorName && Number.isInteger(orgId) && orgId > 0) {
    try {
      const portfolio = await fetchAggregatorPortfolio(orgId, String(body.aggregatorOrgName ?? aggregatorName).slice(0, 200));
      aggregatorPortfolio = JSON.stringify(portfolio);
    } catch (e) {
      warning = `Toplayıcının EPİAŞ portföyü alınamadı; ad kaydedildi. (${e instanceof Error ? e.message : "bağlantı"})`;
    }
  }
  await prisma.project.update({ where: { id: params.id }, data: { aggregatorName, aggregatorPortfolio } });
  return NextResponse.json({ success: true, aggregatorName, aggregatorPortfolio: parseAggregatorPortfolio(aggregatorPortfolio), warning });
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
