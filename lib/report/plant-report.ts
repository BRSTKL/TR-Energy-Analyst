/**
 * TR-Energy Analyst - Santral / şirket dengesizlik raporu (dışarıya gönderilecek kısa rapor) için veri
 *
 * Okuyucu, santrallerin sahibi olan şirketin yöneticisidir. Bu yüzden rakamlar iki sınıfa ayrılır:
 *   - KESİN HESAP: veriden doğrudan çıkan tutarlar (geçmiş maliyet, 2026 katsayılarıyla aynı üretimin maliyeti)
 *   - SENARYO: bir davranış varsayımına dayanan tutarlar (DSG'de netleşme, gün içi pozisyon güncelleme)
 * Sunum katmanı (lib/export/plant-report-pptx.ts) bu ayrımı her slaytta etiketler.
 */

import { processHourlyRecord } from "@/lib/calculations/engine";
import { aggregateMonthly } from "@/lib/calculations/aggregate";
import { HourlyResult, ImbalancePricingProfile, REGULATORY_IMBALANCE_REGIMES } from "@/lib/calculations/types";
import { analyzePortfolioNetting } from "@/lib/analysis/portfolio-netting";
import { combineBacktests, persistenceStrategy, runBacktest } from "@/lib/analysis/backtest";
import type { ProjectHourly } from "@/lib/services/project-hourly";

export interface ReportPlantRow {
  name: string;
  type: string;
  capacityMw: number;
  actualMwh: number;
  revenueTl: number;
  imbalanceCostTl: number;
  /** TL / MWh (gerçekleşen üretim başına) */
  unitCostTl: number;
  /** Dengesizlik maliyetinin gelire oranı (%) */
  costShareOfRevenuePct: number;
  /** Σ|gerçekleşen − plan| / Σ gerçekleşen (%) */
  deviationPct: number;
}

export interface ReportMonth {
  month: string; // "YYYY-MM"
  actualMwh: number;
  imbalanceCostTl: number;
  unitCostTl: number;
}

export interface PlantReportData {
  projectName: string;
  period: { start: string; end: string; months: number; hours: number };
  plants: ReportPlantRow[];
  totals: Omit<ReportPlantRow, "name" | "type"> & { plantCount: number };
  monthly: ReportMonth[];
  /** KESİN HESAP: aynı saatlik veri 2026 katsayılarıyla fiyatlansaydı. Veri zaten tamamen 2026+ ise null. */
  coefficients2026: { baseCostTl: number; cost2026Tl: number; deltaTl: number; deltaPct: number } | null;
  /** SENARYO: santraller tek dengeden sorumlu grupta saatlik netleşseydi (en az 2 santral) */
  dsg: { standaloneCostTl: number; nettedCostTl: number; benefitTl: number; benefitPct: number; offsettingHourSharePct: number } | null;
  /** SENARYO: 1 saat önce görülen hatanın bir kısmı GİP'te kapatılsaydı (geçmiş veriyle, önceki aylardan öğrenerek test) */
  intraday: { savingTl: number; savingPct: number; testMonths: number; firstTestMonth: string; lastTestMonth: string } | null;
}

const COEF_2026 = REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].coefficients;
const REGIME_2026_START = Date.parse(`${REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].from}T00:00:00Z`);

const pct = (a: number, b: number) => (b === 0 ? 0 : (a / b) * 100);
const iso = (t: Date | string | number) => new Date(t).toISOString().slice(0, 10);

/** Aynı saatlik sonucu başka katsayılarla yeniden fiyatlar */
function reprice(h: HourlyResult, profile: ImbalancePricingProfile): HourlyResult {
  return processHourlyRecord(
    { timestamp: h.timestamp, actualMwh: h.actualMwh, forecastMwh: h.forecastMwh },
    { timestamp: h.timestamp, ptf: h.ptf, smf: h.smf, systemDirection: h.systemDirection },
    profile
  );
}

function plantRow(name: string, type: string, capacityMw: number, hourly: HourlyResult[]): ReportPlantRow {
  let actual = 0;
  let revenue = 0;
  let cost = 0;
  let absDev = 0;
  for (const h of hourly) {
    actual += h.actualMwh;
    revenue += h.totalRevenue;
    cost += h.imbalanceCost;
    absDev += Math.abs(h.actualMwh - h.forecastMwh);
  }
  return {
    name,
    type,
    capacityMw,
    actualMwh: actual,
    revenueTl: revenue,
    imbalanceCostTl: cost,
    unitCostTl: actual > 0 ? cost / actual : 0,
    costShareOfRevenuePct: pct(cost, revenue),
    deviationPct: pct(absDev, actual),
  };
}

