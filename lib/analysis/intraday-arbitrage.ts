/**
 * TR-Energy Analyst — Gün İçi Piyasası (GİP) Arbitraj Analiz Motoru
 *
 * SAF (pure) fonksiyonlar:
 * - Dışsal yan etkisi yoktur (No side-effects, no I/O, no DB).
 * - Gün öncesi dengesizlik uzlaştırması ile GİP AOF (Ağırlıklı Ortalama Fiyatı) arasındaki
 *   fiyat farklarını ve pozisyon kapama potansiyelini inceler.
 *
 * ÖNEMLİ METODOLOJİ VE RİSK UYARISI:
 * Bu analiz, üreticinin her saat için tam isabetli zamanda ve tam miktar kadar GİP'te işlem
 * yapabildiğini varsayan TEORİK bir üst sınırdır. Gerçek hayatta likidite derinliği, işlem
 * gecikmesi ve kapı kapanış süresi (gate closure) kısıtları bu potansiyeli tam olarak
 * yakalamayı güçleştirir — sayılar "kesin kazanç" değil "araştırılmaya değer optimizasyon potansiyeli"
 * olarak değerlendirilmelidir.
 *
 * İKİ FARKLI ÖLÇÜ (karıştırılmamalı):
 * - Teorik tavan (totalMissedOpportunityTl): yalnızca GİP'in avantajlı olduğu saatlerin toplamı. Hangi saatte
 *   GİP'in avantajlı olacağını ve nihai dengesizliği önceden bilmeyi varsayar (mükemmel öngörü).
 * - Net etki (netIfAlwaysClosedTl): her saatin dengesizliği GİP AOF'tan kapatılsaydı, avantajlı ve dezavantajlı
 *   saatlerin toplamı. Fiyat öngörüsü gerektirmez; senaryo analizinin temelidir (intradayClosingScenario).
 * Her iki ölçü de dengesizlik maliyetinden pay ister; planlama iyileştirmesi ve DSG netleştirmesiyle TOPLANAMAZ.
 */

import { HourlyResult, SystemDirection } from "@/lib/calculations/types";

export interface ArbitrageAggregate {
  period: string; // "YYYY-MM" veya "YYYY"
  dateStr?: string;
  missedOpportunityTl: number; // Sadece pozitif fırsatların toplamı: "Kaçırılan Fırsat (TL)"
  correctDecisionsTl: number; // Sadece negatif fırsatların mutlak toplamı: "Doğru Verilen Kararlar (TL)"
  netArbitrageTl: number; // missedOpportunityTl - correctDecisionsTl (bilgilendirici referans)
  positiveHoursCount: number; // Arbitrajın karlı olduğu saat sayısı
  negativeHoursCount: number; // Dengesizlikte kalmanın daha avantajlı olduğu saat sayısı
  neutralHoursCount: number; // Dengesizlik olmayan veya fırsat 0 olan saat sayısı
  totalHoursWithGip: number; // GİP verisine sahip saat sayısı
  totalHours: number; // Toplam saat sayısı
  gipCoveragePercent: number; // GİP verisi kapsama oranı (%)
  avgGipPrice: number; // Ortalama GİP fiyatı (TL/MWh)
  avgImbalancePrice: number; // Ortalama dengesizlik fiyatı (TL/MWh)
  totalImbalanceMwh: number;
}

export interface TopArbitrageHour {
  timestamp: Date | string;
  dateStr: string;
  hourStr: string;
  imbalanceMwh: number;
  direction: "SURPLUS" | "DEFICIT";
  directionLabel: "Enerji Fazlası (Satım)" | "Enerji Açığı (Alım)";
  imbalancePrice: number; // İlgili dengesizlik fiyatı (Pozitif veya Negatif)
  gipPrice: number; // GİP AOF fiyatı
  priceDifference: number; // GİP ile dengesizlik fiyatı farkı (₺/MWh)
  opportunityTl: number; // Net kaçırılan fırsat tutarı (TL)
  ptf?: number;
  smf?: number;
  systemDirection?: SystemDirection;
  plantId?: string;
  plantName?: string;
}

