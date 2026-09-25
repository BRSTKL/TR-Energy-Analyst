/**
 * TR-Energy Analyst - Santral / şirket dengesizlik raporu (dışarıya gönderilecek kısa rapor) için veri
 *
 * Okuyucu, santrallerin sahibi olan şirketin yöneticisidir. Bu yüzden rakamlar iki sınıfa ayrılır:
 *   - KESİN HESAP: veriden doğrudan çıkan tutarlar (geçmiş maliyet, 2026 katsayılarıyla aynı üretimin maliyeti)
 *   - SENARYO: bir davranış varsayımına dayanan tutarlar (DSG'de netleşme, gün içi pozisyon güncelleme)
 * Sunum katmanı (lib/export/plant-report-pptx.ts) bu ayrımı her slaytta etiketler.
 *
 * Uzlaştırma şirket bazındadır: her piyasa katılımcısı kendi dengesinden sorumludur, aynı şirketin santralleri her
 * saat zaten birlikte netleşir. Bu yüzden taban maliyet santraller şirketlerine göre gruplanıp saatlik net
 * dengesizlik üzerinden hesaplanır; DSG senaryosu yalnızca farklı şirketler arasındaki netleşmeyi sayar.
 * Sahibi bilinmeyen santral kendi başına bir şirket sayılır.
 */

import { processHourlyRecord } from "@/lib/calculations/engine";
import { aggregateMonthly } from "@/lib/calculations/aggregate";
import { HourlyResult, ImbalancePricingProfile, REGULATORY_IMBALANCE_REGIMES } from "@/lib/calculations/types";
import { combineBacktests, persistenceStrategy, runBacktest } from "@/lib/analysis/backtest";
import { KUPST_REGIMES, kupstTotal } from "@/lib/calculations/kupst";
import type { ProjectHourly } from "@/lib/services/project-hourly";

export interface ReportPlantRow {
  name: string;
  type: string;
  capacityMw: number;
  organizationName: string | null;
  /** Veri döneminde YEKDEM'de (null: bilinmiyor) */
  yekdem: boolean | null;
  /** Sonraki yıl YEKDEM'de (null: bilinmiyor) */
  yekdemNextYear: boolean | null;
  actualMwh: number;
  revenueTl: number;
  /** Santral tek başına uzlaştırılsaydı dengesizlik maliyeti */
  imbalanceCostTl: number;
  /** Tahmini KÜPST (sapma bedeli, santral bazında; netleşmez) */
  kupstTl: number;
  /** TL / MWh (gerçekleşen üretim başına) */
  unitCostTl: number;
  /** Dengesizlik maliyetinin gelire oranı (%); YEKDEM santralinde gelir PTF'den oluşmadığı için null */
  costShareOfRevenuePct: number | null;
  /** Σ|gerçekleşen − plan| / Σ gerçekleşen (%) */
  deviationPct: number;
  /** Sistematik sapma: (Σ plan − Σ gerçekleşen) / Σ gerçekleşen (%); pozitif = plan fazla (eksik üretim) */
  biasPct: number;
  /** Sapma MWh'inin sistemle aynı yönde olan payı (%): sistem fazlasındayken fazla, açığındayken eksik üretim */
  sameDirectionPct: number;
}

export interface ReportMonth {
  month: string; // "YYYY-MM"
  actualMwh: number;
  imbalanceCostTl: number;
  unitCostTl: number;
}

export interface ReportCompany {
  name: string | null;
  plantNames: string[];
}

/** Rapor dışından gelen bağlam (EPİAŞ şirket dizini); saf hesaplama ağ bağlantısı gerektirmesin diye ayrı verilir */
export interface ReportContext {
  /** Şirketin EPİAŞ'ta kayıtlı ama projede olmayan santralleri: organizationId → santral adları */
  missingCompanyPlants?: Map<number, string[]>;
  /** Şirketin EPİAŞ'ta kayıtlı toplam santral sayısı: organizationId → sayı */
  companyPlantTotals?: Map<number, number>;
}

