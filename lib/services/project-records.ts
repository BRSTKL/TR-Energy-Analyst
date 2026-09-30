/**
 * TR-Energy Analyst - Projeyi saatlik kayıtları ve piyasa verisiyle yükleme
 *
 * Tek bir `include: { records: { include: { marketData } } }` sorgusu Prisma'nın cevabını tek bir JSON metni olarak
 * taşır; 61 santral × 5.800 saatte (toplayıcı portföyü) bu metin JavaScript'in metin sınırına (~512 MB) yaklaşıp
 * "Failed to convert rust `String` into napi `string`" hatası verdi. Burada kayıtlar santral santral, piyasa verisi
 * dönem için bir kez okunur ve bellekte eşleştirilir. Dönen biçim eski `include` sorgusuyla aynıdır.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ProjectWithRecords = Prisma.ProjectGetPayload<{
  include: { pricingProfiles: true; plants: { include: { records: { include: { marketData: true } } } } };
}>;

export async function findProjectWithRecords(
  projectId: string,
  { plantOrder }: { plantOrder?: "createdAt" } = {}
): Promise<ProjectWithRecords | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { pricingProfiles: true, plants: plantOrder ? { orderBy: { createdAt: "asc" } } : true },
  });
  if (!project) return null;

  let minT = Infinity;
  let maxT = -Infinity;
  const recordsByPlant = new Map<string, Prisma.GenerationRecordGetPayload<object>[]>();
  for (const plant of project.plants) {
    const records = await prisma.generationRecord.findMany({ where: { plantId: plant.id }, orderBy: { timestamp: "asc" } });
    recordsByPlant.set(plant.id, records);
    if (records.length) {
      minT = Math.min(minT, records[0].timestamp.getTime());
      maxT = Math.max(maxT, records[records.length - 1].timestamp.getTime());
    }
  }
  const market = Number.isFinite(minT)
    ? await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(minT), lte: new Date(maxT) } } })
    : [];
  const marketById = new Map(market.map((m) => [m.id, m]));

  return {
    ...project,
    plants: project.plants.map((plant) => ({
      ...plant,
      records: (recordsByPlant.get(plant.id) ?? []).map((r) => ({
        ...r,
        marketData: r.marketDataId ? marketById.get(r.marketDataId) ?? null : null,
      })),
    })),
  };
}
