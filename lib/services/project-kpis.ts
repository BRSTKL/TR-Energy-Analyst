/**
 * TR-Energy Analyst - Proje karşılaştırması için özet göstergeler
 *
 * Her proje Dengesizlik Karnesi ile aynı motordan geçer (şirket bazında uzlaştırma, KÜPST, YEKDEM varsayımları,
 * 2026 kuralları, sektör sırası); karşılaştırma tablosundaki rakamlar rapordakilerle birebir aynıdır.
 */

import { buildPlantReport, deviationLoad } from "@/lib/report/plant-report";
import { describeGap, findDataGaps } from "@/lib/analysis/data-completeness";
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
  /** Toplayıcı projesinde toplayıcının kattığı değer: sahipler tek başına → portföy (raporla aynı tanım) */
  aggregatorValue: { ownerLevelTl: number; benefitTl: number; benefitPct: number } | null;
  /** MWh başına dengesizlik: santraller tek tek ve uzlaştırma biriminde netleşmiş */
  unitPlantLevelTl: number;
  unitNettedTl: number;
  kupstTl: number;
  /** Sapma yükü (dengesizlik + KÜPST, tüm santraller): veri döneminin kurallarıyla; veri 2026 öncesiyse 2026 kurallarıyla da */
  load: { current: number; next2026: number | null };
  /** Sapma yükü / üretim */
  unitLoadTl: number;
  /** 2026 kurallarıyla (en az 6 ay veri) */
  riskPremium: { expectedTlPerMwh: number; p90MonthTlPerMwh: number } | null;
  sector: Array<{ type: string; unitTl: number; rankPct: number }>;
  yekdem: { inYekdem: number; exiting: number; staying: number; unknown: number };
  worstPlant: { name: string; type: string; unitCostTl: number } | null;
  /** Ayı eksik santraller ("Boreas 1 Enez RES: Temmuz 2025 yok"); boşsa veri tam */
  dataGaps: string[];
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
    aggregatorValue: r.aggregator
      ? { ownerLevelTl: r.aggregator.standaloneCostTl, benefitTl: r.aggregator.benefitTl, benefitPct: r.aggregator.benefitPct }
      : null,
    unitPlantLevelTl: r.totals.actualMwh > 0 ? r.settlement.plantLevelCostTl / r.totals.actualMwh : 0,
    unitNettedTl: r.totals.actualMwh > 0 ? r.settlement.companyLevelCostTl / r.totals.actualMwh : 0,
    kupstTl: r.kupst.totalTl,
    load,
    unitLoadTl: r.totals.actualMwh > 0 ? load.current / r.totals.actualMwh : 0,
    riskPremium: r.riskPremium
      ? { expectedTlPerMwh: r.riskPremium.portfolio.expectedTlPerMwh, p90MonthTlPerMwh: r.riskPremium.portfolio.p90MonthTlPerMwh }
      : null,
    sector: (r.sector?.types ?? []).map((t) => ({ type: t.type, unitTl: t.portfolioUnitTl, rankPct: t.portfolioRankPct })),
    yekdem: {
      inYekdem: r.yekdem?.plantNames.length ?? 0,
      // YEKDEM'den çıkış geliri etkiler (YEK fiyatı yerine PTF), dengesizliği etkilemez
      exiting: r.plants.filter((p) => p.yekdem && p.yekdemNextYear === false).length,
      staying: r.plants.filter((p) => p.yekdem && p.yekdemNextYear === true).length,
      unknown: r.plants.filter((p) => p.yekdem && p.yekdemNextYear === null).length,
    },
    worstPlant: worst ? { name: worst.name, type: worst.type, unitCostTl: worst.unitCostTl } : null,
    // Verisi hiç olmayan santral de görünsün diye tüm santrallerle
    dataGaps: findDataGaps(
      data.plants.map((p) => ({ plantName: p.plantName, timestamps: p.hourly.map((h) => new Date(h.timestamp).getTime()) }))
    ).map(describeGap),
  };
}
