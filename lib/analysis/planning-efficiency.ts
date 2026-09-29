/**
 * TR-Energy Analyst — Planlama Verimliliği & "Ne Olurdu?" Simülasyon Motoru
 *
 * Tüm fonksiyonlar SAF (pure) olarak tasarlanmıştır:
 * - Dışsal yan etkisi yoktur (No side-effects, no I/O, no DB).
 * - Faz 2 hesaplama motorunu (processHourlyRecord) doğrudan yeniden kullanır.
 */

import {
  HourlyRecord,
  HourlyResult,
  ImbalancePricingProfile,
  MarketPriceRecord,
  SystemDirection,
  DEFAULT_IMBALANCE_PROFILE,
} from "@/lib/calculations/types";
import { processHourlyRecord, pricedMarket } from "@/lib/calculations/engine";

export interface PeriodEfficiency {
  period: string; // "YYYY-MM-DD" veya "YYYY-MM"
  dateStr?: string;
  totalActualMwh: number;
  totalForecastMwh: number;
  totalDayAheadSalesAmount: number;
  totalImbalanceAmount: number;
  totalRevenue: number;
  fictiveRevenue: number;
  lossTl: number; // fictiveRevenue - totalRevenue
  efficiencyRatio: number; // totalRevenue / fictiveRevenue
  hourCount: number;
  dominantSystemDirection?: SystemDirection;
  plantId?: string;
  plantName?: string;
}

export interface ForecastBiasResult {
  direction: "OVER_FORECAST" | "UNDER_FORECAST" | "NEUTRAL";
  avgBiasPercent: number; // Örn: %12.5 aşırı tahmin
  consistency: number; // 0.0 - 1.0 (Saatlerin yüzde kaçında bu yönde hata var)
  avgBiasMwh: number; // Saatlik ortalama net sapma (MWh)
  totalActualMwh: number;
  totalForecastMwh: number;
  explanation: string;
}

export interface PotentialUpliftResult {
  actualTotalRevenue: number;
  simulatedTotalRevenue: number;
  totalUpliftTl: number; // simulatedTotalRevenue - actualTotalRevenue
  upliftPercent: number; // (totalUpliftTl / actualTotalRevenue) * 100
  actualImbalanceCost: number;
  simulatedImbalanceCost: number;
  costReductionTl: number; // actualImbalanceCost - simulatedImbalanceCost
  costReductionPercent: number;
}

/**
 * 1. calculateEfficiencyRatio(totalRevenue, fictiveRevenue): number
 * → fictiveRevenue 0 ise 0 döndür, değilse totalRevenue / fictiveRevenue
 * (1.0 = hiç dengesizlik maliyeti yok, tahmin mükemmeldi; <1.0 = kayıp var)
 */
export function calculateEfficiencyRatio(
  totalRevenue: number,
  fictiveRevenue: number
): number {
  if (
    !fictiveRevenue ||
    fictiveRevenue <= 0 ||
    isNaN(fictiveRevenue) ||
    !isFinite(fictiveRevenue) ||
    !isFinite(totalRevenue)
  ) {
    return 0;
  }
  return totalRevenue / fictiveRevenue;
}

/**
 * 2. rankPeriodsByEfficiency(hourlyResults, granularity: 'day' | 'month'): PeriodEfficiency[]
 * → verilen granülaritede (gün veya ay) grupla, her grup için toplam fiili gelir,
 * toplam fiktif gelir, efficiency ratio ve TL bazında kayıp (fiktif - fiili) hesapla,
 * kayıp büyükten küçüğe sıralı döndür.
 */
