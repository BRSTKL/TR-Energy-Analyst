/**
 * TR-Energy Analyst - Onaylanan Eşleştirmeyi Veritabanına Yazma
 *
 * Her santral için dosyadaki tarih aralığında mevcut kayıtları siler ve yeni saatlik kayıtları yazar.
 * Tüm santraller tek bir işlem (transaction) içinde yazılır; biri başarısız olursa hiçbiri yazılmaz.
 * Kayıtlar aynı saatin piyasa verisine bağlanır ve dengesizlik maliyeti hesaplama motoruyla hesaplanır.
 */

import { prisma } from "@/lib/prisma";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { ImbalancePricingProfile, SystemDirection } from "@/lib/calculations/types";
import { ParsedGenerationRow } from "@/lib/parsers/generation-parser";

export interface PlantWriteResult {
  plantId: string;
  written: number;
  /** Aynı tarih aralığında silinip yerine yazılan eski kayıt sayısı */
  replaced: number;
  matchedMarketHours: number;
  missingMarketHours: number;
}

const CHUNK_SIZE = 1000;

export async function writePlantImports(
  imports: Array<{ plantId: string; rows: ParsedGenerationRow[] }>,
  profile: ImbalancePricingProfile
): Promise<PlantWriteResult[]> {
  const withRows = imports.filter((i) => i.rows.length > 0);
  if (withRows.length === 0) return [];

  const allTimes = withRows.flatMap((i) => i.rows.map((r) => r.timestamp.getTime()));
  const start = new Date(Math.min(...allTimes));
  const end = new Date(Math.max(...allTimes));

  const marketRecords = await prisma.marketData.findMany({
    where: { timestamp: { gte: start, lte: end } },
  });
  const marketMap = new Map(marketRecords.map((m) => [m.timestamp.getTime(), m]));

  return prisma.$transaction(
    async (tx) => {
      const results: PlantWriteResult[] = [];

      for (const { plantId, rows } of withRows) {
        const plantStart = rows[0].timestamp;
        const plantEnd = rows[rows.length - 1].timestamp;

        const { count: replaced } = await tx.generationRecord.deleteMany({
          where: { plantId, timestamp: { gte: plantStart, lte: plantEnd } },
        });

        let matched = 0;
        const records = rows.map((row) => {
          const market = marketMap.get(row.timestamp.getTime());
          let imbalanceCostTl = 0;
          if (market) {
            matched++;
            imbalanceCostTl = Number(
              processHourlyRecord(
                { timestamp: row.timestamp, forecastMwh: row.forecastMwh, actualMwh: row.actualMwh },
                {
                  timestamp: market.timestamp,
                  ptf: market.ptf,
                  smf: market.smf,
                  systemDirection: market.systemDirection as SystemDirection,
                },
                profile
              ).imbalanceCost.toFixed(2)
            );
          }
          return {
            plantId,
            marketDataId: market?.id ?? null,
            timestamp: row.timestamp,
            forecastMwh: row.forecastMwh,
            actualMwh: row.actualMwh,
            imbalanceMwh: row.imbalanceMwh,
            imbalanceCostTl,
          };
        });

        for (let i = 0; i < records.length; i += CHUNK_SIZE) {
          await tx.generationRecord.createMany({ data: records.slice(i, i + CHUNK_SIZE) });
        }

        results.push({
          plantId,
          written: records.length,
          replaced,
          matchedMarketHours: matched,
          missingMarketHours: records.length - matched,
        });
      }

      return results;
    },
    { maxWait: 10_000, timeout: 120_000 }
  );
}
