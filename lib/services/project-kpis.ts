/**
 * TR-Energy Analyst - Proje karşılaştırması için özet göstergeler
 *
 * Her proje Dengesizlik Karnesi ile aynı motordan geçer (şirket bazında uzlaştırma, KÜPST, YEKDEM varsayımları,
 * 2026 kuralları, sektör sırası); karşılaştırma tablosundaki rakamlar rapordakilerle birebir aynıdır.
 */

import { buildPlantReport, deviationLoad } from "@/lib/report/plant-report";
import { buildReportContext } from "@/lib/services/report-context";
import { loadProjectHourly } from "@/lib/services/project-hourly";

export interface ProjectKpis {
  id: string;
  name: string;
  companies: string[];
  plantCount: number;
  capacityMw: number;
  types: string[];
  period: { start: string; end: string; months: number } | null;
  actualMwh: number;
  /** Santraller tek tek uzlaştırılsaydı / şirket bazında / aradaki netleşme */
  imbalancePlantLevelTl: number;
  imbalanceCompanyLevelTl: number;
  nettingTl: number;
  kupstTl: number;
  /** Sapma yükü: A = ana senaryo (YEKDEM dengesizliği havuzda), B = tüm santraller şirkete */
  load: { a2025: number; a2026: number | null; b2025: number; b2026: number | null };
  /** Tüm santrallerin sapma yükü / üretim (B tanımı, şirketler arası tutarlı taban) */
  unitLoadTl: number;
  /** Piyasaya açık portföy varsayımıyla, 2026 kurallarıyla (en az 6 ay veri) */
  riskPremium: { expectedTlPerMwh: number; p90MonthTlPerMwh: number } | null;
  sector: Array<{ type: string; unitTl: number; rankPct: number }>;
  yekdem: { inYekdem: number; exiting: number; staying: number; unknown: number };
  worstPlant: { name: string; type: string; unitCostTl: number } | null;
}

/** Proje yoksa ya da hiç saatlik verisi yoksa null */
export async function projectKpis(projectId: string): Promise<ProjectKpis | null> {
  const data = await loadProjectHourly(projectId);
  if (!data) return null;
  const withData = data.plants.filter((p) => p.hourly.length > 0);
  if (withData.length === 0) return null;
  const year = new Date(withData[0].hourly[0].timestamp).getUTCFullYear();
  const { context } = await buildReportContext(withData, year);
  const r = buildPlantReport({ ...data, plants: withData }, context, { intraday: false });
  const load = deviationLoad(r);
  const worst = r.plants.reduce<(typeof r.plants)[number] | null>((w, p) => (!w || p.unitCostTl > w.unitCostTl ? p : w), null);
  const ex = r.exposure;
  return {
    id: data.project.id,
    name: data.project.name,
    companies: r.settlement.companies.map((c) => c.name).filter((n): n is string => !!n),
    plantCount: r.plants.length,
    capacityMw: r.plants.reduce((a, p) => a + p.capacityMw, 0),
    types: Array.from(new Set(r.plants.map((p) => p.type))),
    period: { start: r.period.start, end: r.period.end, months: r.period.months },
    actualMwh: r.totals.actualMwh,
    imbalancePlantLevelTl: r.settlement.plantLevelCostTl,
    imbalanceCompanyLevelTl: r.settlement.companyLevelCostTl,
    nettingTl: r.settlement.sameCompanyNettingTl,
    kupstTl: r.kupst.totalTl,
    load,
    unitLoadTl: r.totals.actualMwh > 0 ? load.b2025 / r.totals.actualMwh : 0,
    riskPremium: r.riskPremium
      ? { expectedTlPerMwh: r.riskPremium.portfolio.expectedTlPerMwh, p90MonthTlPerMwh: r.riskPremium.portfolio.p90MonthTlPerMwh }
      : null,
    sector: (r.sector?.types ?? []).map((t) => ({ type: t.type, unitTl: t.portfolioUnitTl, rankPct: t.portfolioRankPct })),
    yekdem: {
      inYekdem: r.yekdem?.plantNames.length ?? 0,
      exiting: ex?.exitingPlants.length ?? 0,
      staying: ex?.stayingPlants.length ?? 0,
      unknown: ex?.unknownExitPlants.length ?? 0,
    },
    worstPlant: worst ? { name: worst.name, type: worst.type, unitCostTl: worst.unitCostTl } : null,
  };
}