export function rankPeriodsByEfficiency(
  hourlyResults: HourlyResult[],
  granularity: "day" | "month" = "day"
): PeriodEfficiency[] {
  if (!hourlyResults || hourlyResults.length === 0) {
    return [];
  }

  const groupMap = new Map<
    string,
    {
      period: string;
      totalActualMwh: number;
      totalForecastMwh: number;
      totalDayAheadSalesAmount: number;
      totalImbalanceAmount: number;
      totalRevenue: number;
      fictiveRevenue: number;
      hourCount: number;
      directionsCount: Record<SystemDirection, number>;
      plantId?: string;
      plantName?: string;
    }
  >();

  for (const item of hourlyResults) {
    const dateObj = new Date(item.timestamp);
    const dateIso = dateObj.toISOString();
    const period =
      granularity === "day"
        ? dateIso.substring(0, 10) // "YYYY-MM-DD"
        : dateIso.substring(0, 7); // "YYYY-MM"

    let group = groupMap.get(period);
    if (!group) {
      group = {
        period,
        totalActualMwh: 0,
        totalForecastMwh: 0,
        totalDayAheadSalesAmount: 0,
        totalImbalanceAmount: 0,
        totalRevenue: 0,
        fictiveRevenue: 0,
        hourCount: 0,
        directionsCount: { DEFICIT: 0, SURPLUS: 0, BALANCED: 0 },
        plantId: item.plantId,
        plantName: item.plantName,
      };
      groupMap.set(period, group);
    }

    group.totalActualMwh += item.actualMwh;
    group.totalForecastMwh += item.forecastMwh;
    group.totalDayAheadSalesAmount += item.dayAheadSalesAmount;
    group.totalImbalanceAmount += item.imbalanceAmount;
    group.totalRevenue += item.totalRevenue;
    group.fictiveRevenue += item.fictiveRevenue;
    group.hourCount += 1;

    if (item.systemDirection && group.directionsCount[item.systemDirection] !== undefined) {
      group.directionsCount[item.systemDirection] += 1;
    }
  }

  const results: PeriodEfficiency[] = Array.from(groupMap.values()).map((g) => {
    // Hakim sistem yönünü bul
    let dominantDir: SystemDirection = "BALANCED";
    let maxCount = -1;
    (Object.keys(g.directionsCount) as SystemDirection[]).forEach((dir) => {
      if (g.directionsCount[dir] > maxCount) {
        maxCount = g.directionsCount[dir];
        dominantDir = dir;
      }
    });

    const lossTl = g.fictiveRevenue - g.totalRevenue;
    const efficiencyRatio = calculateEfficiencyRatio(g.totalRevenue, g.fictiveRevenue);

    return {
      period: g.period,
      dateStr: g.period,
      totalActualMwh: Number(g.totalActualMwh.toFixed(2)),
      totalForecastMwh: Number(g.totalForecastMwh.toFixed(2)),
      totalDayAheadSalesAmount: Number(g.totalDayAheadSalesAmount.toFixed(2)),
      totalImbalanceAmount: Number(g.totalImbalanceAmount.toFixed(2)),
      totalRevenue: Number(g.totalRevenue.toFixed(2)),
      fictiveRevenue: Number(g.fictiveRevenue.toFixed(2)),
      lossTl: Number(lossTl.toFixed(2)),
      efficiencyRatio: Number(efficiencyRatio.toFixed(4)),
      hourCount: g.hourCount,
      dominantSystemDirection: dominantDir,
      plantId: g.plantId,
      plantName: g.plantName,
    };
  });

  // Kayıp büyükten küçüğe sırala (en verimsiz dönem en üstte)
  return results.sort((a, b) => b.lossTl - a.lossTl);
}

/**
 * 3. detectForecastBias(hourlyResults, plantId): ForecastBiasResult
 * → santralin sistematik olarak fazla mı yoksa az mı tahmin ettiğini tespit et
 * (tahmin - gerçekleşen ortalaması ve bunun ne kadar tutarlı/sürekli olduğu)
 */
export function detectForecastBias(
  hourlyResults: HourlyResult[],
  plantId?: string
): ForecastBiasResult {
  const filtered = plantId
    ? hourlyResults.filter((h) => h.plantId === plantId)
    : hourlyResults;

  if (!filtered || filtered.length === 0) {
    return {
      direction: "NEUTRAL",
      avgBiasPercent: 0,
      consistency: 0,
      avgBiasMwh: 0,
      totalActualMwh: 0,
      totalForecastMwh: 0,
      explanation: "İncelenecek saatlik veri bulunamadı.",
    };
  }

  let overCount = 0;
  let underCount = 0;
  let equalCount = 0;
  let totalForecast = 0;
  let totalActual = 0;

  for (const item of filtered) {
    totalForecast += item.forecastMwh;
    totalActual += item.actualMwh;

    const diff = item.forecastMwh - item.actualMwh;
    if (diff > 0.01) {
      overCount++;
    } else if (diff < -0.01) {
      underCount++;
    } else {
      equalCount++;
    }
  }

  const count = filtered.length;
  const netBiasMwh = Number(((totalForecast - totalActual) / count).toFixed(3));
  const avgBiasPercent =
    totalActual > 0
      ? Number((((totalForecast - totalActual) / totalActual) * 100).toFixed(2))
      : 0;

  const overRatio = overCount / count;
  const underRatio = underCount / count;

  let direction: "OVER_FORECAST" | "UNDER_FORECAST" | "NEUTRAL" = "NEUTRAL";
  let consistency = 0;
  let explanation = "";

  if (overRatio > 0.52 || avgBiasPercent > 2.0) {
    direction = "OVER_FORECAST";
    consistency = Number(overRatio.toFixed(3));
    explanation = `Santral saatlerin %${(consistency * 100).toFixed(0)}'inde gerçekleşenden daha yüksek tahmin üretmektedir (Ortalama %${Math.abs(avgBiasPercent)} aşırı tahmin).`;
  } else if (underRatio > 0.52 || avgBiasPercent < -2.0) {
    direction = "UNDER_FORECAST";
    consistency = Number(underRatio.toFixed(3));
    explanation = `Santral saatlerin %${(consistency * 100).toFixed(0)}'inde gerçekleşenden daha düşük tahmin üretmektedir (Ortalama %${Math.abs(avgBiasPercent)} eksik tahmin).`;
  } else {
    direction = "NEUTRAL";
    consistency = Number(Math.max(overRatio, underRatio).toFixed(3));
    explanation = "Tahmin hataları iki yönlü dengeli dağılmıştır; belirgin bir sistematik yanlılık tespit edilmedi.";
  }

  return {
    direction,
    avgBiasPercent,
    consistency,
    avgBiasMwh: netBiasMwh,
    totalActualMwh: Number(totalActual.toFixed(2)),
    totalForecastMwh: Number(totalForecast.toFixed(2)),
    explanation,
  };
}

