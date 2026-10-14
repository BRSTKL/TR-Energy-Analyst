/**
 * TR-Energy Analyst - Dengesizlik bütçesi için veri (PLAN 17)
 *
 * Projenin bugünkü santralleri için geçmiş yılların saatleri havuzdan (UEVM ve KGÜP) ve piyasa verisinden (PTF, SMF,
 * sistem yönü) bütçe saatlerine çevrilir (lib/analysis/imbalance-budget.ts). Plan varsayılan olarak ilk KGÜP'tür: havuzda
 * 2025'in son planı yok (2026'da var), yıllar arası tutarlılık için sapma ve KÜPST ilk plana göre hesaplanır (sonuç
 * sayfasının ana rakamıyla aynı taban; gün içi düzeltmeden önceki maruziyet, üst sınır). "final" seçilirse son KGÜP,
 * yoksa ilk KGÜP. Uzlaştırma birimi sonuç sayfasıyla aynı (şirket; toplayıcıda
 * toplayıcı). KÜPST miktarı mevzuat fonksiyonlarıyla, en güncel oranlarla: toplayıcıda topluluk, şirkette santral bazında.
 * Havuzda olmayan santraller (dosyadan yüklenen) atlanır ve sayılır.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, REGULATORY_IMBALANCE_REGIMES, type HourlyResult, type MarketPriceRecord, type SystemDirection } from "@/lib/calculations/types";
import { KUPST_REGIMES, kupstCommunityHours, kupstForHour } from "@/lib/calculations/kupst";
import { AGGREGATOR_ORG_ID } from "@/lib/projects/aggregator";
import { readPoolYearCached } from "@/lib/pool/pool-store";
import {
  hourCost,
  imbalanceBudget,
  inflationPath,
  productionScenarios,
  realSpreadByYear,
  runRateProduction,
  yearQualityScale,
  type BudgetHour,
  type BudgetResult,
  type BudgetScenario,
  type ProductionLevel,
  type PlantMonths,
} from "@/lib/analysis/imbalance-budget";
import { converterFor, macroSeries } from "@/lib/macro/series";
import { latestMonth, monthLabelTr } from "@/lib/macro/price-units";
import { loadProjectHourly, type ProjectHourly } from "@/lib/services/project-hourly";

const HOUR = 3_600_000;
const latestKupst = KUPST_REGIMES[KUPST_REGIMES.length - 1];

export interface BudgetHoursResult {
  hours: BudgetHour[];
  /** Havuzda verisi olan / olmayan santraller */
  plantsUsed: number;
  plantsSkipped: string[];
  /** Yıl → saat sayısı */
  hoursByYear: Record<string, number>;
}

async function marketYear(year: number, untilMonth = 12): Promise<Map<number, MarketPriceRecord>> {
  const rows = await prisma.marketData.findMany({
    where: { timestamp: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year, untilMonth, 1)) } },
  });
  return new Map(
    rows.map((m) => [
      m.timestamp.getTime(),
      { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: null, imbalanceNegPrice: null },
    ])
  );
}

/**
 * Bütçe saatleri: verilen yılların (ör. 2025, 2026) her saati için birimlerin net sapması ve KÜPST miktarı.
 * untilMonth: son yılda kaç ay (ör. 2026 Ocak–Ağustos için 8); önceki yıllar tam.
 */