export interface HourlyProfilePoint {
  hour: number;
  hourStr: string;
  avgGipPrice: number;
  avgImbalancePrice: number;
  avgPtfPrice: number;
  avgSmfPrice: number;
  totalOpportunityTl: number;
}

export interface DailyPricePoint {
  date: string;
  avgGipPrice: number;
  avgImbalancePrice: number;
  missedOpportunityTl: number;
  correctDecisionsTl: number;
}

export interface ArbitrageOverview {
  hasGipData: boolean;
  totalMissedOpportunityTl: number; // Kaçırılan Fırsat (TL)
  totalCorrectDecisionsTl: number; // Doğru Verilen Kararlar (TL)
  positiveHoursCount: number;
  negativeHoursCount: number;
  totalHoursWithGip: number;
  gipCoveragePercent: number;
  /** Net etki / GİP verili saatlerdeki toplam |dengesizlik| (₺/MWh) */
  avgOpportunityPerMwh: number;
  /** Her saat kapatılsaydı: avantajlı saatler − dezavantajlı saatler (TL) */
  netIfAlwaysClosedTl: number;
  /** GİP verili saatlerdeki toplam dengesizlik maliyeti (TL) — tavan ve net etkinin kıyas tabanı */
  imbalanceCostWithGipTl: number;
  /** Teorik tavanın dengesizlik maliyetine oranı (%) */
  ceilingShareOfCostPercent: number;
  /** Net etkinin dengesizlik maliyetine oranı (%) */
  netShareOfCostPercent: number;
  monthlyAggregates: ArbitrageAggregate[];
  topHours: TopArbitrageHour[];
  hourlyProfile24: HourlyProfilePoint[];
  dailyAggregates: DailyPricePoint[];
}

/**
 * 3.a calculateArbitrageOpportunity(imbalance, gipPrice, positiveImbalancePrice, negativeImbalancePrice): number
 *
 * → imbalance > 0 (pozitif dengesizlik/fazla üretim) ise:
 *   fırsat = (gipPrice - positiveImbalancePrice) * imbalance
 *   (GİP'te satmak, dengesizlik cezası fiyatından daha yüksekse pozitif fırsat çıkar)
 *
 * → imbalance < 0 (negatif dengesizlik/açık) ise:
 *   fırsat = (negativeImbalancePrice - gipPrice) * Math.abs(imbalance)
 *   (açığı GİP'ten kapatmak, dengesizlik cezası ödemekten daha ucuzsa pozitif fırsat çıkar)
 *
 * → imbalance == 0 veya gipPrice null/undefined ise: 0
 *
 * → NEGATİF fırsat da mümkün ve geçerlidir (GİP fiyatı o an daha kötüyse arbitraj yapmamak
 *   zaten doğru karardı) — bunu sıfıra yuvarlama, olduğu gibi göster.
 */
export function calculateArbitrageOpportunity(
  imbalance: number,
  gipPrice: number | null | undefined,
  positiveImbalancePrice: number,
  negativeImbalancePrice: number
): number {
  if (
    gipPrice === null ||
    gipPrice === undefined ||
    isNaN(gipPrice) ||
    !isFinite(gipPrice) ||
    imbalance === 0 ||
    isNaN(imbalance) ||
    !isFinite(imbalance)
  ) {
    return 0;
  }

  // Pozitif dengesizlik (Fazla Üretim)
  if (imbalance > 0) {
    // Üretici fazla enerjisini EPİAŞ'a pozitif dengesizlik fiyatından satmak yerine GİP'te satsaydı:
    return (gipPrice - positiveImbalancePrice) * imbalance;
  }

  // Negatif dengesizlik (Enerji Açığı)
  if (imbalance < 0) {
    // Üretici açığını EPİAŞ'tan negatif dengesizlik fiyatından kapatmak yerine GİP'ten alsaydı:
    return (negativeImbalancePrice - gipPrice) * Math.abs(imbalance);
  }

  return 0;
}

