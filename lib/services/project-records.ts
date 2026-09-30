/**
 * TR-Energy Analyst - Projeyi saatlik kayıtları ve piyasa verisiyle yükleme
 *
 * İki kaynak:
 * - Havuzdan okunan santral (poolBacked, PLAN 7.7): saatler veri havuzundan (data/pool), projenin dönemi içinde.
 *   Veritabanına saatlik kayıt yazılmaz; aynı santral birden çok projede tek kopyadır.
 * - Diğerleri (dosyadan yüklenen santraller, 7.7 öncesi projeler): GenerationRecord tablosu.
 * Dönen biçim eski `include: { records: { include: { marketData } } }` sorgusuyla aynıdır; çağıranlar kaynağı bilmez.
 * Havuz kayıtlarında `imbalanceCostTl` 0'dır (saklanan maliyet kullanılmaz; her okuyucu motorla yeniden hesaplar).
 *
 * Tek bir include sorgusu 61 santral × 5.800 saatte JavaScript'in metin sınırına (~512 MB) yaklaşıp "Failed to convert
 * rust `String` into napi `string`" hatası verdiği için kayıtlar santral santral, piyasa verisi dönem için bir kez okunur.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { poolPlantRows } from "@/lib/pool/pool-hours";

type ProjectWithRecordsBase = Prisma.ProjectGetPayload<{
  include: { pricingProfiles: true; plants: { include: { records: { include: { marketData: true } } } } };
}>;
/** Kayıtlar: havuz santrallerinde son KGÜP de taşınır (veritabanı kayıtlarında null) */
export type ProjectWithRecords = Omit<ProjectWithRecordsBase, "plants"> & {
  plants: Array<
    Omit<ProjectWithRecordsBase["plants"][number], "records"> & {
      records: Array<ProjectWithRecordsBase["plants"][number]["records"][number] & { forecastFinalMwh: number | null }>;
    }
  >;
};
type Plant = Prisma.PowerPlantGetPayload<object>;
type GenRecord = Prisma.GenerationRecordGetPayload<object> & { forecastFinalMwh?: number | null };

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Projenin dönemi: kayıtlıysa o; değilse veritabanı kayıtlarının ilk ve son günü (eski projeler). Veri yoksa null.
 */
export async function projectPeriod(project: {
  id: string;
  periodStart: string | null;
  periodEnd: string | null;
}): Promise<{ start: string; end: string } | null> {
  if (project.periodStart && project.periodEnd) return { start: project.periodStart, end: project.periodEnd };
  const range = await prisma.generationRecord.aggregate({
    where: { plant: { projectId: project.id } },
    _min: { timestamp: true },
    _max: { timestamp: true },
  });
  return range._min.timestamp && range._max.timestamp ? { start: day(range._min.timestamp), end: day(range._max.timestamp) } : null;
}

/** Santralin saatlik kayıtları (kaynağına göre), zaman sırasıyla; havuz kayıtlarında piyasa bağlantısı sonra kurulur */
async function plantRecords(plant: Plant, period: { start: string; end: string } | null): Promise<GenRecord[]> {
  if (!plant.poolBacked) return prisma.generationRecord.findMany({ where: { plantId: plant.id }, orderBy: { timestamp: "asc" } });
  if (!period) return [];
  const rows = await poolPlantRows(plant, period.start, period.end);
  return rows.map((r) => ({
    id: `${plant.id}:${r.timestamp.getTime()}`,
    plantId: plant.id,
    marketDataId: null,
    timestamp: r.timestamp,
    forecastMwh: r.forecastMwh,
    actualMwh: r.actualMwh,
    imbalanceMwh: r.actualMwh - r.forecastMwh,
    imbalanceCostTl: 0,
    forecastFinalMwh: r.forecastFinalMwh,
    createdAt: plant.createdAt,
    updatedAt: plant.updatedAt,
  }));
}

export async function findProjectWithRecords(
  projectId: string,
  { plantOrder }: { plantOrder?: "createdAt" } = {}
): Promise<ProjectWithRecords | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { pricingProfiles: true, plants: plantOrder ? { orderBy: { createdAt: "asc" } } : true },
  });
  if (!project) return null;

  const period = project.plants.some((p) => p.poolBacked) ? await projectPeriod(project) : null;
  let minT = Infinity;
  let maxT = -Infinity;
  const recordsByPlant = new Map<string, GenRecord[]>();
  for (const plant of project.plants) {
    const records = await plantRecords(plant, period);
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
  const marketByTime = new Map(market.map((m) => [m.timestamp.getTime(), m]));

  return {
    ...project,
    plants: project.plants.map((plant) => ({
      ...plant,
      records: (recordsByPlant.get(plant.id) ?? []).map((r) => {
        // Havuz kaydı piyasaya saatle, veritabanı kaydı kayıtlı bağlantıyla eşleşir
        const m = plant.poolBacked ? marketByTime.get(r.timestamp.getTime()) : r.marketDataId ? marketById.get(r.marketDataId) : undefined;
        return { ...r, forecastFinalMwh: r.forecastFinalMwh ?? null, marketDataId: m?.id ?? r.marketDataId, marketData: m ?? null };
      }),
    })),
  };
}

export interface PlantHourSummary {
  count: number;
  first: Date | null;
  last: Date | null;
}

/**
 * Projelerin santral başına saat sayısı ve ilk/son saati (liste ve proje sayfaları için; piyasa verisi okunmaz).
 * Havuzdan okunan santraller önbellekli dosyadan sayılır.
 */
export async function plantHourSummaries(
  projects: Array<{ id: string; periodStart: string | null; periodEnd: string | null; plants: Plant[] }>
): Promise<Map<string, PlantHourSummary>> {
  const out = new Map<string, PlantHourSummary>();
  const dbPlantIds = projects.flatMap((p) => p.plants.filter((pl) => !pl.poolBacked).map((pl) => pl.id));
  if (dbPlantIds.length) {
    const rows = await prisma.generationRecord.groupBy({
      by: ["plantId"],
      where: { plantId: { in: dbPlantIds } },
      _count: { _all: true },
      _min: { timestamp: true },
      _max: { timestamp: true },
    });
    for (const r of rows) out.set(r.plantId, { count: r._count._all, first: r._min.timestamp, last: r._max.timestamp });
  }
  for (const project of projects) {
    const pool = project.plants.filter((pl) => pl.poolBacked);
    if (!pool.length) continue;
    const period = await projectPeriod(project);
    for (const plant of pool) {
      const rows = period ? await poolPlantRows(plant, period.start, period.end) : [];
      out.set(plant.id, { count: rows.length, first: rows[0]?.timestamp ?? null, last: rows[rows.length - 1]?.timestamp ?? null });
    }
  }
  for (const project of projects) for (const pl of project.plants) if (!out.has(pl.id)) out.set(pl.id, { count: 0, first: null, last: null });
  return out;
}