export interface PlantReportData {
  projectName: string;
  period: { start: string; end: string; months: number; hours: number };
  plants: ReportPlantRow[];
  /**
   * Portföy toplamı, şirket bazında uzlaştırmayla (aynı şirketin santralleri netleşmiş). imbalanceCostTl ana rakamdır.
   * costShareOfRevenuePct: portföyde YEKDEM santrali varsa null.
   */
  totals: Omit<ReportPlantRow, "name" | "type" | "organizationName" | "yekdem" | "yekdemNextYear" | "biasPct" | "sameDirectionPct"> & { plantCount: number };
  /**
   * Tahmini KÜPST (tüm santraller; YEKDEM santralleri dahil şirkete aittir). next2026Tl: aynı saatlik veri, en güncel
   * oran tablosuyla (2026: rüzgâr %15, güneş %8); veri zaten 2026+ ise null.
   */
  kupst: { totalTl: number; next2026Tl: number | null };
  settlement: {
    /** Santraller tek tek uzlaştırılsaydı */
    plantLevelCostTl: number;
    /** Şirket bazında (gerçek uzlaştırmaya en yakın) */
    companyLevelCostTl: number;
    /** Aynı şirketin santralleri arasında zaten gerçekleşen netleşme */
    sameCompanyNettingTl: number;
    companies: ReportCompany[];
    /** Sahibi bilinmeyen santral sayısı (her biri ayrı şirket sayıldı) */
    unknownOwnerCount: number;
  };
  /** Veri döneminde YEKDEM'de olan santraller (yoksa null) */
  yekdem: { plantNames: string[] } | null;
  /**
   * Portföyde YEKDEM santrali varsa riskin kime yansıdığına göre ayrımı. YEKDEM'deki santrallerin dengesizliği şirkete
   * değil YEKDEM portföyüne yansıyor olabilir (doğrulanmalı); bu yüzden "doğrudan" kapsam YEKDEM dışı santrallerdir.
   * Tüm tutarlar şirket bazında netleşmiş. 2026 alanları yalnızca veri 2026 öncesiyse doludur.
   */
  exposure: {
    /** YEKDEM dışı santrallerin riski: şirkete doğrudan yansır */
    directCostTl: number;
    directPlants: string[];
    /** YEKDEM santrallerinin kendi aralarında netleşmiş riski */
    yekdemCostTl: number;
    /** Tüm santraller birlikte netleşseydi (totals.imbalanceCostTl ile aynı) */
    allCostTl: number;
    /** Sonraki yıl YEKDEM'den çıkan / devam eden / durumu bilinmeyen santraller */
    exitingPlants: string[];
    stayingPlants: string[];
    unknownExitPlants: string[];
    /** YEKDEM dışı santraller 2026 katsayılarıyla */
    direct2026Tl: number | null;
    /** 2026'da şirkete yansıyacak risk: YEKDEM dışı + YEKDEM'den çıkan santraller, 2026 katsayılarıyla */
    exposure2026Tl: number | null;
    /** Tahmini KÜPST aynı kapsamlarla (2026: en güncel oranlarla) */
    kupstDirectTl: number;
    kupstYekdemTl: number;
    kupstExposure2026Tl: number | null;
  } | null;
  /** Şirketin EPİAŞ'taki santrallerinden projede olmayanlar (bilgi yoksa boş) */
  coverage: Array<{ company: string; inProject: number; total: number; missing: string[] }>;
  /**
   * Şirket bazında net sapmanın sistemle aynı yöndeki payı. 2026'dan itibaren %6'lık katsayı yalnızca bu sapmalara
   * uygulanır; maliyetin de büyük kısmı bu saatlerde oluşur.
   */
  alignment: { sameDirectionMwhPct: number; sameDirectionCostPct: number };
  /** Şirket bazında aylık maliyet */
  monthly: ReportMonth[];
  /**
   * Şirket bazında maliyetin ay × günün saati dağılımı (ısı haritası). cells[i][h]: monthly[i] ayında h saatinin
   * (0-23, Türkiye saati) toplam maliyeti. hourTotals: tüm dönemde saat başına toplam.
   */
  heatmap: { cells: number[][]; hourTotals: number[] };
  /** KESİN HESAP: aynı saatlik veri 2026 katsayılarıyla fiyatlansaydı (şirket bazında). Veri zaten tamamen 2026+ ise null. */
  coefficients2026: { baseCostTl: number; cost2026Tl: number; deltaTl: number; deltaPct: number } | null;
  /** SENARYO: farklı şirketlerdeki santraller tek dengeden sorumlu grupta netleşseydi (en az 2 şirket) */
  dsg: {
    companyLevelCostTl: number;
    nettedCostTl: number;
    benefitTl: number;
    benefitPct: number;
    /** Farklı şirketlerden en az birinin fazla, birinin eksik olduğu saatlerin oranı (%) */
    offsettingHourSharePct: number;
  } | null;
  /**
   * SENARYO: 1 saat önce görülen hatanın bir kısmı GİP'te kapatılsaydı (santral bazında, önceki aylardan öğrenerek
   * test). savingTl, test edilen oranın şirket bazındaki maliyete uygulanmasıyla bulunan yaklaşık tutardır.
   */
  intraday: { savingTl: number; savingPct: number; testMonths: number; firstTestMonth: string; lastTestMonth: string } | null;
}

