/**
 * TR-Energy Analyst - Sektör karnesi (kıyaslama)
 *
 * EPİAŞ'ta üretimi yayımlanan lisanslı santrallerin aynı yıl için dengesizlik göstergeleri. Santraller tek başına
 * (santral bazında) karşılaştırılır: amaç tahmin kalitesini kıyaslamaktır; şirket içi netleşme şirketten şirkete
 * değiştiği için kıyaslamaya katılmaz. Göstergeler Dengesizlik Karnesi ile aynı motordan hesaplanır.
 *
 * SAF fonksiyonlar: I/O yok (veri toplama scripts/sector-collect.mts'de).
 */

import type { HourlyResult } from "@/lib/calculations/types";
import { kupstTotal } from "@/lib/calculations/kupst";
import { detectOutages } from "@/lib/analysis/outage-detection";
import { normalizePlantName } from "@/lib/epias-plant/plant-data";

/** Karnedeki teknolojiler; HES isteğe bağlı toplanır (eski karnelerde yoktur) */
export type SectorTech = "RES" | "GES" | "HES";
export const SECTOR_TECHS: SectorTech[] = ["RES", "GES", "HES"];

/** Hidro alt tipi (tahmini): barajlı (üretimini fiyata göre kaydırabilen) ya da nehir tipi (akışa bağlı) */
export type HydroKind = "RESERVOIR" | "RUN_OF_RIVER";

/** Hidro alt tipinin görünen adı */
export const HYDRO_KIND_LABEL: Record<HydroKind, string> = { RESERVOIR: "Barajlı", RUN_OF_RIVER: "Nehir tipi" };

export interface SectorPlantMetrics {
  epiasPlantId: number;
  name: string;
  type: SectorTech;
  organizationName: string | null;
  yekdem: boolean | null;
  hours: number;
  actualMwh: number;
  /** En yüksek saatlik üretim (kurulu güç yaklaşığı, MW) */
  peakMw: number;
  imbalanceCostTl: number;
  kupstTl: number;
  /** TL / MWh (gerçekleşen üretim başına) */
  unitImbalanceTl: number;
  unitKupstTl: number;
  /** Σ|gerçekleşen − plan| / Σ gerçekleşen (%) */
  deviationPct: number;
  /** Sapma MWh'inin sistemle aynı yöndeki payı (%) */
  sameDirectionPct: number;
  /** (Σ plan − Σ gerçekleşen) / Σ gerçekleşen (%) */
  biasPct: number;
  /** K1: olası arıza / kısıntı bloklarındaki saat sayısı (outage-detection kuralı, kurulu güç yerine en yüksek üretim) */
  outageHours?: number;
  /** K1: bu saatler hariç MWh başına dengesizlik (tahmin kalitesinin daha adil kıyası); eski karnelerde yok */
  unitImbalanceExOutageTl?: number;
  /** Yalnızca HES: tahmini alt tip (ad ve gün içi üretim esnekliğinden); belirlenemezse null */
  hydroKind?: HydroKind | null;
}

/** Gün içi esneklik eşiği: günlük (en yüksek − en düşük) / ortalama üretimin medyanı bunun üstündeyse barajlı sayılır */
export const HYDRO_FLEX_THRESHOLD = 0.6;

/**
 * Hidro santralin alt tipini tahmin eder. Adında "baraj" geçen barajlı, "regülatör" geçen nehir tipidir. Diğerlerinde
 * gün içi esneklik ölçülür: barajlı santral suyunu pahalı saatlere kaydırır, nehir tipi akışa bağlı düz üretir.
 * En az 30 günlük üretim yoksa null.
 */
export function classifyHydro(name: string, hourly: Array<{ timestamp: Date | string; actualMwh: number }>): HydroKind | null {
  const words = normalizePlantName(name).split(" ");
  if (words.some((w) => w.startsWith("baraj"))) return "RESERVOIR";
  if (words.some((w) => w === "reg" || w.startsWith("regulator"))) return "RUN_OF_RIVER";
  const days = new Map<string, number[]>();
  for (const h of hourly) {
    const d = new Date(h.timestamp).toISOString().slice(0, 10);
    const list = days.get(d);
    if (list) list.push(h.actualMwh);
    else days.set(d, [h.actualMwh]);
  }
  const ratios: number[] = [];
  for (const v of Array.from(days.values())) {
    if (v.length < 20) continue;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    if (mean <= 0) continue;
    ratios.push((Math.max(...v) - Math.min(...v)) / mean);
  }
  if (ratios.length < 30) return null;
  return quantile(ratios.sort((a, b) => a - b), 0.5) >= HYDRO_FLEX_THRESHOLD ? "RESERVOIR" : "RUN_OF_RIVER";
}

