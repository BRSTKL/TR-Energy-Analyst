/**
 * TR-Energy Analyst - "Maliyet neden değişti?" için projeleri yükler ve eşler
 *
 * İki proje (ör. aynı santrallerin 2025 ve 2026 projeleri) saatlik veriyle yüklenir, santraller EPİAŞ kimliğiyle
 * (yoksa adla) eşlenir ve decomposeCostChange'e verilir. Uzlaştırma birimi sonuç sayfasıyla aynıdır (şirket ya da
 * toplayıcı). Rapor için bir projenin bir önceki yılını kapsayan eşi de burada bulunur.
 */

import { prisma } from "@/lib/prisma";
import { projectPeriod } from "@/lib/services/project-records";
import { decomposeCostChange, type CostChangePeriodInput, type CostChangeResult } from "@/lib/analysis/cost-change";
import { loadProjectHourly, type ProjectHourly } from "@/lib/services/project-hourly";
import { loadSectorBenchmark } from "@/lib/services/sector";
import { sectorPeriodLabel, sectorYearChange, type SectorTech, type SectorTypeChange } from "@/lib/sector/benchmark";

export function toCostChangeInput(data: ProjectHourly, label: string): CostChangePeriodInput {
  return {
    label,
    profile: data.profile,
    plants: data.plants
      .filter((p) => p.hourly.length > 0)
      .map((p) => ({
        key: p.epiasPlantId !== null ? `epias:${p.epiasPlantId}` : `name:${p.plantName.trim().toLocaleLowerCase("tr-TR")}`,
        name: p.plantName,
        unit: p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`,
        hourly: p.hourly,
      })),
  };
}

/** Projenin ilk saatlik verisinin zamanı; veri yoksa null */
function firstHour(data: ProjectHourly): number | null {
  let t = Infinity;
  for (const p of data.plants) if (p.hourly.length) t = Math.min(t, new Date(p.hourly[0].timestamp).getTime());
  return Number.isFinite(t) ? t : null;
}

export interface ProjectCostChange {
  a: { id: string; name: string };
  b: { id: string; name: string };
  result: CostChangeResult;
}

/**
 * İki projenin ayrıştırması; önce başlayan proje A'dır. Etiket, yıllar farklıysa yıl, aynıysa proje adıdır.
 * Projelerden biri yoksa, verisi yoksa ya da ortak santral / takvim saati yoksa hata metni döner.
 */
export async function projectCostChange(idA: string, idB: string): Promise<ProjectCostChange | { error: string }> {
  const [x, y] = await Promise.all([loadProjectHourly(idA), loadProjectHourly(idB)]);
  if (!x || !y) return { error: "Proje bulunamadı." };
  const [tx, ty] = [firstHour(x), firstHour(y)];
  if (tx === null || ty === null) return { error: "Projelerden birinde piyasa fiyatı eşleşmiş saatlik veri yok." };
  const [A, B] = tx <= ty ? [x, y] : [y, x];
  const [yearA, yearB] = [new Date(Math.min(tx, ty)).getUTCFullYear(), new Date(Math.max(tx, ty)).getUTCFullYear()];
  const labels = yearA !== yearB ? [String(yearA), String(yearB)] : [A.project.name, B.project.name];
  const result = decomposeCostChange(toCostChangeInput(A, labels[0]), toCostChangeInput(B, labels[1]));
  if (!result) return { error: "İki projede ortak santral ya da takvimde örtüşen saat yok; ayrıştırma aynı santrallerin iki dönemini gerektirir." };
  return { a: { id: A.project.id, name: A.project.name }, b: { id: B.project.id, name: B.project.name }, result };
}

/**
 * Projenin bir önceki yılını kapsayan eşi: EPİAŞ santrallerinin en az %80'ini içeren ve verisi bir önceki yılda
 * başlayan proje (en çok örtüşen). Yoksa null.
 */
export async function findPreviousYearProject(data: ProjectHourly): Promise<{ id: string; name: string } | null> {
  const ids = data.plants.filter((p) => p.hourly.length > 0 && p.epiasPlantId !== null).map((p) => p.epiasPlantId!);
  const start = firstHour(data);
  if (ids.length === 0 || start === null) return null;
  const year = new Date(start).getUTCFullYear();
  const candidates = await prisma.project.findMany({
    where: { id: { not: data.project.id }, plants: { some: { epiasPlantId: { in: ids } } } },
    select: { id: true, name: true, periodStart: true, periodEnd: true, plants: { select: { epiasPlantId: true } } },
  });
  let best: { id: string; name: string; overlap: number } | null = null;
  for (const c of candidates) {
    const own = new Set(c.plants.map((p) => p.epiasPlantId));
    const overlap = ids.filter((id) => own.has(id)).length / ids.length;
    if (overlap < 0.8 || (best && overlap <= best.overlap)) continue;
    const period = await projectPeriod(c);
    if (period && Number(period.start.slice(0, 4)) === year - 1) best = { id: c.id, name: c.name, overlap };
  }
  return best ? { id: best.id, name: best.name } : null;
}

export interface ReportCostChange {
  previousProject: string;
  result: CostChangeResult;
  /** Sektör karnesinde iki yılda da kıyaslanan santrallerin değişimi (karneler toplanmışsa) */
  sector: { prevLabel: string; curLabel: string; byType: Partial<Record<SectorTech, SectorTypeChange>> } | null;
}

/** Rapordaki "Ne değişti?" slaytı için: önceki yıl projesi yoksa null */
export async function reportCostChange(data: ProjectHourly): Promise<ReportCostChange | null> {
  const prev = await findPreviousYearProject(data);
  if (!prev) return null;
  const change = await projectCostChange(prev.id, data.project.id);
  if ("error" in change) return null;
  const year = Number(change.result.b.start.slice(0, 4));
  const [before, now] = await Promise.all([loadSectorBenchmark(year - 1), loadSectorBenchmark(year)]);
  return {
    previousProject: prev.name,
    result: change.result,
    sector: before && now ? { prevLabel: sectorPeriodLabel(before), curLabel: sectorPeriodLabel(now), byType: sectorYearChange(before, now) } : null,
  };
}
