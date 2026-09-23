/**
 * TR-Energy Analyst - Santral / Teknoloji Karşılaştırma ve Capture Price Analizi
 *
 * Her santral, teknoloji grubu (RES, HES, GES) ve portföy için aynı birim metrikleri üretir.
 * Tüm birim değerler toplamlardan (ağırlıklı) hesaplanır; alt dönem ortalamalarının ortalaması alınmaz.
 *
 * - Capture price: üretim ağırlıklı ortalama PTF = Σ(gerçekleşen × PTF) / Σ gerçekleşen
 * - Baz yük PTF: dönemdeki saatlerin düz ortalama PTF'si
 * - Capture rate: capture price / baz yük PTF. 1'in altı, santralin ucuz saatlerde ürettiğini gösterir.
 */

import { HourlyResult } from "@/lib/calculations/types";

export interface PlantComparisonInput {
  plantId: string;
  plantName: string;
  plantType: string;
  hourly: HourlyResult[];
}

export interface ComparisonRow {
  key: string;
  label: string;
  plantType: string | null;
  level: "plant" | "technology" | "portfolio";
  plantCount: number;
  hours: number;
  totalActualMwh: number;
  totalForecastMwh: number;
  /** (gerçekleşen - tahmin) / tahmin; pozitif = eksik tahmin (fazla üretim) */
  volumeDeviationRatio: number;
  capturePrice: number;
  captureRate: number;
  unitRevenue: number;
  unitImbalanceCost: number;
  totalImbalanceCost: number;
  /** Dengesizlik maliyeti / fiktif gelir */
  imbalanceCostShare: number;
}

export interface PlantComparisonResult {
  baseloadPtf: number;
  plants: ComparisonRow[];
  technologies: ComparisonRow[];
  portfolio: ComparisonRow | null;
}

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

function summarize(
  hourly: HourlyResult[],
  baseloadPtf: number,
  meta: Pick<ComparisonRow, "key" | "label" | "plantType" | "level" | "plantCount">
): ComparisonRow {
  let actual = 0;
  let forecast = 0;
  let ptfWeighted = 0;
  let revenue = 0;
  let fictive = 0;
  let imbalanceCost = 0;

  for (const h of hourly) {
    actual += h.actualMwh;
    forecast += h.forecastMwh;
    ptfWeighted += h.actualMwh * h.ptf;
    revenue += h.totalRevenue;
    fictive += h.fictiveRevenue;
    imbalanceCost += h.imbalanceCost;
  }

  const capturePrice = safeDiv(ptfWeighted, actual);

  return {
    ...meta,
    hours: hourly.length,
    totalActualMwh: actual,
    totalForecastMwh: forecast,
    volumeDeviationRatio: safeDiv(actual - forecast, forecast),
    capturePrice,
    captureRate: safeDiv(capturePrice, baseloadPtf),
    unitRevenue: safeDiv(revenue, actual),
    unitImbalanceCost: safeDiv(imbalanceCost, actual),
    totalImbalanceCost: imbalanceCost,
    imbalanceCostShare: safeDiv(imbalanceCost, fictive),
  };
}

/**
 * Santral, teknoloji ve portföy karşılaştırma satırlarını üretir.
 */
export function comparePlants(inputs: PlantComparisonInput[]): PlantComparisonResult {
  // Baz yük PTF: her saat bir kez sayılır (aynı saat birden fazla santralde tekrar eder)
  const ptfByHour = new Map<number, number>();
  for (const input of inputs) {
    for (const h of input.hourly) {
      ptfByHour.set(new Date(h.timestamp).getTime(), h.ptf);
    }
  }
  const baseloadPtf = safeDiv(
    Array.from(ptfByHour.values()).reduce((sum, p) => sum + p, 0),
    ptfByHour.size
  );

  const plants = inputs
    .filter((p) => p.hourly.length > 0)
    .map((p) =>
      summarize(p.hourly, baseloadPtf, {
        key: p.plantId,
        label: p.plantName,
        plantType: p.plantType,
        level: "plant",
        plantCount: 1,
      })
    );

  const types = Array.from(new Set(inputs.map((p) => p.plantType))).sort();
  const technologies = types
    .map((type) => {
      const members = inputs.filter((p) => p.plantType === type && p.hourly.length > 0);
      return summarize(
        members.flatMap((p) => p.hourly),
        baseloadPtf,
        { key: `type-${type}`, label: `${type} Toplamı`, plantType: type, level: "technology", plantCount: members.length }
      );
    })
    .filter((row) => row.hours > 0);

  const allHourly = inputs.flatMap((p) => p.hourly);
  const portfolio =
    allHourly.length > 0
      ? summarize(allHourly, baseloadPtf, {
          key: "portfolio",
          label: "Portföy",
          plantType: null,
          level: "portfolio",
          plantCount: plants.length,
        })
      : null;

  return { baseloadPtf, plants, technologies, portfolio };
}
