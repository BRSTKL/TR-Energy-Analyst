/**
 * TR-Energy Analyst Aylık ve Yıllık Agregasyon Motoru
 *
 * SAF (pure) fonksiyonlar:
 * - Dışsal yan etkisi yoktur.
 * - Yıllık birim metrikler kesinlikle aylık birim değerlerin basit ortalaması DEĞİLDİR;
 *   toplam gelir / toplam üretim ağırlıklı ortalama formülüyle hesaplanır.
 */

import { HourlyResult, MonthlyAggregate, YearlyAggregate } from "./types";

/**
 * Saatlik sonuçları santral ve ay bazında toplar.
 *
 * @param hourlyResults Saatlik hesaplama sonuçları dizisi
 * @returns Ay bazında özet metrikler (MonthlyAggregate[])
 */
export function aggregateMonthly(hourlyResults: HourlyResult[]): MonthlyAggregate[] {
  if (hourlyResults.length === 0) {
    return [];
  }

  // Gruplama anahtarı: (plantId varsa plantId + "__" + YYYY-MM, yoksa YYYY-MM)
  const groupMap = new Map<
    string,
    {
      plantId?: string;
      plantName?: string;
      year: number;
      month: number;
      yearMonth: string;
      totalDayAheadSalesAmount: number;
      totalImbalanceAmount: number;
      totalRevenue: number;
      totalActualMwh: number;
      totalImbalanceCost: number;
    }
  >();

  for (const item of hourlyResults) {
    const dateObj = new Date(item.timestamp);
    // Zaman damgaları UTC alanında duvar saatidir: ay/yıl UTC okunur (yerel saat dilimi ayın son saatlerini kaydırır)
    const year = dateObj.getUTCFullYear();
    const month = dateObj.getUTCMonth() + 1; // 1-12
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const yearMonth = `${year}-${monthStr}`;

    const groupKey = item.plantId ? `${item.plantId}__${yearMonth}` : yearMonth;

    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        plantId: item.plantId,
        plantName: item.plantName,
        year,
        month,
        yearMonth,
        totalDayAheadSalesAmount: 0,
        totalImbalanceAmount: 0,
        totalRevenue: 0,
        totalActualMwh: 0,
        totalImbalanceCost: 0,
      };
      groupMap.set(groupKey, group);
    }

    group.totalDayAheadSalesAmount += item.dayAheadSalesAmount;
    group.totalImbalanceAmount += item.imbalanceAmount;
    group.totalRevenue += item.totalRevenue;
    group.totalActualMwh += item.actualMwh;
    group.totalImbalanceCost += item.imbalanceCost;
  }

  const results: MonthlyAggregate[] = [];

  for (const group of Array.from(groupMap.values())) {
    const unitRevenue =
      group.totalActualMwh === 0 ? 0 : group.totalRevenue / group.totalActualMwh;

    const unitImbalanceCost =
      group.totalActualMwh === 0 ? 0 : group.totalImbalanceCost / group.totalActualMwh;

    results.push({
      plantId: group.plantId,
      plantName: group.plantName,
      year: group.year,
      month: group.month,
      yearMonth: group.yearMonth,
      totalDayAheadSalesAmount: Number(group.totalDayAheadSalesAmount.toFixed(2)),
      totalImbalanceAmount: Number(group.totalImbalanceAmount.toFixed(2)),
      totalRevenue: Number(group.totalRevenue.toFixed(2)),
      totalActualMwh: Number(group.totalActualMwh.toFixed(4)),
      unitRevenue: Number(unitRevenue.toFixed(4)),
      totalImbalanceCost: Number(group.totalImbalanceCost.toFixed(2)),
      unitImbalanceCost: Number(unitImbalanceCost.toFixed(4)),
    });
  }

  // Tarih ve santrale göre sırala
  return results.sort((a, b) => {
    if (a.yearMonth !== b.yearMonth) {
      return a.yearMonth.localeCompare(b.yearMonth);
    }
    return (a.plantId || "").localeCompare(b.plantId || "");
  });
}

/**
 * Aylık sonuçları yıllık bazda toplar.
 *
 * ÖNEMLİ HESAPLAMA KURALI:
 * Yıllık birim gelir ve birim dengesizlik maliyeti hesaplanırken,
 * aylık birim değerlerin basit ortalaması ALINMAZ.
 * Doğrudan Yıllık Toplam Gelir / Yıllık Toplam Üretim (MWh) formülü ile
 * ağırlıklı ortalama hesaplanır.
 *
 * @param monthlyAggregates Aylık agregasyon sonuçları
 * @returns Yıllık özet (YearlyAggregate)
 */
export function aggregateYearly(monthlyAggregates: MonthlyAggregate[]): YearlyAggregate {
  if (monthlyAggregates.length === 0) {
    return {
      year: new Date().getFullYear(),
      totalDayAheadSalesAmount: 0,
      totalImbalanceAmount: 0,
      totalRevenue: 0,
      totalActualMwh: 0,
      unitRevenue: 0,
      totalImbalanceCost: 0,
      unitImbalanceCost: 0,
    };
  }

  let totalDayAheadSalesAmount = 0;
  let totalImbalanceAmount = 0;
  let totalRevenue = 0;
  let totalActualMwh = 0;
  let totalImbalanceCost = 0;

  for (const m of monthlyAggregates) {
    totalDayAheadSalesAmount += m.totalDayAheadSalesAmount;
    totalImbalanceAmount += m.totalImbalanceAmount;
    totalRevenue += m.totalRevenue;
    totalActualMwh += m.totalActualMwh;
    totalImbalanceCost += m.totalImbalanceCost;
  }

  // Ağırlıklı ortalama birim metrikler (Sıfıra bölme korumalı)
  const unitRevenue = totalActualMwh === 0 ? 0 : totalRevenue / totalActualMwh;
  const unitImbalanceCost =
    totalActualMwh === 0 ? 0 : totalImbalanceCost / totalActualMwh;

  const first = monthlyAggregates[0];

  return {
    plantId: first.plantId,
    plantName: first.plantName,
    year: first.year,
    totalDayAheadSalesAmount: Number(totalDayAheadSalesAmount.toFixed(2)),
    totalImbalanceAmount: Number(totalImbalanceAmount.toFixed(2)),
    totalRevenue: Number(totalRevenue.toFixed(2)),
    totalActualMwh: Number(totalActualMwh.toFixed(4)),
    unitRevenue: Number(unitRevenue.toFixed(4)),
    totalImbalanceCost: Number(totalImbalanceCost.toFixed(2)),
    unitImbalanceCost: Number(unitImbalanceCost.toFixed(4)),
  };
}

/**
 * Birden fazla santral içeren aylık agregasyon listesini,
 * her santral için ayrı ayrı yıllık bazda toplar.
 */
export function aggregateYearlyByPlant(
  monthlyAggregates: MonthlyAggregate[]
): YearlyAggregate[] {
  const byPlant = new Map<string, MonthlyAggregate[]>();

  for (const m of monthlyAggregates) {
    const key = m.plantId ?? "default";
    const existing = byPlant.get(key) ?? [];
    existing.push(m);
    byPlant.set(key, existing);
  }

  const results: YearlyAggregate[] = [];
  for (const items of Array.from(byPlant.values())) {
    results.push(aggregateYearly(items));
  }

  return results.sort((a, b) => (a.plantId || "").localeCompare(b.plantId || ""));
}