export function plantMetrics(
  meta: Pick<SectorPlantMetrics, "epiasPlantId" | "name" | "type" | "organizationName" | "yekdem">,
  hourly: HourlyResult[]
): SectorPlantMetrics {
  let actual = 0;
  let forecast = 0;
  let cost = 0;
  let absDev = 0;
  let sameDev = 0;
  let peak = 0;
  for (const h of hourly) {
    actual += h.actualMwh;
    forecast += h.forecastMwh;
    cost += h.imbalanceCost;
    const d = Math.abs(h.actualMwh - h.forecastMwh);
    absDev += d;
    if ((h.imbalanceMwh > 0 && h.systemDirection === "SURPLUS") || (h.imbalanceMwh < 0 && h.systemDirection === "DEFICIT")) sameDev += d;
    if (h.actualMwh > peak) peak = h.actualMwh;
  }
  const kupst = kupstTotal(hourly, meta.type);
  const per = (v: number) => (actual > 0 ? v / actual : 0);
  // K1: olası arıza / kısıntı blokları hariç (kurulu güç bilinmediği için en yüksek saatlik üretim)
  const outages = detectOutages(meta.name, hourly, 0);
  const inOutage = new Set<number>();
  for (const e of outages.events) for (let t = Date.parse(e.start); t <= Date.parse(e.end); t += 3_600_000) inOutage.add(t);
  let outageActual = 0;
  if (inOutage.size) for (const h of hourly) if (inOutage.has(new Date(h.timestamp).getTime())) outageActual += h.actualMwh;
  const exActual = actual - outageActual;
  return {
    ...meta,
    hours: hourly.length,
    actualMwh: actual,
    peakMw: peak,
    imbalanceCostTl: cost,
    kupstTl: kupst,
    unitImbalanceTl: per(cost),
    unitKupstTl: per(kupst),
    deviationPct: per(absDev) * 100,
    sameDirectionPct: absDev > 0 ? (sameDev / absDev) * 100 : 0,
    biasPct: per(forecast - actual) * 100,
    outageHours: outages.hours,
    unitImbalanceExOutageTl: exActual > 0 ? (cost - outages.costTl) / exActual : 0,
    ...(meta.type === "HES" ? { hydroKind: classifyHydro(meta.name, hourly) } : {}),
  };
}

export interface Distribution {
  count: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  /** Üretim ağırlıklı ortalama */
  weightedMean: number;
}

/** Doğrusal ara değerli yüzdelik (0–1) */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function distribution(values: number[], weights?: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const wSum = weights ? weights.reduce((a, b) => a + b, 0) : values.length;
  const wMean = weights
    ? values.reduce((a, v, i) => a + v * weights[i], 0) / (wSum || 1)
    : values.reduce((a, v) => a + v, 0) / (values.length || 1);
  return {
    count: values.length,
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    weightedMean: wMean,
  };
}

/** Değerin dağılımdaki yüzdelik sırası (0–100): daha düşük maliyet = daha iyi, yani düşük yüzdelik iyidir */
export function percentileRank(values: number[], v: number): number {
  if (values.length === 0) return 0;
  const below = values.filter((x) => x < v).length;
  const equal = values.filter((x) => x === v).length;
  return ((below + equal / 2) / values.length) * 100;
}

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** "2025" ya da yıl içi karnede "2026 (Ocak–Ağustos)" */
export function sectorPeriodLabel(b: Pick<SectorBenchmark, "year" | "period">): string {
  if (!b.period || b.period.end.endsWith("-12-31")) return String(b.year);
  const m = (d: string) => MONTHS_TR[Number(d.slice(5, 7)) - 1];
  return `${b.year} (${m(b.period.start)}–${m(b.period.end)})`;
}