/**
 * 4. simulateBiasCorrectedForecast(hourlyResults, biasResult, profile): HourlyResult[]
 * → detectForecastBias'ın bulduğu sistematik yanlılığı forecastMwh'den çıkararak "düzeltilmiş" bir tahmin serisi üret,
 * bu düzeltilmiş tahminle Faz 2'deki processHourlyRecord'u YENİDEN çalıştırıp alternatif (varsayımsal) bir HourlyResult seti döndür.
 * → Gerçek hesaplama motorunu (Faz 2) tekrar kullanır, formülleri asla tekrar yazmaz.
 */
export function simulateBiasCorrectedForecast(
  hourlyResults: HourlyResult[],
  biasResult: ForecastBiasResult,
  profile: ImbalancePricingProfile = DEFAULT_IMBALANCE_PROFILE
): HourlyResult[] {
  if (!hourlyResults || hourlyResults.length === 0) {
    return [];
  }

  // Eğer yanlılık nötr ise veya toplam tahmin sıfırsa aynen dön
  if (biasResult.direction === "NEUTRAL" || biasResult.totalForecastMwh <= 0) {
    return hourlyResults;
  }

  // Oransal ölçekleme çarpanı (örneğin aşırı tahmin %10 ise actual/forecast ≈ 0.909)
  // Bu yöntem gece GES saatlerini sıfır tutar, RES/HES profillerini fiziksel sınırda orantılı düzeltir
  const scaleRatio =
    biasResult.totalForecastMwh > 0
      ? biasResult.totalActualMwh / biasResult.totalForecastMwh
      : 1;

  return hourlyResults.map((item) => {
    // Yanlılığı giderilmiş yeni tahmin MWh
    const correctedForecast = Math.max(
      0,
      Number((item.forecastMwh * scaleRatio).toFixed(2))
    );

    const hourlyRecord: HourlyRecord = {
      timestamp: item.timestamp,
      actualMwh: item.actualMwh,
      forecastMwh: correctedForecast,
      plantId: item.plantId,
      plantName: item.plantName,
    };

    const marketPriceRecord: MarketPriceRecord = pricedMarket(item);

    // Faz 2 saf hesaplama motorunu yeniden çalıştır
    const simulated = processHourlyRecord(hourlyRecord, marketPriceRecord, profile);
    simulated.plantId = item.plantId;
    simulated.plantName = item.plantName;
    return simulated;
  });
}

/**
 * 5. calculatePotentialUplift(actualResults, simulatedResults): PotentialUpliftResult
 * → iki senaryonun toplam gelirini kıyaslayıp potansiyel iyileştirmeyi TL ve % olarak döndür.
 */
export function calculatePotentialUplift(
  actualResults: HourlyResult[],
  simulatedResults: HourlyResult[]
): PotentialUpliftResult {
  const actualTotalRevenue = actualResults.reduce(
    (sum, r) => sum + r.totalRevenue,
    0
  );
  const simulatedTotalRevenue = simulatedResults.reduce(
    (sum, r) => sum + r.totalRevenue,
    0
  );

  const actualImbalanceCost = actualResults.reduce(
    (sum, r) => sum + r.imbalanceCost,
    0
  );
  const simulatedImbalanceCost = simulatedResults.reduce(
    (sum, r) => sum + r.imbalanceCost,
    0
  );

  // Negatif sonuçlar kırpılmaz: yanlılık düzeltmesi bazı santrallerde maliyeti ARTIRABİLİR
  // (ör. hata saatlere göre değişiyorsa tek bir ölçek katsayısı bazı saatleri kötüleştirir).
  // Bunu 0 göstermek "düzeltme zararsız" izlenimi verirdi.
  const totalUpliftTl = Number((simulatedTotalRevenue - actualTotalRevenue).toFixed(2));

  const upliftPercent =
    actualTotalRevenue !== 0
      ? Number(((totalUpliftTl / Math.abs(actualTotalRevenue)) * 100).toFixed(2))
      : 0;

  const costReductionTl = Number((actualImbalanceCost - simulatedImbalanceCost).toFixed(2));
  const costReductionPercent =
    actualImbalanceCost > 0
      ? Number(((costReductionTl / actualImbalanceCost) * 100).toFixed(2))
      : 0;

  return {
    actualTotalRevenue: Number(actualTotalRevenue.toFixed(2)),
    simulatedTotalRevenue: Number(simulatedTotalRevenue.toFixed(2)),
    totalUpliftTl,
    upliftPercent,
    actualImbalanceCost: Number(actualImbalanceCost.toFixed(2)),
    simulatedImbalanceCost: Number(simulatedImbalanceCost.toFixed(2)),
    costReductionTl,
    costReductionPercent,
  };
}