/**
 * 3.b aggregateArbitrageOpportunity(hourlyResults, granularity: 'month' | 'year'): ArbitrageAggregate[]
 *
 * SADECE pozitif fırsatların toplamını "Kaçırılan Fırsat (TL)" olarak,
 * negatif fırsatların toplamını ayrı bir "Doğru Verilen Kararlar (TL)" gibi bilgilendirici
 * bir metrik olarak AYRI AYRI raporlar.
 * İkisini birbirine karıştırıp net bir sayıya indirmez; kullanıcı ikisini de görür.
 */
export function aggregateArbitrageOpportunity(
  hourlyResults: HourlyResult[],
  granularity: "month" | "year" = "month"
): ArbitrageAggregate[] {
  if (!hourlyResults || hourlyResults.length === 0) {
    return [];
  }

  const groupMap = new Map<
    string,
    {
      period: string;
      missedOpportunityTl: number;
      correctDecisionsTl: number;
      positiveHoursCount: number;
      negativeHoursCount: number;
      neutralHoursCount: number;
      totalHoursWithGip: number;
      totalHours: number;
      sumGipPrice: number;
      sumImbalancePrice: number;
      totalImbalanceMwh: number;
    }
  >();

  for (const item of hourlyResults) {
    const dateObj = new Date(item.timestamp);
    const dateIso = dateObj.toISOString();
    const period =
      granularity === "year"
        ? dateIso.substring(0, 4) // "YYYY"
        : dateIso.substring(0, 7); // "YYYY-MM"

    let group = groupMap.get(period);
    if (!group) {
      group = {
        period,
        missedOpportunityTl: 0,
        correctDecisionsTl: 0,
        positiveHoursCount: 0,
        negativeHoursCount: 0,
        neutralHoursCount: 0,
        totalHoursWithGip: 0,
        totalHours: 0,
        sumGipPrice: 0,
        sumImbalancePrice: 0,
        totalImbalanceMwh: 0,
      };
      groupMap.set(period, group);
    }

    group.totalHours += 1;
    group.totalImbalanceMwh += Math.abs(item.imbalanceMwh);

    if (item.gipPrice !== null && item.gipPrice !== undefined && !isNaN(item.gipPrice)) {
      group.totalHoursWithGip += 1;
      group.sumGipPrice += item.gipPrice;

      const applicableImbalancePrice =
        item.imbalanceMwh > 0
          ? item.positivePrice
          : item.imbalanceMwh < 0
          ? item.negativePrice
          : (item.positivePrice + item.negativePrice) / 2;

      group.sumImbalancePrice += applicableImbalancePrice;

      const opp = calculateArbitrageOpportunity(
        item.imbalanceMwh,
        item.gipPrice,
        item.positivePrice,
        item.negativePrice
      );

      if (opp > 0.001) {
        // Pozitif fırsat: GİP'e gitmek daha karlıydı (Kaçırılan Fırsat)
        group.missedOpportunityTl += opp;
        group.positiveHoursCount += 1;
      } else if (opp < -0.001) {
        // Negatif fırsat: Dengesizlikte kalmak daha karlıydı (Doğru Verilen Karar)
        group.correctDecisionsTl += Math.abs(opp);
        group.negativeHoursCount += 1;
      } else {
        group.neutralHoursCount += 1;
      }
    } else {
      group.neutralHoursCount += 1;
    }
  }

  const results: ArbitrageAggregate[] = Array.from(groupMap.values()).map((g) => {
    const avgGip = g.totalHoursWithGip > 0 ? g.sumGipPrice / g.totalHoursWithGip : 0;
    const avgImbalance =
      g.totalHoursWithGip > 0 ? g.sumImbalancePrice / g.totalHoursWithGip : 0;
    const coverage =
      g.totalHours > 0 ? (g.totalHoursWithGip / g.totalHours) * 100 : 0;

    return {
      period: g.period,
      dateStr: g.period,
      missedOpportunityTl: Number(g.missedOpportunityTl.toFixed(2)),
      correctDecisionsTl: Number(g.correctDecisionsTl.toFixed(2)),
      netArbitrageTl: Number((g.missedOpportunityTl - g.correctDecisionsTl).toFixed(2)),
      positiveHoursCount: g.positiveHoursCount,
      negativeHoursCount: g.negativeHoursCount,
      neutralHoursCount: g.neutralHoursCount,
      totalHoursWithGip: g.totalHoursWithGip,
      totalHours: g.totalHours,
      gipCoveragePercent: Number(coverage.toFixed(1)),
      avgGipPrice: Number(avgGip.toFixed(2)),
      avgImbalancePrice: Number(avgImbalance.toFixed(2)),
      totalImbalanceMwh: Number(g.totalImbalanceMwh.toFixed(2)),
    };
  });

  return results.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * 3.c rankTopArbitrageHours(hourlyResults, topN=20): TopArbitrageHour[]
 *
 * En yüksek POZİTİF arbitraj fırsatına (Kaçırılan Fırsat TL) sahip saatleri
 * büyükten küçüğe sıralar.
 */
export function rankTopArbitrageHours(
  hourlyResults: HourlyResult[],
  topN: number = 20
): TopArbitrageHour[] {
  if (!hourlyResults || hourlyResults.length === 0) {
    return [];
  }

  const candidates: TopArbitrageHour[] = [];

  for (const item of hourlyResults) {
    if (item.gipPrice === null || item.gipPrice === undefined || isNaN(item.gipPrice)) {
      continue;
    }

    const opp = calculateArbitrageOpportunity(
      item.imbalanceMwh,
      item.gipPrice,
      item.positivePrice,
      item.negativePrice
    );

    // Sadece pozitif kaçırılan fırsatları sırala
    if (opp > 0.01) {
      const isSurplus = item.imbalanceMwh > 0;
      const imbalancePrice = isSurplus ? item.positivePrice : item.negativePrice;
      const priceDifference = isSurplus
        ? item.gipPrice - item.positivePrice
        : item.negativePrice - item.gipPrice;

      const dateObj = new Date(item.timestamp);
      const isoStr = dateObj.toISOString();
      const dateStr = isoStr.substring(0, 10);
      const hourNum = dateObj.getUTCHours();
      const hourStr = `${hourNum < 10 ? "0" : ""}${hourNum}:00`;

      candidates.push({
        timestamp: item.timestamp,
        dateStr,
        hourStr,
        imbalanceMwh: Number(item.imbalanceMwh.toFixed(2)),
        direction: isSurplus ? "SURPLUS" : "DEFICIT",
        directionLabel: isSurplus ? "Enerji Fazlası (Satım)" : "Enerji Açığı (Alım)",
        imbalancePrice: Number(imbalancePrice.toFixed(2)),
        gipPrice: Number(item.gipPrice.toFixed(2)),
        priceDifference: Number(priceDifference.toFixed(2)),
        opportunityTl: Number(opp.toFixed(2)),
        ptf: item.ptf,
        smf: item.smf,
        systemDirection: item.systemDirection,
        plantId: item.plantId,
        plantName: item.plantName,
      });
    }
  }

  // Fırsat tutarına göre büyükten küçüğe sırala
  candidates.sort((a, b) => b.opportunityTl - a.opportunityTl);

  return candidates.slice(0, topN);
}

/**
 * evaluateIntradayArbitrage(hourlyResults): ArbitrageOverview
 *
 * Veri kümesinde GİP verisinin olup olmadığını tespit eder ve
 * varsa genel özet metrikleri, aylık agregasyonları ve top fırsat saatlerini döner.
 */
export function evaluateIntradayArbitrage(
  hourlyResults: HourlyResult[]
): ArbitrageOverview {
  if (!hourlyResults || hourlyResults.length === 0) {
    return {
      hasGipData: false,
      totalMissedOpportunityTl: 0,
      totalCorrectDecisionsTl: 0,
      positiveHoursCount: 0,
      negativeHoursCount: 0,
      totalHoursWithGip: 0,
      gipCoveragePercent: 0,
      avgOpportunityPerMwh: 0,
      netIfAlwaysClosedTl: 0,
      imbalanceCostWithGipTl: 0,
      ceilingShareOfCostPercent: 0,
      netShareOfCostPercent: 0,
      monthlyAggregates: [],
      topHours: [],
      hourlyProfile24: [],
      dailyAggregates: [],
    };
  }

  // GİP verisi olan saatleri say
  const hoursWithGip = hourlyResults.filter(
    (h) => h.gipPrice !== null && h.gipPrice !== undefined && !isNaN(h.gipPrice)
  );

  const hasGipData = hoursWithGip.length > 0;
  if (!hasGipData) {
    return {
      hasGipData: false,
      totalMissedOpportunityTl: 0,
      totalCorrectDecisionsTl: 0,
      positiveHoursCount: 0,
      negativeHoursCount: 0,
      totalHoursWithGip: 0,
      gipCoveragePercent: 0,
      avgOpportunityPerMwh: 0,
      netIfAlwaysClosedTl: 0,
      imbalanceCostWithGipTl: 0,
      ceilingShareOfCostPercent: 0,
      netShareOfCostPercent: 0,
      monthlyAggregates: [],
      topHours: [],
      hourlyProfile24: [],
      dailyAggregates: [],
    };
  }

  const monthlyAggregates = aggregateArbitrageOpportunity(hourlyResults, "month");
  const topHours = rankTopArbitrageHours(hourlyResults, 20);

  const totalMissed = monthlyAggregates.reduce((s, m) => s + m.missedOpportunityTl, 0);
  const totalCorrect = monthlyAggregates.reduce((s, m) => s + m.correctDecisionsTl, 0);
  const totalPosHours = monthlyAggregates.reduce((s, m) => s + m.positiveHoursCount, 0);
  const totalNegHours = monthlyAggregates.reduce((s, m) => s + m.negativeHoursCount, 0);
  // Net etki ve oranlar yalnızca GİP verili saatler üzerinden (kapsama dışı saatler kıyası bozmasın)
  const gipImbalanceMwh = hoursWithGip.reduce((s, h) => s + Math.abs(h.imbalanceMwh), 0);
  const imbalanceCostWithGip = hoursWithGip.reduce((s, h) => s + h.imbalanceCost, 0);
  const netAll = totalMissed - totalCorrect;

  const avgOppPerMwh = gipImbalanceMwh > 0 ? netAll / gipImbalanceMwh : 0;
  const shareOfCost = (v: number) =>
    imbalanceCostWithGip > 0 ? Number(((v / imbalanceCostWithGip) * 100).toFixed(1)) : 0;
  const coverage = (hoursWithGip.length / hourlyResults.length) * 100;

  // 24-Saatlik Profil (00:00 - 23:00)
  const hourBuckets = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    sumGip: 0,
    sumImbalancePrice: 0,
    sumPtf: 0,
    sumSmf: 0,
    totalOpportunityTl: 0,
    count: 0,
  }));

  // Günlük Agregasyon Haritası
  const dailyMap = new Map<
    string,
    {
      date: string;
      sumGip: number;
      sumImbalancePrice: number;
      missedOpportunityTl: number;
      correctDecisionsTl: number;
      count: number;
    }
  >();

  for (const item of hoursWithGip) {
    const d = new Date(item.timestamp);
    const hr = d.getUTCHours();
    const dateStr = d.toISOString().substring(0, 10);

    const imbPrice =
      item.imbalanceMwh > 0
        ? item.positivePrice
        : item.imbalanceMwh < 0
        ? item.negativePrice
        : (item.positivePrice + item.negativePrice) / 2;

    const opp = calculateArbitrageOpportunity(
      item.imbalanceMwh,
      item.gipPrice,
      item.positivePrice,
      item.negativePrice
    );

    // Saatlik kova
    const b = hourBuckets[hr];
    b.sumGip += item.gipPrice!;
    b.sumImbalancePrice += imbPrice;
    b.sumPtf += item.ptf;
    b.sumSmf += item.smf;
    if (opp > 0) {
      b.totalOpportunityTl += opp;
    }
    b.count += 1;

    // Günlük kova
    let day = dailyMap.get(dateStr);
    if (!day) {
      day = {
        date: dateStr,
        sumGip: 0,
        sumImbalancePrice: 0,
        missedOpportunityTl: 0,
        correctDecisionsTl: 0,
        count: 0,
      };
      dailyMap.set(dateStr, day);
    }
    day.sumGip += item.gipPrice!;
    day.sumImbalancePrice += imbPrice;
    if (opp > 0) {
      day.missedOpportunityTl += opp;
    } else if (opp < 0) {
      day.correctDecisionsTl += Math.abs(opp);
    }
    day.count += 1;
  }

  const hourlyProfile24: HourlyProfilePoint[] = hourBuckets.map((b) => ({
    hour: b.hour,
    hourStr: `${b.hour < 10 ? "0" : ""}${b.hour}:00`,
    avgGipPrice: b.count > 0 ? Number((b.sumGip / b.count).toFixed(2)) : 0,
    avgImbalancePrice:
      b.count > 0 ? Number((b.sumImbalancePrice / b.count).toFixed(2)) : 0,
    avgPtfPrice: b.count > 0 ? Number((b.sumPtf / b.count).toFixed(2)) : 0,
    avgSmfPrice: b.count > 0 ? Number((b.sumSmf / b.count).toFixed(2)) : 0,
    totalOpportunityTl: Number(b.totalOpportunityTl.toFixed(2)),
  }));

  const dailyAggregates: DailyPricePoint[] = Array.from(dailyMap.values())
    .map((d) => ({
      date: d.date,
      avgGipPrice: d.count > 0 ? Number((d.sumGip / d.count).toFixed(2)) : 0,
      avgImbalancePrice:
        d.count > 0 ? Number((d.sumImbalancePrice / d.count).toFixed(2)) : 0,
      missedOpportunityTl: Number(d.missedOpportunityTl.toFixed(2)),
      correctDecisionsTl: Number(d.correctDecisionsTl.toFixed(2)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    hasGipData: true,
    totalMissedOpportunityTl: Number(totalMissed.toFixed(2)),
    totalCorrectDecisionsTl: Number(totalCorrect.toFixed(2)),
    positiveHoursCount: totalPosHours,
    negativeHoursCount: totalNegHours,
    totalHoursWithGip: hoursWithGip.length,
    gipCoveragePercent: Number(coverage.toFixed(1)),
    avgOpportunityPerMwh: Number(avgOppPerMwh.toFixed(2)),
    netIfAlwaysClosedTl: Number(netAll.toFixed(2)),
    imbalanceCostWithGipTl: Number(imbalanceCostWithGip.toFixed(2)),
    ceilingShareOfCostPercent: shareOfCost(totalMissed),
    netShareOfCostPercent: shareOfCost(netAll),
    monthlyAggregates,
    topHours,
    hourlyProfile24,
    dailyAggregates,
  };
}

/**
 * intradayClosingScenario(overview, sharePercent)
 *
 * "Tahmin hatasının %X'i gün içinde görülüp GİP AOF'tan kapatılsaydı" senaryosu.
 * Varsayım: her saatte dengesizliğin aynı payı kapatılır — GİP'in o saatte avantajlı olup olmadığı önceden
 * bilinmez, bu yüzden dezavantajlı saatler de dahildir. Kapatılan pay ile kazanç doğrusal olduğundan
 * sonuç = pay × netIfAlwaysClosedTl.
 * Gerçekte gün içinde en iyi görülen saatler en kolay kapatılanlardır; ayrıca likidite ve AOF'tan sapma
 * (slippage) dikkate alınmaz.
 */
export function intradayClosingScenario(
  overview: Pick<ArbitrageOverview, "netIfAlwaysClosedTl" | "imbalanceCostWithGipTl">,
  sharePercent: number
): { sharePercent: number; gainTl: number; shareOfCostPercent: number } {
  const share = Math.min(100, Math.max(0, sharePercent)) / 100;
  const gainTl = Number((share * overview.netIfAlwaysClosedTl).toFixed(2));
  return {
    sharePercent: share * 100,
    gainTl,
    shareOfCostPercent:
      overview.imbalanceCostWithGipTl > 0
        ? Number(((gainTl / overview.imbalanceCostWithGipTl) * 100).toFixed(1))
        : 0,
  };
}
