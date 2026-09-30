/**
 * TR-Energy Analyst - Projenin EPİAŞ verisini tamamlama (PLAN 10.1)
 *
 * Tek çağrıyla bir projenin ihtiyaç duyduğu bütün açık veri tamamlanır:
 *   1. Piyasa verisi (PTF, SMF, sistem yönü, GİP): dönemdeki eksik aylar EPİAŞ'tan.
 *   2. Resmi dengesizlik fiyatları (sistem tutarı / miktarı): piyasa verisi olup resmi fiyatı eksik aylar.
 *   3. Havuzdan okunan santrallerin ilk KGÜP, son KGÜP ve UEVM serileri (ensurePlantCoverage: yalnız eksik ve
 *      yenilenme zamanı gelmiş aylar).
 * Proje oluşturulurken, sonuç sayfasındaki "EPİAŞ verilerini tamamla" ile ve scripts/pool-backfill.mts ile kullanılır.
 * EPİAŞ hata verirse (VPN, 403) kalan işler denenmez; tekrar çağrı kaldığı yerden devam eder.
 */

import { prisma } from "@/lib/prisma";
import { monthChunks } from "@/lib/date-chunks";
import { ensurePlantCoverage } from "@/lib/pool/pool-sync";
import { projectPeriod } from "@/lib/services/project-records";
import { syncEpiasToDatabase } from "@/lib/services/epias-service";
import { syncOfficialImbalancePrices } from "@/lib/services/imbalance-prices";

export interface ProjectDataSyncResult {
  period: { start: string; end: string } | null;
  marketMonthsSynced: string[];
  officialPriceMonthsSynced: string[];
  plants: Array<{ name: string; fromEpias: number; fromPool: number; failed: number; error?: string }>;
  errors: string[];
}

/** Resmi dengesizlik fiyatı EPİAŞ'ta 2024'ten itibaren yayımlanır */
const OFFICIAL_PRICES_FROM = "2024-01-01";

export async function syncProjectData(
  projectId: string,
  { onProgress }: { onProgress?: (msg: string) => void } = {}
): Promise<ProjectDataSyncResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { plants: true } });
  if (!project) throw new Error("Proje bulunamadı.");
  const period = await projectPeriod(project);
  const result: ProjectDataSyncResult = { period, marketMonthsSynced: [], officialPriceMonthsSynced: [], plants: [], errors: [] };
  if (!period) return result;

  // Gelecek günler istenmez (Türkiye takvim günü)
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const end = period.end < today ? period.end : today;

  // 1–2. Piyasa verisi ve resmi dengesizlik fiyatları
  for (const chunk of monthChunks(period.start, end)) {
    const from = new Date(`${chunk.start}T00:00:00Z`);
    const to = new Date(`${chunk.end}T23:00:00Z`);
    const expected = Math.round((to.getTime() - from.getTime()) / 3_600_000) + 1;
    try {
      const have = await prisma.marketData.count({ where: { timestamp: { gte: from, lte: to }, source: { in: ["EPIAS", "FILE"] } } });
      if (have < expected * 0.99) {
        onProgress?.(`Piyasa verisi · ${chunk.label}`);
        // Piyasa senkronu resmi fiyatları da çeker
        await syncEpiasToDatabase({ startDate: chunk.start, endDate: chunk.end, recalculateCosts: false });
        result.marketMonthsSynced.push(chunk.label);
        continue;
      }
      if (chunk.start >= OFFICIAL_PRICES_FROM) {
        const official = await prisma.marketData.count({ where: { timestamp: { gte: from, lte: to }, imbalancePosPrice: { not: null } } });
        // Sistem dengesizliği çok küçük saatlerde resmi fiyat yazılmaz (MIN_SYSTEM_MWH): %95 yeterli sayılır
        if (official < expected * 0.95) {
          onProgress?.(`Resmi dengesizlik fiyatları · ${chunk.label}`);
          await syncOfficialImbalancePrices(chunk.start, chunk.end);
          result.officialPriceMonthsSynced.push(chunk.label);
        }
      }
    } catch (e) {
      result.errors.push(`${chunk.label}: ${e instanceof Error ? e.message : "piyasa verisi alınamadı"}`);
      return result; // bağlantı sorunu: santrallere geçmeden dur
    }
  }

  // 3. Havuz santralleri (üç seri birlikte)
  const plants = project.plants.filter((p) => p.poolBacked && p.epiasPlantId !== null);
  for (const [i, p] of plants.entries()) {
    onProgress?.(`${i + 1}/${plants.length} ${p.name}`);
    const c = await ensurePlantCoverage(p.epiasPlantId!, period.start, period.end, p.kgupVersion === "FINAL" ? "FINAL" : "FIRST");
    const failed = c.months.filter((m) => m.source === "failed");
    result.plants.push({
      name: p.name,
      fromEpias: c.months.filter((m) => m.source === "epias").length,
      fromPool: c.months.filter((m) => m.source === "pool").length,
      failed: failed.length,
      error: failed[0]?.error,
    });
    if (failed.length) {
      result.errors.push(`${p.name}: ${failed[0].error}`);
      break; // EPİAŞ bağlantısı yok: kalan santraller denenmez
    }
  }
  return result;
}