export async function loadBudgetHours(
  plants: ProjectHourly["plants"],
  years: number[],
  { aggregator, untilMonth = 12, plan: planBasis = "first" }: { aggregator: boolean; untilMonth?: number; plan?: "first" | "final" }
): Promise<BudgetHoursResult> {
  const skipped: string[] = [];
  const out: BudgetHour[] = [];
  const hoursByYear: Record<string, number> = {};
  let used = 0;
  const usedIds = new Set<string>();
  for (const [yi, year] of years.entries()) {
    const months = yi === years.length - 1 ? untilMonth : 12;
    const market = await marketYear(year, months);
    // Santral → saatlik sonuç (sapma seçilen plana göre)
    const series: Array<{ plant: ProjectHourly["plants"][number]; unit: string; hourly: HourlyResult[] }> = [];
    for (const p of plants) {
      const doc = p.epiasPlantId !== null ? await readPoolYearCached(p.epiasPlantId, year) : null;
      if (!doc) {
        if (!skipped.includes(p.plantName)) skipped.push(p.plantName);
        continue;
      }
      usedIds.add(p.plantId);
      const start = Date.parse(doc.start);
      const hourly: HourlyResult[] = [];
      for (let i = 0; i < doc.uevm.length; i++) {
        const t = start + i * HOUR;
        const m = market.get(t);
        const actual = doc.uevm[i];
        const plan = planBasis === "final" ? doc.kgupFinal[i] ?? doc.kgupFirst[i] : doc.kgupFirst[i];
        if (!m || actual === null || plan === null) continue;
        hourly.push(processHourlyRecord({ timestamp: m.timestamp, forecastMwh: plan, actualMwh: actual }, m, DEFAULT_IMBALANCE_PROFILE));
      }
      const unit = aggregator ? `org:${AGGREGATOR_ORG_ID}` : p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`;
      series.push({ plant: p, unit, hourly });
    }
    // KÜPST (TL, saatin kendi fiyatıyla) → miktar
    const kupstTl = new Map<number, number>();
    if (aggregator) {
      for (const [t, v] of Array.from(kupstCommunityHours(series.map((s) => ({ hourly: s.hourly, plantType: s.plant.plantType, capacityMw: s.plant.capacityMw })), latestKupst).entries()))
        kupstTl.set(t, v);
    } else {
      for (const s of series)
        for (const h of s.hourly) {
          const t = new Date(h.timestamp).getTime();
          kupstTl.set(t, (kupstTl.get(t) ?? 0) + kupstForHour(h, s.plant.plantType, latestKupst));
        }
    }
    // Saat → birim sapmaları
    const units = Array.from(new Set(series.map((s) => s.unit)));
    const byHour = new Map<number, BudgetHour>();
    for (const s of series) {
      const u = units.indexOf(s.unit);
      for (const h of s.hourly) {
        const t = new Date(h.timestamp).getTime();
        let b = byHour.get(t);
        if (!b) {
          b = { t, ptf: h.ptf, smf: h.smf, systemDirection: h.systemDirection, unitDeviations: new Array(units.length).fill(0), kupstQty: 0, actualMwh: 0 };
          byHour.set(t, b);
        }
        b.unitDeviations[u] += h.actualMwh - h.forecastMwh;
        b.actualMwh += h.actualMwh;
      }
    }
    for (const b of Array.from(byHour.values())) {
      const top = Math.max(b.ptf, b.smf);
      b.kupstQty = top > 0 ? (kupstTl.get(b.t) ?? 0) / top : 0;
      out.push(b);
    }
    hoursByYear[String(year)] = byHour.size;
  }
  used = usedIds.size;
  out.sort((a, b) => a.t - b.t);
  return { hours: out, plantsUsed: used, plantsSkipped: skipped, hoursByYear };
}

/** Santrallerin aylık üretimi (havuz UEVM; bütçe saatleriyle aynı: ilk planı olan saatler); runRateProduction girdisi */
export async function plantMonths(plants: ProjectHourly["plants"], year: number, untilMonth = 12): Promise<PlantMonths[]> {
  const out: PlantMonths[] = [];
  for (const p of plants) {
    const doc = p.epiasPlantId !== null ? await readPoolYearCached(p.epiasPlantId, year) : null;
    if (!doc) continue;
    const start = Date.parse(doc.start);
    const mwh: Array<number | null> = new Array(untilMonth).fill(null);
    for (let i = 0; i < doc.uevm.length; i++) {
      const m = new Date(start + i * HOUR).getUTCMonth();
      if (m >= untilMonth) break;
      const u = doc.uevm[i];
      if (u === null || doc.kgupFirst[i] === null) continue;
      mwh[m] = (mwh[m] ?? 0) + u;
    }
    out.push({ key: p.plantId, type: p.plantType, mwh });
  }
  return out;
}

export type BudgetSpread = "y2026" | "y2025" | "wide";
export type BudgetRule = "r2026" | "r2025" | "strict";
export type BudgetLevel = ProductionLevel | "custom";

export const BUDGET_SPREADS: Record<BudgetSpread, string> = {
  y2026: "Makas 2026 düzeyinde",
  y2025: "Makas 2025 düzeyine iner",
  wide: "Makas %20 daha açılır",
};
export const BUDGET_RULES: Record<BudgetRule, { label: string; rule: BudgetScenario["rule"] }> = {
  r2026: { label: "2026 kuralı (aynı yönde %6, ters yönde %3)", rule: REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].coefficients },
  r2025: { label: "2025 kuralı (düz %3)", rule: REGULATORY_IMBALANCE_REGIMES[0].coefficients },
  strict: {
    label: "Sertleşme (aynı yönde %9, ters yönde %3)",
    rule: { positiveSurplusCoef: 0.91, positiveOtherCoef: 0.97, negativeDeficitCoef: 1.09, negativeOtherCoef: 1.03, floors: true },
  },
};
export const BUDGET_LEVELS: Record<BudgetLevel, string> = {
  low: "Düşük üretim yılı",
  normal: "Normal yıl (iki yılın ortalaması)",
  high: "Yüksek üretim yılı",
  custom: "Kendi üretim tahmininiz",
};

const TECH_LOCATIVE: Record<string, string> = { HES: "hidroda", RES: "rüzgârda", GES: "güneşte" };
/** "hidroda 2025, rüzgârda 2026 düzeyi" (teknoloji bazında seçilen yıllar) */
function levelDetail(choice: Record<string, { low: number; high: number }>, which: "low" | "high"): string {
  const parts = ["HES", "RES", "GES", ...Object.keys(choice).filter((t) => !TECH_LOCATIVE[t])]
    .filter((t) => choice[t])
    .map((t) => `${TECH_LOCATIVE[t] ?? "diğer türlerde"} ${choice[t][which]}`);
  return parts.length ? `${parts.join(", ")} düzeyi` : "";
}

export interface ProjectBudget {
  project: { id: string; name: string };
  year: number;
  options: { spread: BudgetSpread; rule: BudgetRule; level: BudgetLevel; customGwh: number | null; intraday: boolean; inflation: number | null };
  labels: { spread: string; rule: string; level: string };
  /** Düşük / yüksek üretim yılında teknoloji başına seçilen yıl: "hidroda 2025, rüzgârda 2026 düzeyi" */
  levelDetail: { low: string; high: string };
  /** Reel TL'nin fiyat düzeyi ("Eylül 2026 TL'si") ve 1 reel TL'nin USD karşılığı */
  unit: { label: string; usdPerTl: number | null };
  months: BudgetResult["months"];
  total: BudgetResult["total"];
  /** Aynı benzetim nominal TL'de (aylık enflasyon yolu, inflationPath); enflasyon girilmediyse null */
  nominal: { annualInflationPct: number; months: BudgetResult["months"]; total: BudgetResult["total"]; averageFactor: number } | null;
  /** Gün içi düzeltmenin son yıldaki etkisi; bütçeye uygulandıysa options.intraday = true */
  intraday: IntradayEffect | null;
  /** Örnekleme blok uzunluğu (gün) */
  blockDays: number;
  /** Rapor için (alternatives): aynı ayarlarla düşük / yüksek üretim yılı ve kural senaryolarının yıllık dağılımı */
  alternatives: Record<"low" | "high" | "strict" | "r2025", BudgetResult["total"]> | null;
  /** Senaryoların yıllık üretimi (MWh) */
  production: Record<ProductionLevel, number>;
  /** Reel ortalama makas (TL/MWh): 2025, 2026 ve senaryonun hedefi */
  spread: { y2025: number | null; y2026: number | null; target: number | null };
  plantsUsed: number;
  plantsSkipped: string[];
  /** Örneklenen günlerin dönemi */
  sourceLabel: string;
  /** Önceki yılın günlerine uygulanan tahmin kalitesi çarpanı (son yıl / önceki yıl MWh başına maliyet, ortak aylar) */
  qualityScale: number;
  /** Geçmişle sınama özeti (scripts/budget-backtest.mts); dosya yoksa null */
  backtest: { asIs: { ratioMedian: number; monthsWithinP90Pct: number }; oracle: { ratioMedian: number; monthsWithinP90Pct: number }; projects: number } | null;
}

function loadBacktest(): ProjectBudget["backtest"] {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "epias", "budget-backtest-2026.json"), "utf8"));
    const pick = (k: string) => ({ ratioMedian: j.summary[k].ratioMedian, monthsWithinP90Pct: j.summary[k].monthsWithinP90Pct });
    return j.summary?.asIs && j.summary?.oracle ? { asIs: pick("asIs"), oracle: pick("oracle"), projects: j.summary.asIs.projects } : null;
  } catch {
    return null;
  }
}

/** Projenin gelecek yıl (son veri yılı + 1) dengesizlik + KÜPST bütçesi; reel TL */
export async function projectBudget(
  projectId: string,
  {
    spread = "y2026",
    rule = "r2026",
    level = "normal",
    customGwh = null,
    intraday = true,
    inflation = null,
    alternatives = false,
  }: {
    spread?: BudgetSpread;
    rule?: BudgetRule;
    level?: BudgetLevel;
    customGwh?: number | null;
    intraday?: boolean;
    inflation?: number | null;
    /** Rapor için: düşük / yüksek üretim yılı ve kural senaryolarının yıllık dağılımı da hesaplanır (veri bir kez yüklenir) */
    alternatives?: boolean;
  } = {}
): Promise<ProjectBudget | { error: string }> {
  const data = await loadProjectHourly(projectId);
  if (!data) return { error: "Proje bulunamadı." };
  const plants = data.plants.filter((p) => p.epiasPlantId !== null);
  if (!plants.length) return { error: "Projede EPİAŞ santrali yok: bütçe havuz verisiyle kurulur." };
  const [prevYear, lastYear] = [2025, 2026];
  // Son yılın verisi olan son ay (havuz)
  const m26 = await plantMonths(plants, lastYear, 12);
  const lastMonth = Math.max(0, ...m26.map((p) => p.mwh.reduce<number>((a, v, i) => (v !== null && v > 0 ? i + 1 : a), 0)));
  if (lastMonth === 0) return { error: `${lastYear} havuz verisi yok.` };
  const aggregator = !!data.aggregator;
  const loaded = await loadBudgetHours(plants, [prevYear, lastYear], { aggregator, untilMonth: lastMonth });
  if (!loaded.hours.length) return { error: "Bütçe için saatlik veri yok (havuz ve piyasa verisi eşleşmedi)." };

  const priceScale = converterFor("REAL").factor as (t: number) => number;
  const spreads = realSpreadByYear(loaded.hours, priceScale);
  const s25 = spreads[String(prevYear)] ?? null;
  const s26 = spreads[String(lastYear)] ?? null;
  const target = spread === "y2025" ? s25 : spread === "wide" ? (s26 ?? 0) * 1.2 : s26;

  // Üretim: iki yıl, yeni santraller tam yıla
  const rrPrev = runRateProduction(await plantMonths(plants, prevYear, 12), 12).perPlant;
  const rrLast = runRateProduction(m26.map((p) => ({ ...p, mwh: p.mwh.slice(0, lastMonth) })), lastMonth).perPlant;
  const latest = Object.fromEntries(Object.entries(rrLast).map(([k, v]) => [k, Array.from({ length: 12 }, (_, m) => (m < lastMonth ? v[m] : null))]));
  const { months: scen, choice } = productionScenarios(plants.map((p) => ({ key: p.plantId, type: p.plantType })), rrPrev, latest, { prev: prevYear, last: lastYear });
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const productionOf = (h: BudgetLevel) => {
    let monthly = h === "custom" ? scen.normal : scen[h];
    if (h === "custom" && customGwh !== null && customGwh > 0 && sum(scen.normal) > 0) monthly = scen.normal.map((v) => (v / sum(scen.normal)) * customGwh * 1000);
    return Object.fromEntries(monthly.map((v, m) => [String(m + 1).padStart(2, "0"), v]));
  };

  // Gün içi: son yılın ilk plan saatleri yüklü saatlerin içinde; son plan saatleri ve işlem maliyeti bir kez yüklenir
  const intraData = await loadIntradayData(plants, lastYear, lastMonth, aggregator, priceScale);
  const firstLast = loaded.hours.filter((h) => new Date(h.t).getUTCFullYear() === lastYear);
  const blockDays = 7;
  const series = macroSeries();
  const base = latestMonth(series.cpi);
  const months12 = (f: (mm: string) => number) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((mm) => [mm, f(mm)]));

  const compute = (r: BudgetRule, h: BudgetLevel, inflationPct: number | null) => {
    const scenario: BudgetScenario = { key: `${spread}-${r}-${h}`, label: "", rule: BUDGET_RULES[r].rule, targetSpreadReal: target };
    // Eski yılın günleri son yılın tahmin kalitesine taşınır (son yılın verisi olmayan aylar yalnız eski yıldan çekilir)
    const quality = yearQualityScale(loaded.hours, scenario, priceScale, prevYear, lastYear);
    const intra = intraData ? intradayRatio(firstLast, intraData, scenario, priceScale, lastYear) : null;
    const intraScale = intraday && intra ? intra.ratio : 1;
    const path = inflationPct !== null && base ? inflationPath(inflationPct, base, lastYear + 1) : null;
    const result = imbalanceBudget(loaded.hours, scenario, {
      year: lastYear + 1,
      priceScale,
      production: productionOf(h),
      seed: 1,
      yearCostScale: { [prevYear]: quality },
      blockDays,
      monthScale: months12((mm) => intraScale * (path?.[mm] ?? 1)),
    });
    return { result, quality, intra, path };
  };

  const main = compute(rule, level, null);
  let nominal: ProjectBudget["nominal"] = null;
  if (inflation !== null && Number.isFinite(inflation) && base) {
    const n = compute(rule, level, inflation);
    nominal = { annualInflationPct: inflation, months: n.result.months, total: n.result.total, averageFactor: Object.values(n.path!).reduce((a, b) => a + b, 0) / 12 };
  }
  const alt = alternatives
    ? {
        low: compute(rule, "low", null).result.total,
        high: compute(rule, "high", null).result.total,
        strict: rule === "strict" ? main.result.total : compute("strict", level, null).result.total,
        r2025: rule === "r2025" ? main.result.total : compute("r2025", level, null).result.total,
      }
    : null;
  const usd = base ? series.usdTry[base] ?? series.usdTry[latestMonth(series.usdTry) ?? ""] : null;
  return {
    project: data.project,
    year: lastYear + 1,
    options: { spread, rule, level, customGwh: level === "custom" ? customGwh : null, intraday: intraday && !!main.intra, inflation },
    labels: { spread: BUDGET_SPREADS[spread], rule: BUDGET_RULES[rule].label, level: BUDGET_LEVELS[level] },
    levelDetail: { low: levelDetail(choice, "low"), high: levelDetail(choice, "high") },
    unit: { label: base ? `${monthLabelTr(base)} TL'si` : "reel TL", usdPerTl: usd ? 1 / usd : null },
    months: main.result.months,
    total: main.result.total,
    nominal,
    intraday: main.intra,
    blockDays,
    alternatives: alt,
    production: { low: sum(scen.low), normal: sum(scen.normal), high: sum(scen.high) },
    spread: { y2025: s25, y2026: s26, target },
    plantsUsed: loaded.plantsUsed,
    plantsSkipped: loaded.plantsSkipped,
    sourceLabel: `${prevYear} Ocak – ${monthLabelTr(`${lastYear}-${String(lastMonth).padStart(2, "0")}`)}`,
    qualityScale: main.quality,
    backtest: loadBacktest(),
  };
}

export interface IntradayEffect {
  /** (son plana göre dengesizlik + KÜPST + GİP işlem maliyeti) / ilk plana göre dengesizlik + KÜPST */
  ratio: number;
  firstCost: number;
  finalCost: number;
  tradeCost: number;
  /** Son planı olan santral-saat payı (%) */
  coveragePct: number;
}

interface IntradayData {
  final: BudgetHour[];
  tradeCost: number;
  coveragePct: number;
}

/**
 * Gün içi düzeltme verisi (17.7): son yılın son plana göre bütçe saatleri ve GİP işlem maliyeti (reel TL). İşlem maliyeti
 * saat başına Δ × (GİP − PTF), Δ = ilk KGÜP − son KGÜP (Aşama 11.2 ile aynı); GİP fiyatı olmayan saatte 0. Senaryodan
 * bağımsızdır, bir kez yüklenir.
 */
async function loadIntradayData(
  plants: ProjectHourly["plants"],
  year: number,
  untilMonth: number,
  aggregator: boolean,
  priceScale: (t: number) => number
): Promise<IntradayData | null> {
  const final = await loadBudgetHours(plants, [year], { aggregator, untilMonth, plan: "final" });
  if (!final.hours.length) return null;
  const gip = new Map(
    (
      await prisma.marketData.findMany({
        where: { timestamp: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year, untilMonth, 1)) }, gipPrice: { not: null } },
        select: { timestamp: true, ptf: true, gipPrice: true },
      })
    ).map((m) => [m.timestamp.getTime(), { ptf: m.ptf, gip: m.gipPrice! }])
  );
  let tradeCost = 0;
  let withFinal = 0;
  let all = 0;
  for (const p of plants) {
    const doc = p.epiasPlantId !== null ? await readPoolYearCached(p.epiasPlantId, year) : null;
    if (!doc) continue;
    const start = Date.parse(doc.start);
    for (let i = 0; i < doc.uevm.length; i++) {
      const t = start + i * HOUR;
      if (new Date(t).getUTCMonth() >= untilMonth) break;
      const a = doc.kgupFirst[i];
      const b = doc.kgupFinal[i];
      if (a === null || doc.uevm[i] === null) continue;
      all++;
      if (b === null) continue;
      withFinal++;
      const g = gip.get(t);
      if (g) tradeCost += (a - b) * (g.gip - g.ptf) * priceScale(t);
    }
  }
  return { final: final.hours, tradeCost, coveragePct: all > 0 ? (withFinal / all) * 100 : 0 };
}

/**
 * Gün içi düzeltmenin etkisi, senaryoyla (kural, makas ölçeği): (son plana göre maliyet + işlem maliyeti) / ilk plana
 * göre maliyet, son yılın saatlerinde. Bütçe bu oranla çarpılır: "gün içi düzeltme son yıldaki gibi sürer".
 */
function intradayRatio(first: BudgetHour[], d: IntradayData, scenario: BudgetScenario, priceScale: (t: number) => number, year: number): IntradayEffect | null {
  if (!first.length) return null;
  const spread = realSpreadByYear(first, priceScale)[String(year)];
  const scale = scenario.targetSpreadReal !== null && spread > 0 ? scenario.targetSpreadReal / spread : 1;
  const firstCost = first.reduce((a, h) => a + hourCost(h, scenario, scale, priceScale), 0);
  const finalCost = d.final.reduce((a, h) => a + hourCost(h, scenario, scale, priceScale), 0);
  return {
    ratio: firstCost > 0 ? (finalCost + d.tradeCost) / firstCost : 1,
    firstCost,
    finalCost,
    tradeCost: d.tradeCost,
    coveragePct: d.coveragePct,
  };
}