const COEF_2026 = REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].coefficients;
const REGIME_2026_START = Date.parse(`${REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].from}T00:00:00Z`);

const pct = (a: number, b: number) => (b === 0 ? 0 : (a / b) * 100);
const iso = (t: Date | string | number) => new Date(t).toISOString().slice(0, 10);

/**
 * Bir grubun (şirketin) santrallerini saat saat toplayıp net dengesizlik üzerinden fiyatlar: her saat için tek bir
 * sonuç. Plan ve gerçekleşen toplandığından gelir, üretim ve maliyet grup düzeyindedir.
 */
function settleGroup(plants: HourlyResult[][], profile: ImbalancePricingProfile): HourlyResult[] {
  const buckets = new Map<number, { sample: HourlyResult; forecastMwh: number; actualMwh: number }>();
  for (const hourly of plants) {
    for (const h of hourly) {
      const t = new Date(h.timestamp).getTime();
      const b = buckets.get(t) ?? { sample: h, forecastMwh: 0, actualMwh: 0 };
      b.forecastMwh += h.forecastMwh;
      b.actualMwh += h.actualMwh;
      buckets.set(t, b);
    }
  }
  return Array.from(buckets.values()).map((b) =>
    processHourlyRecord(
      { timestamp: b.sample.timestamp, actualMwh: b.actualMwh, forecastMwh: b.forecastMwh },
      { timestamp: b.sample.timestamp, ptf: b.sample.ptf, smf: b.sample.smf, systemDirection: b.sample.systemDirection },
      profile
    )
  );
}

const sumCost = (hours: HourlyResult[]) => hours.reduce((s, h) => s + h.imbalanceCost, 0);

/**
 * Santralleri şirketlerine göre gruplayıp her şirketi saatlik net dengesizlik üzerinden fiyatlar (şirket bazında
 * uzlaştırma). Sonuç: şirket × saat başına bir satır. Sonuç sayfası da portföy toplamlarını bununla hesaplar.
 */