export interface SectorBenchmark {
  year: number;
  /** Veri dönemi (yıl içi karnede ör. 2026-01-01 – 2026-08-31); eski dosyalarda yok: tam yıl */
  period?: { start: string; end: string };
  generatedAt: string;
  /** Kalite süzgecinden geçen santraller */
  plants: SectorPlantMetrics[];
  /** Kalite süzgecinde elenen santral sayısı (eksik veri, plan–gerçekleşen tutarsızlığı) */
  excluded: number;
  /** RES ve GES her zaman; HES yalnızca hidro toplandıysa */
  byType: Record<"RES" | "GES", TypeDistribution> & Partial<Record<"HES", TypeDistribution>>;
}

export interface TypeDistribution {
  unitImbalanceTl: Distribution;
  unitKupstTl: Distribution;
  deviationPct: Distribution;
  sameDirectionPct: Distribution;
  /** K1: arıza / kısıntı saatleri hariç (saatlik veriyle toplanan karnelerde) */
  unitImbalanceExOutageTl?: Distribution;
}

/**
 * Plan / gerçekleşen oranının kabul aralığı. Dar bir aralık (eskiden 0,75–1,33) gerçekten kötü tahmin eden santralleri de
 * eliyordu: elenenlerin medyan maliyeti kalanların iki katıydı ve sektör medyanı olduğundan düşük çıkıyordu. Aralık yalnızca
 * veri hatasını (plan hiç girilmemiş ya da santral eşleşmemiş: oran ~0 ya da çok büyük) eleyecek genişlikte.
 */
export const PLAN_RATIO_RANGE = { min: 0.5, max: 2 } as const;

/** Kıyaslamaya alınma şartı: yılın en az %90'ı veri, üretim var, yıllık plan/gerçekleşen oranı 0,5–2 */
export function passesQuality(m: SectorPlantMetrics, expectedHours: number): boolean {
  if (m.hours < expectedHours * 0.9 || m.actualMwh <= 0) return false;
  const planToActual = 1 + m.biasPct / 100;
  return planToActual >= PLAN_RATIO_RANGE.min && planToActual <= PLAN_RATIO_RANGE.max;
}

export function buildBenchmark(year: number, all: SectorPlantMetrics[], expectedHours: number): SectorBenchmark {
  const plants = all.filter((m) => passesQuality(m, expectedHours));
  const dist = (type: SectorTech): TypeDistribution => {
    const ps = plants.filter((p) => p.type === type);
    const w = ps.map((p) => p.actualMwh);
    const withK1 = ps.filter((p) => p.unitImbalanceExOutageTl !== undefined);
    return {
      unitImbalanceTl: distribution(ps.map((p) => p.unitImbalanceTl), w),
      unitKupstTl: distribution(ps.map((p) => p.unitKupstTl), w),
      deviationPct: distribution(ps.map((p) => p.deviationPct), w),
      sameDirectionPct: distribution(ps.map((p) => p.sameDirectionPct), w),
      ...(withK1.length === ps.length && ps.length
        ? { unitImbalanceExOutageTl: distribution(ps.map((p) => p.unitImbalanceExOutageTl!), w) }
        : {}),
    };
  };
  const hasHydro = plants.some((p) => p.type === "HES");
  return {
    year,
    generatedAt: new Date().toISOString(),
    plants,
    excluded: all.length - plants.length,
    byType: { RES: dist("RES"), GES: dist("GES"), ...(hasHydro ? { HES: dist("HES") } : {}) },
  };
}

export interface SectorCompanyRow {
  /** EPİAŞ şirket kimliği (dizinde yoksa null; o zaman adla gruplanır) */
  organizationId: number | null;
  name: string;
  type: SectorTech;
  plantCount: number;
  plantIds: number[];
  actualMwh: number;
  /** Santrallerin en yüksek saatlik üretimleri toplamı (kurulu güç yaklaşığı, MW) */
  peakMw: number;
  /** Üretim ağırlıklı MWh başına dengesizlik (santral bazında, şirket içi netleşme hariç) */
  unitImbalanceTl: number;
  unitKupstTl: number;
  /** Ağırlıklı değerin aynı teknolojideki santral dağılımında yüzdelik sırası (düşük = daha iyi) */
  rankPct: number;
}