export function buildPlantReport(data: ProjectHourly): PlantReportData {
  const withData = data.plants.filter((p) => p.hourly.length > 0);
  const all = withData.flatMap((p) => p.hourly);
  if (all.length === 0) throw new Error("Projede piyasa fiyatı eşleşmiş saatlik veri yok; rapor üretilemez.");

  // Çok santralli projede yüz binlerce saat olabilir: Math.min(...dizi) yerine döngü
  const times = all.map((h) => new Date(h.timestamp).getTime());
  let start = Infinity;
  let end = -Infinity;
  for (const t of times) {
    if (t < start) start = t;
    if (t > end) end = t;
  }

  const plants = withData
    .map((p) => plantRow(p.plantName, p.plantType, p.capacityMw, p.hourly))
    .sort((a, b) => b.imbalanceCostTl - a.imbalanceCostTl);
  const total = plantRow("Portföy", "", withData.reduce((s, p) => s + p.capacityMw, 0), all);

  // aggregateMonthly plantId taşıyan saatleri santral bazında gruplar: portföy ayı için santral bilgisi çıkarılır
  const monthly = aggregateMonthly(all.map((h) => ({ ...h, plantId: undefined, plantName: undefined }))).map((m) => ({
    month: m.yearMonth,
    actualMwh: m.totalActualMwh,
    imbalanceCostTl: m.totalImbalanceCost,
    unitCostTl: m.unitImbalanceCost,
  }));

  // 2026 katsayıları: yalnızca 2026 öncesi saat varsa anlamlı (aksi halde maliyet zaten bu kurallarla)
  let coefficients2026: PlantReportData["coefficients2026"] = null;
  if (start < REGIME_2026_START) {
    const profile2026: ImbalancePricingProfile = { mode: "CUSTOM", ...COEF_2026 };
    const cost2026 = all.reduce((s, h) => s + reprice(h, profile2026).imbalanceCost, 0);
    coefficients2026 = {
      baseCostTl: total.imbalanceCostTl,
      cost2026Tl: cost2026,
      deltaTl: cost2026 - total.imbalanceCostTl,
      deltaPct: pct(cost2026 - total.imbalanceCostTl, total.imbalanceCostTl),
    };
  }

  let dsg: PlantReportData["dsg"] = null;
  if (withData.length >= 2) {
    const netting = analyzePortfolioNetting(
      withData.map((p) => ({ plantId: p.plantId, plantName: p.plantName, plantType: p.plantType, hourly: p.hourly })),
      data.profile
    );
    const g = netting.portfolio;
    if (g) {
      dsg = {
        standaloneCostTl: g.standaloneCost,
        nettedCostTl: g.nettedCost,
        benefitTl: g.benefitTl,
        benefitPct: g.benefitRatio * 100,
        offsettingHourSharePct: g.offsettingHourShare * 100,
      };
    }
  }

  // Gün içi: önceki 4 aydan öğrenilen oranla, 1 saat önce görülen hatanın kapatılması (santral bazında, sonra toplam)
  let intraday: PlantReportData["intraday"] = null;
  const backtests = withData.map((p) => runBacktest(p.hourly, data.profile, { strategies: [persistenceStrategy(1)] }));
  const combined = combineBacktests(backtests.filter((b) => b.testMonths.length > 0));
  const s = combined?.strategies[0];
  if (combined && s && combined.testMonths.length > 0) {
    intraday = {
      savingTl: s.outOfSampleSavingTl,
      savingPct: s.outOfSampleSavingPercent,
      testMonths: combined.testMonths.length,
      firstTestMonth: combined.testMonths[0],
      lastTestMonth: combined.testMonths[combined.testMonths.length - 1],
    };
  }

  return {
    projectName: data.project.name,
    period: { start: iso(start), end: iso(end), months: monthly.length, hours: new Set(times).size },
    plants,
    totals: { ...total, plantCount: withData.length },
    monthly,
    coefficients2026,
    dsg,
    intraday,
  };
}
