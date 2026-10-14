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
import { converterFor, macroSeries } from "@/lib/macro/series";
import { averagePriceLevel, monthsBetween, priceLevelRatio } from "@/lib/macro/price-units";

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

/**
 * Aynı ayrıştırma reel TL ve USD olarak (genel fiyat artışı ve kur "fiyat makası" kalemine girmez).
 * Reel: A döneminin her saati B döneminin ortalama TÜFE düzeyine taşınır, B olduğu gibi kalır; böylece B rakamları
 * raporun geri kalanındaki nominal rakamlarla aynıdır ("2025, 2026 fiyatlarıyla").
 */
export interface CostChangeUnits {
  real: CostChangeResult;
  usd: CostChangeResult;
  /** "2026 fiyat düzeyinde TL" */
  realLabel: string;
  /** "TL (2026 fiyatlarıyla)" */
  realShort: string;
  /** İki dönemin genel fiyat oranı (B / A, TÜFE) */
  priceRatio: number | null;
}

export interface ProjectCostChange {
  a: { id: string; name: string };
  b: { id: string; name: string };
  result: CostChangeResult;
  units: CostChangeUnits | null;
}

/** Nominal ayrıştırmanın reel TL ve USD karşılıkları */
export function costChangeUnits(inputA: CostChangePeriodInput, inputB: CostChangePeriodInput, nominal: CostChangeResult): CostChangeUnits | null {
  const series = macroSeries();
  const cpi = converterFor("REAL");
  const usd = converterFor("USD");
  const levelB = averagePriceLevel(series, monthsBetween(nominal.b.start, nominal.b.end));
  if (!levelB || !cpi.baseMonth) return null;
  // cpi.factor = TÜFE[taban] / TÜFE[ay] → B düzeyine: × levelB / TÜFE[taban]
  const toB = levelB / series.cpi[cpi.baseMonth];
  const realShort = `TL (${nominal.b.label} fiyatlarıyla)`;
  const r = decomposeCostChange({ ...inputA, priceScale: (t) => cpi.factor(t) * toB, unit: realShort }, { ...inputB, unit: realShort });
  const u = decomposeCostChange({ ...inputA, priceScale: usd.factor, unit: "USD" }, { ...inputB, priceScale: usd.factor, unit: "USD" });
  if (!r || !u) return null;
  return {
    real: r,
    usd: u,
    realLabel: `${nominal.b.label} fiyat düzeyinde TL`,
    realShort,
    priceRatio: priceLevelRatio(series, monthsBetween(nominal.a.start, nominal.a.end), monthsBetween(nominal.b.start, nominal.b.end)),
  };
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
  const [inputA, inputB] = [toCostChangeInput(A, labels[0]), toCostChangeInput(B, labels[1])];
  const result = decomposeCostChange(inputA, inputB);
  if (!result) return { error: "İki projede ortak santral ya da takvimde örtüşen saat yok; ayrıştırma aynı santrallerin iki dönemini gerektirir." };
  return { a: { id: A.project.id, name: A.project.name }, b: { id: B.project.id, name: B.project.name }, result, units: costChangeUnits(inputA, inputB, result) };
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
  units: CostChangeUnits | null;
  /** Sektör karnesinde iki yılda da kıyaslanan santrallerin değişimi (karneler toplanmışsa) */
  sector: { prevLabel: string; curLabel: string; byType: Partial<Record<SectorTech, SectorTypeChange>> } | null;
}

/** Karnenin kapsadığı aylar (dönem yazılı değilse tam yıl) */
const benchmarkMonths = (b: { year: number; period?: { start: string; end: string } }) =>
  b.period ? monthsBetween(b.period.start, b.period.end) : monthsBetween(`${b.year}-01-01`, `${b.year}-12-31`);

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
    units: change.units,
    sector:
      before && now
        ? {
            prevLabel: sectorPeriodLabel(before),
            curLabel: sectorPeriodLabel(now),
            byType: sectorYearChange(before, now, priceLevelRatio(macroSeries(), benchmarkMonths(before), benchmarkMonths(now))),
          }
        : null,
  };
}
