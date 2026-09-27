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

export interface SectorPlantMetrics {
  epiasPlantId: number;
  name: string;
  type: "RES" | "GES";
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
  byType: Record<"RES" | "GES", { unitImbalanceTl: Distribution; unitKupstTl: Distribution; deviationPct: Distribution; sameDirectionPct: Distribution }>;
}

/** Kıyaslamaya alınma şartı: yılın en az %90'ı veri, üretim var, yıllık plan/gerçekleşen oranı 0,75–1,33 */
export function passesQuality(m: SectorPlantMetrics, expectedHours: number): boolean {
  if (m.hours < expectedHours * 0.9 || m.actualMwh <= 0) return false;
  const planToActual = 1 + m.biasPct / 100;
  return planToActual >= 0.75 && planToActual <= 1.33;
}

export function buildBenchmark(year: number, all: SectorPlantMetrics[], expectedHours: number): SectorBenchmark {
  const plants = all.filter((m) => passesQuality(m, expectedHours));
  const dist = (type: "RES" | "GES") => {
    const ps = plants.filter((p) => p.type === type);
    const w = ps.map((p) => p.actualMwh);
    return {
      unitImbalanceTl: distribution(ps.map((p) => p.unitImbalanceTl), w),
      unitKupstTl: distribution(ps.map((p) => p.unitKupstTl), w),
      deviationPct: distribution(ps.map((p) => p.deviationPct), w),
      sameDirectionPct: distribution(ps.map((p) => p.sameDirectionPct), w),
    };
  };
  return {
    year,
    generatedAt: new Date().toISOString(),
    plants,
    excluded: all.length - plants.length,
    byType: { RES: dist("RES"), GES: dist("GES") },
  };
}

export interface SectorCompanyRow {
  /** EPİAŞ şirket kimliği (dizinde yoksa null; o zaman adla gruplanır) */
  organizationId: number | null;
  name: string;
  type: "RES" | "GES";
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
  const values = { RES: [] as number[], GES: [] as number[] };
  for (const p of plants) values[p.type].push(p.unitImbalanceTl);
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