export function settleByCompany(
  plants: Array<Pick<ProjectHourly["plants"][number], "plantId" | "organizationId" | "hourly">>,
  profile: ImbalancePricingProfile
): HourlyResult[] {
  const byOrg = new Map<string, HourlyResult[][]>();
  for (const p of plants) {
    if (p.hourly.length === 0) continue;
    const key = p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`;
    byOrg.set(key, [...(byOrg.get(key) ?? []), p.hourly]);
  }
  return Array.from(byOrg.values()).flatMap((group) => settleGroup(group, profile));
}

/** Sapma sistemle aynı yönde mi: sistem fazlasındayken fazla üretim ya da sistem açığındayken eksik üretim */
const sameDirection = (h: HourlyResult) =>
  (h.imbalanceMwh > 0 && h.systemDirection === "SURPLUS") || (h.imbalanceMwh < 0 && h.systemDirection === "DEFICIT");

type Plant = ProjectHourly["plants"][number];

function plantRow(p: Plant): ReportPlantRow {
  let actual = 0;
  let forecast = 0;
  let revenue = 0;
  let cost = 0;
  let absDev = 0;
  let sameDev = 0;
  for (const h of p.hourly) {
    actual += h.actualMwh;
    forecast += h.forecastMwh;
    revenue += h.totalRevenue;
    cost += h.imbalanceCost;
    absDev += Math.abs(h.actualMwh - h.forecastMwh);
    if (sameDirection(h)) sameDev += Math.abs(h.imbalanceMwh);
  }
  return {
    name: p.plantName,
    type: p.plantType,
    capacityMw: p.capacityMw,
    organizationName: p.organizationName,
    yekdem: p.yekdem,
    yekdemNextYear: p.yekdemNextYear,
    actualMwh: actual,
    revenueTl: revenue,
    imbalanceCostTl: cost,
    kupstTl: kupstTotal(p.hourly, p.plantType),
    unitCostTl: actual > 0 ? cost / actual : 0,
    costShareOfRevenuePct: p.yekdem ? null : pct(cost, revenue),
    deviationPct: pct(absDev, actual),
    biasPct: pct(forecast - actual, actual),
    sameDirectionPct: pct(sameDev, absDev),
  };
}

/**
 * @param options.intraday false ise gün içi geriye dönük test atlanır (sonuç sayfası gibi hızlı yanıt gereken yerler)
 */
export function buildPlantReport(
  data: ProjectHourly,
  context: ReportContext = {},
  options: { intraday?: boolean } = {}
): PlantReportData {
  const withData = data.plants.filter((p) => p.hourly.length > 0);
  const all = withData.flatMap((p) => p.hourly);
  if (all.length === 0) throw new Error("Projede piyasa fiyatı eşleşmiş saatlik veri yok; rapor üretilemez.");

  // Çok santralli projede yüz binlerce saat olabilir: Math.min(...dizi) yerine döngü
  let start = Infinity;
  let end = -Infinity;
  const hourSet = new Set<number>();
  for (const h of all) {
    const t = new Date(h.timestamp).getTime();
    hourSet.add(t);
    if (t < start) start = t;
    if (t > end) end = t;
  }

  const plants = withData.map(plantRow).sort((a, b) => b.imbalanceCostTl - a.imbalanceCostTl);

  // Şirketlere göre gruplama (sahibi bilinmeyen santral kendi grubudur)
  const groups = new Map<string, { name: string | null; plants: typeof withData }>();
  for (const p of withData) {
    const key = p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`;
    const g = groups.get(key) ?? { name: p.organizationName, plants: [] };
    g.plants.push(p);
    groups.set(key, g);
  }
  const groupList = Array.from(groups.values());
  const settle = (profile: ImbalancePricingProfile) => settleByCompany(withData, profile);
  /** Verilen santralleri şirketlerine göre netleştirip fiyatlar */
  const settleSubset = (subset: Plant[], profile: ImbalancePricingProfile) => sumCost(settleByCompany(subset, profile));
  const profile2026: ImbalancePricingProfile = { mode: "CUSTOM", ...COEF_2026 };

  const companyHours = settle(data.profile);
  const companyCost = sumCost(companyHours);
  const plantLevelCost = sumCost(all);

  let actual = 0;
  let revenue = 0;
  let absDev = 0;
  for (const h of all) absDev += Math.abs(h.actualMwh - h.forecastMwh);
  for (const h of companyHours) {
    actual += h.actualMwh;
    revenue += h.totalRevenue;
  }
  const hasYekdem = withData.some((p) => p.yekdem);

  const monthly = aggregateMonthly(companyHours).map((m) => ({
    month: m.yearMonth,
    actualMwh: m.totalActualMwh,
    imbalanceCostTl: m.totalImbalanceCost,
    unitCostTl: m.unitImbalanceCost,
  }));

  let netAbs = 0;
  let netSame = 0;
  let sameCost = 0;
  for (const h of companyHours) {
    netAbs += Math.abs(h.imbalanceMwh);
    if (sameDirection(h)) {
      netSame += Math.abs(h.imbalanceMwh);
      sameCost += h.imbalanceCost;
    }
  }

  const monthIndex = new Map(monthly.map((m, i) => [m.month, i]));
  const cells = monthly.map(() => new Array<number>(24).fill(0));
  const hourTotals = new Array<number>(24).fill(0);
  for (const h of companyHours) {
    const d = new Date(h.timestamp);
    const i = monthIndex.get(d.toISOString().slice(0, 7));
    const hr = d.getUTCHours(); // zaman damgası UTC alanında Türkiye duvar saati
    if (i === undefined) continue;
    cells[i][hr] += h.imbalanceCost;
    hourTotals[hr] += h.imbalanceCost;
  }

  // 2026 katsayıları: yalnızca 2026 öncesi saat varsa anlamlı (aksi halde maliyet zaten bu kurallarla)
  let coefficients2026: PlantReportData["coefficients2026"] = null;
  if (start < REGIME_2026_START) {
    const cost2026 = sumCost(settle(profile2026));
    coefficients2026 = {
      baseCostTl: companyCost,
      cost2026Tl: cost2026,
      deltaTl: cost2026 - companyCost,
      deltaPct: pct(cost2026 - companyCost, companyCost),
    };
  }

  // DSG: farklı şirketler tek grupta. Aynı şirket içi netleşme zaten tabanda olduğundan fayda yalnızca şirketler arası
  let dsg: PlantReportData["dsg"] = null;
  if (groupList.length >= 2) {
    const nettedCost = sumCost(settleGroup(withData.map((p) => p.hourly), data.profile));
    // Şirketlerin saatlik net sapmaları ters yönde mi
    const groupDeltas = groupList.map((g) => {
      const m = new Map<number, number>();
      for (const p of g.plants) for (const h of p.hourly) {
        const t = new Date(h.timestamp).getTime();
        m.set(t, (m.get(t) ?? 0) + h.actualMwh - h.forecastMwh);
      }
      return m;
    });
    let offsetting = 0;
    for (const t of hourSet) {
      const ds = groupDeltas.map((m) => m.get(t) ?? 0);
      if (ds.some((d) => d > 0) && ds.some((d) => d < 0)) offsetting++;
    }
    dsg = {
      companyLevelCostTl: companyCost,
      nettedCostTl: nettedCost,
      benefitTl: companyCost - nettedCost,
      benefitPct: pct(companyCost - nettedCost, companyCost),
      offsettingHourSharePct: pct(offsetting, hourSet.size),
    };
  }

  // Gün içi: önceki 4 aydan öğrenilen oranla, 1 saat önce görülen hatanın kapatılması (santral bazında test)
  let intraday: PlantReportData["intraday"] = null;
  const backtests =
    options.intraday === false ? [] : withData.map((p) => runBacktest(p.hourly, data.profile, { strategies: [persistenceStrategy(1)] }));
  const combined = combineBacktests(backtests.filter((b) => b.testMonths.length > 0));
  const s = combined?.strategies[0];
  if (combined && s && combined.testMonths.length > 0) {
    intraday = {
      savingTl: (s.outOfSampleSavingPercent / 100) * companyCost,
      savingPct: s.outOfSampleSavingPercent,
      testMonths: combined.testMonths.length,
      firstTestMonth: combined.testMonths[0],
      lastTestMonth: combined.testMonths[combined.testMonths.length - 1],
    };
  }

  // KÜPST: santral bazında; 2026 projeksiyonu en güncel yürürlükteki oranlarla
  const latestKupst = KUPST_REGIMES[KUPST_REGIMES.length - 1];
  const kupstOf = (ps: Plant[]) => ps.reduce((sum, p) => sum + kupstTotal(p.hourly, p.plantType), 0);
  const kupstNextOf = (ps: Plant[]) => ps.reduce((sum, p) => sum + kupstTotal(p.hourly, p.plantType, latestKupst), 0);
  const pre2026 = start < REGIME_2026_START;
  const kupst = { totalTl: kupstOf(withData), next2026Tl: pre2026 ? kupstNextOf(withData) : null };

  let exposure: PlantReportData["exposure"] = null;
  if (hasYekdem) {
    const direct = withData.filter((p) => !p.yekdem);
    const yek = withData.filter((p) => p.yekdem);
    const exiting = yek.filter((p) => p.yekdemNextYear === false);
    exposure = {
      directCostTl: settleSubset(direct, data.profile),
      directPlants: direct.map((p) => p.plantName),
      yekdemCostTl: settleSubset(yek, data.profile),
      allCostTl: companyCost,
      exitingPlants: exiting.map((p) => p.plantName),
      stayingPlants: yek.filter((p) => p.yekdemNextYear === true).map((p) => p.plantName),
      unknownExitPlants: yek.filter((p) => p.yekdemNextYear === null).map((p) => p.plantName),
      direct2026Tl: pre2026 ? settleSubset(direct, profile2026) : null,
      exposure2026Tl: pre2026 ? settleSubset([...direct, ...exiting], profile2026) : null,
      kupstDirectTl: kupstOf(direct),
      kupstYekdemTl: kupstOf(yek),
      kupstExposure2026Tl: pre2026 ? kupstNextOf([...direct, ...exiting]) : null,
    };
  }

  const coverage: PlantReportData["coverage"] = [];
  for (const g of groupList) {
    const orgId = g.plants[0].organizationId;
    if (orgId === null) continue;
    const missing = context.missingCompanyPlants?.get(orgId) ?? [];
    const total = context.companyPlantTotals?.get(orgId);
    if (total === undefined) continue;
    coverage.push({ company: g.name ?? "", inProject: g.plants.length, total, missing });
  }

  return {
    projectName: data.project.name,
    period: { start: iso(start), end: iso(end), months: monthly.length, hours: hourSet.size },
    plants,
    totals: {
      capacityMw: withData.reduce((sum, p) => sum + p.capacityMw, 0),
      actualMwh: actual,
      revenueTl: revenue,
      imbalanceCostTl: companyCost,
      kupstTl: kupst.totalTl,
      unitCostTl: actual > 0 ? companyCost / actual : 0,
      costShareOfRevenuePct: hasYekdem ? null : pct(companyCost, revenue),
      deviationPct: pct(absDev, actual),
      plantCount: withData.length,
    },
    settlement: {
      plantLevelCostTl: plantLevelCost,
      companyLevelCostTl: companyCost,
      sameCompanyNettingTl: plantLevelCost - companyCost,
      companies: groupList.map((g) => ({ name: g.name, plantNames: g.plants.map((p) => p.plantName) })),
      unknownOwnerCount: withData.filter((p) => p.organizationId === null).length,
    },
    yekdem: hasYekdem ? { plantNames: withData.filter((p) => p.yekdem).map((p) => p.plantName) } : null,
    exposure,
    coverage,
    kupst,
    alignment: { sameDirectionMwhPct: pct(netSame, netAbs), sameDirectionCostPct: pct(sameCost, companyCost) },
    monthly,
    heatmap: { cells, hourTotals },
    coefficients2026,
    dsg,
    intraday,
  };
}
