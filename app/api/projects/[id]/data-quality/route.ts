import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { describeGap, findDataGaps } from "@/lib/analysis/data-completeness";

export const dynamic = "force-dynamic";

/** Fiyatı güvenilir kabul edilen piyasa verisi kaynakları */
const VERIFIED_SOURCES = ["EPIAS", "FILE"];

/**
 * GET /api/projects/[id]/data-quality
 * Projedeki saatlik üretim kayıtlarının hangi kaynaktan gelen piyasa fiyatıyla hesaplandığını özetler.
 * Sentetik (SEED), kaynağı doğrulanmamış (LEGACY) veya eksik fiyatlı saatler dashboard'da uyarı olarak gösterilir.
 * Ayrıca ay bazında kapsamı ve doğrulanmış piyasa verisinin son çekilme zamanını döndürür (durum göstergesi için).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: `ID'si '${projectId}' olan proje bulunamadı.` },
        { status: 404 }
      );
    }

    const projectRecords = { plant: { projectId } };

    const [totalHours, missingPriceHours, sourceRows, range] = await Promise.all([
      prisma.generationRecord.count({ where: projectRecords }),
      prisma.generationRecord.count({ where: { ...projectRecords, marketDataId: null } }),
      prisma.marketData.findMany({
        where: { records: { some: projectRecords } },
        select: { source: true, _count: { select: { records: { where: projectRecords } } } },
      }),
      prisma.generationRecord.aggregate({
        where: projectRecords,
        _min: { timestamp: true },
        _max: { timestamp: true },
      }),
    ]);

    const hoursBySource: Record<string, number> = {};
    for (const row of sourceRows) {
      hoursBySource[row.source] = (hoursBySource[row.source] || 0) + row._count.records;
    }

    const verifiedHours = VERIFIED_SOURCES.reduce((sum, s) => sum + (hoursBySource[s] || 0), 0);
    const unverifiedHours = totalHours - verifiedHours - missingPriceHours;

    // Takvim saati ve ay bazında kapsam, son çekim zamanı (göstergede hangi ayların eksik olduğunu görmek için)
    const rows = await prisma.generationRecord.findMany({
      where: projectRecords,
      select: {
        timestamp: true,
        plantId: true,
        marketData: { select: { source: true, syncedAt: true, createdAt: true } },
      },
    });
    // Takvim saati bazında: bir saat, o saatteki tüm santral kayıtları doğrulanmış fiyatlıysa "tamam" sayılır
    // (santral × saat sayısı 4 santralde yılda 35.040 eder; kullanıcıya 8.760 takvim saati gösterilir)
    const byHour = new Map<number, { verified: boolean; missing: boolean }>();
    let lastSyncedAt: Date | null = null;
    for (const r of rows) {
      const t = r.timestamp.getTime();
      const h = byHour.get(t) ?? { verified: true, missing: false };
      if (!r.marketData) {
        h.verified = false;
        h.missing = true;
      } else if (!VERIFIED_SOURCES.includes(r.marketData.source)) {
        h.verified = false;
      } else {
        // syncedAt eklenmeden önce çekilen kayıtlarda ilk yazılma anı kullanılır
        const at = r.marketData.syncedAt ?? r.marketData.createdAt;
        if (!lastSyncedAt || at > lastSyncedAt) lastSyncedAt = at;
      }
      byHour.set(t, h);
    }
    const monthMap = new Map<string, { month: string; hours: number; verifiedHours: number; missingHours: number }>();
    let calendarVerified = 0;
    for (const [t, h] of byHour) {
      const month = new Date(t).toISOString().slice(0, 7);
      const m = monthMap.get(month) ?? { month, hours: 0, verifiedHours: 0, missingHours: 0 };
      m.hours++;
      if (h.verified) {
        m.verifiedHours++;
        calendarVerified++;
      }
      if (h.missing) m.missingHours++;
      monthMap.set(month, m);
    }
    const months = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    // Santral × ay üretim verisi bütünlüğü: bir santralin ayı eksikse o ay hesaplardan sessizce düşer
    const plants = await prisma.powerPlant.findMany({ where: { projectId }, select: { id: true, name: true } });
    const stampsByPlant = new Map<string, number[]>(plants.map((p) => [p.id, []]));
    for (const r of rows) stampsByPlant.get(r.plantId)?.push(r.timestamp.getTime());
    const generationGaps = findDataGaps(plants.map((p) => ({ plantName: p.name, timestamps: stampsByPlant.get(p.id) ?? [] }))).map(describeGap);

    return NextResponse.json({
      success: true,
      totalHours,
      verifiedHours,
      unverifiedHours,
      missingPriceHours,
      syntheticHours: hoursBySource.SEED || 0,
      legacyHours: hoursBySource.LEGACY || 0,
      hoursBySource,
      epiasHours: hoursBySource.EPIAS || 0,
      fileHours: hoursBySource.FILE || 0,
      lastSyncedAt,
      calendarHours: byHour.size,
      calendarVerifiedHours: calendarVerified,
      months,
      isFullyVerified: totalHours > 0 && verifiedHours === totalHours,
      generationGaps,
      dateRange: {
        start: range._min.timestamp,
        end: range._max.timestamp,
      },
    });
  } catch (error) {
    console.error("Data quality error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Veri kalitesi hesaplanırken hata oluştu.",
      },
      { status: 500 }
    );
  }
}