/**
 * Kıyaslamadaki santralleri şirket × teknoloji olarak toplar. Değerler santral bazındadır (raporun sektör slaytındaki
 * "portföyünüz" rakamıyla aynı tanım); sıra, aynı teknolojideki santrallerin dağılımına göredir.
 */
export function companyRollup(
  plants: Array<SectorPlantMetrics & { organizationId?: number | null }>
): SectorCompanyRow[] {
  const values: Record<string, number[]> = {};
  for (const p of plants) (values[p.type] ??= []).push(p.unitImbalanceTl);
  const groups = new Map<string, SectorCompanyRow & { cost: number; kupst: number }>();
  for (const p of plants) {
    if (!p.organizationName && p.organizationId == null) continue;
    const key = `${p.organizationId ?? p.organizationName}|${p.type}`;
    const g = groups.get(key) ?? {
      organizationId: p.organizationId ?? null,
      name: p.organizationName ?? `Şirket ${p.organizationId}`,
      type: p.type,
      plantCount: 0,
      plantIds: [],
      actualMwh: 0,
      peakMw: 0,
      unitImbalanceTl: 0,
      unitKupstTl: 0,
      rankPct: 0,
      cost: 0,
      kupst: 0,
    };
    g.plantCount++;
    g.plantIds.push(p.epiasPlantId);
    g.actualMwh += p.actualMwh;
    g.peakMw += p.peakMw;
    g.cost += p.imbalanceCostTl;
    g.kupst += p.kupstTl;
    groups.set(key, g);
  }
  return Array.from(groups.values()).map(({ cost, kupst, ...g }) => {
    const unit = g.actualMwh > 0 ? cost / g.actualMwh : 0;
    return {
      ...g,
      unitImbalanceTl: unit,
      unitKupstTl: g.actualMwh > 0 ? kupst / g.actualMwh : 0,
      rankPct: percentileRank(values[g.type], unit),
    };
  });
}

export interface SectorTypeChange {
  /** İki dönemde de kıyaslamaya giren santral sayısı */
  plants: number;
  /** MWh başına dengesizliği artan santrallerin payı (%) */
  increasedPct: number;
  /** Santral bazında MWh başına dengesizlik değişiminin medyanı (%) */
  medianCostChangePct: number;
  /** Medyan sapma (Σ|gerçekleşen − plan| / Σ gerçekleşen, %) */
  medianDeviationPct: { prev: number; cur: number };
}

/**
 * Sektör karnesinin iki dönemi arasında aynı santrallerin değişimi ("sektörün hepsinde arttı, tahmin hatası sabit"
 * cümlesinin dayanağı). Santraller EPİAŞ kimliğiyle eşlenir; önceki dönemde maliyeti sıfır olanlar oran hesabına girmez.
 */
export function sectorYearChange(prev: SectorBenchmark, cur: SectorBenchmark): Partial<Record<SectorTech, SectorTypeChange>> {
  const before = new Map(prev.plants.map((p) => [p.epiasPlantId, p]));
  const out: Partial<Record<SectorTech, SectorTypeChange>> = {};
  for (const type of SECTOR_TECHS) {
    const pairs = cur.plants
      .filter((p) => p.type === type)
      .map((p) => [before.get(p.epiasPlantId), p] as const)
      .filter((x): x is readonly [SectorPlantMetrics, SectorPlantMetrics] => !!x[0] && x[0].type === type && x[0].unitImbalanceTl > 0);
    if (pairs.length === 0) continue;
    const med = (v: number[]) => quantile([...v].sort((a, b) => a - b), 0.5);
    out[type] = {
      plants: pairs.length,
      increasedPct: (pairs.filter(([a, b]) => b.unitImbalanceTl > a.unitImbalanceTl).length / pairs.length) * 100,
      medianCostChangePct: med(pairs.map(([a, b]) => (b.unitImbalanceTl / a.unitImbalanceTl - 1) * 100)),
      medianDeviationPct: { prev: med(pairs.map(([a]) => a.deviationPct)), cur: med(pairs.map(([, b]) => b.deviationPct)) },
    };
  }
  return out;
}
