/**
 * TR-Energy Analyst Kural Tabanlı (Rule-Based) Strateji ve İçgörü Motoru
 *
 * SAF ve deterministik fonksiyonlar:
 * 1. findHighestCostHours: En yüksek dengesizlik maliyetine sahip saatleri ve ortak örüntüleri analiz eder.
 * 2. generateMitigationSuggestions: Teknoloji tipine (RES/HES/GES) ve bulunan örüntülere göre somut aksiyon üretir.
 * 3. comparePlantProfitability: Aynı teknoloji grubundaki santralleri birim metrikler ve portföy yönetim riski üzerinden puanlar.
 */

import {
  DEFAULT_IMBALANCE_PROFILE,
  HourlyResult,
  ImbalancePricingProfile,
  MonthlyAggregate,
  SystemDirection,
  YearlyAggregate,
} from "../calculations/types";
import { intradayImpact, multiplierImpact, percentile, SimulatedImpact } from "./impact-simulation";
import { volumeRatioBacktestSummary } from "../analysis/backtest";

export type TimeOfDayInterval = "NIGHT" | "MORNING" | "AFTERNOON" | "EVENING";

export interface PlantInfo {
  plantId: string;
  plantName: string;
  plantType: string; // "RES" | "HES" | "GES"
  capacityMw: number;
}

export interface HighestCostHourItem {
  timestamp: Date | string;
  hour: number;
  timeInterval: TimeOfDayInterval;
  imbalanceCost: number;
  imbalanceMwh: number;
  systemDirection: SystemDirection;
  ptf: number;
  smf: number;
  forecastMwh: number;
  actualMwh: number;
  errorRate: number; // |actual - forecast| / forecast
}

export interface HighestCostHoursAnalysis {
  totalAnalyzedHours: number;
  topNHours: number;
  topHours: HighestCostHourItem[];
  directionDistribution: {
    DEFICIT: { count: number; percentage: number };
    SURPLUS: { count: number; percentage: number };
    BALANCED: { count: number; percentage: number };
    dominantDirection: SystemDirection;
  };
  timeIntervalDistribution: Record<
    TimeOfDayInterval,
    { count: number; percentage: number; label: string }
  >;
  dominantInterval: {
    interval: TimeOfDayInterval;
    label: string;
    percentage: number;
    count: number;
  };
  topNMeanErrorRate: number;
  overallMeanErrorRate: number;
  errorRateRatio: number; // topNMean / overallMean
  systematicBias: "UNDER_FORECASTING" | "OVER_FORECASTING" | "MIXED";
  overForecastCount: number;
  underForecastCount: number;
  totalTopNCost: number;
  percentageOfTotalCost: number;
}

export interface MitigationSuggestion {
  id: string;
  title: string;
  category: "INTRADAY" | "CALIBRATION" | "TECHNOLOGY_SPECIFIC" | "MARKET_TIMING";
  priority: "HIGH" | "MEDIUM" | "LOW";
  triggerRule: string;
  description: string;
  actionItems: string[];
  /** Simülasyon sonucundan üretilen özet metin */
  expectedImpact: string;
  /** Önerilen aksiyonun geçmiş veride simülasyonu; simüle edilemiyorsa null */
  impact: SimulatedImpact | null;
  /** true: geçmişte tasarruf sağlardı, false: maliyeti artırırdı, null: bilinmiyor */
  recommended: boolean | null;
}

export interface PlantComparisonResult {
  plantId: string;
  plantName: string;
  plantType: string;
  capacityMw: number;
  unitRevenue: number;
  unitImbalanceCost: number;
  imbalanceCostRatio: number; // (unitImbalanceCost / unitRevenue) * 100
  score: number; // 0 - 100
  rankInType: number;
  totalInType: number;
  assessment: "EXCELLENT" | "GOOD" | "MODERATE" | "HIGH_RISK";
  rationale: string;
}

/**
 * Saatin gün içerisindeki dilimini tespit eder
 */
export function getTimeOfDayInterval(hour: number): {
  interval: TimeOfDayInterval;
  label: string;
} {
  if (hour >= 6 && hour < 12) {
    return { interval: "MORNING", label: "Sabah (06:00 - 12:00)" };
  }
  if (hour >= 12 && hour < 17) {
    return { interval: "AFTERNOON", label: "Öğle (12:00 - 17:00)" };
  }
  if (hour >= 17 && hour < 22) {
    return { interval: "EVENING", label: "Akşam (17:00 - 22:00)" };
  }
  return { interval: "NIGHT", label: "Gece (22:00 - 06:00)" };
}

/**
 * 1. findHighestCostHours(hourlyResults, topN = 20)
 *
 * En yüksek dengesizlik maliyetine sahip saatleri bulur ve şu ortak özellikleri analiz eder:
 * - Hangi sistem yönünde yoğunlaşıyor (Enerji Açığı/Fazlası/Dengede)
 * - Hangi saat aralıklarında yoğunlaşıyor (sabah/öğle/akşam/gece)
 * - Ortalama tahmin hatası (|actual-forecast|/forecast) bu saatlerde genel ortalamadan ne kadar yüksek
 */
export function findHighestCostHours(
  hourlyResults: HourlyResult[],
  topN = 20
): HighestCostHoursAnalysis {
  if (hourlyResults.length === 0) {
    return {
      totalAnalyzedHours: 0,
      topNHours: 0,
      topHours: [],
      directionDistribution: {
        DEFICIT: { count: 0, percentage: 0 },
        SURPLUS: { count: 0, percentage: 0 },
        BALANCED: { count: 0, percentage: 0 },
        dominantDirection: "BALANCED",
      },
      timeIntervalDistribution: {
        NIGHT: { count: 0, percentage: 0, label: "Gece (22:00 - 06:00)" },
        MORNING: { count: 0, percentage: 0, label: "Sabah (06:00 - 12:00)" },
        AFTERNOON: { count: 0, percentage: 0, label: "Öğle (12:00 - 17:00)" },
        EVENING: { count: 0, percentage: 0, label: "Akşam (17:00 - 22:00)" },
      },
      dominantInterval: {
        interval: "MORNING",
        label: "Sabah (06:00 - 12:00)",
        percentage: 0,
        count: 0,
      },
      topNMeanErrorRate: 0,
      overallMeanErrorRate: 0,
      errorRateRatio: 1,
      systematicBias: "MIXED",
      overForecastCount: 0,
      underForecastCount: 0,
      totalTopNCost: 0,
      percentageOfTotalCost: 0,
    };
  }

  // Genel toplam maliyet ve genel ortalama tahmin hatası
  let totalOverallCost = 0;
  let totalOverallErrorRate = 0;

  const enrichedHours: HighestCostHourItem[] = hourlyResults.map((rec) => {
    const date = new Date(rec.timestamp);
    const hour = date.getUTCHours();
    const { interval } = getTimeOfDayInterval(hour);

    const errorRate =
      rec.forecastMwh > 0
        ? Math.abs(rec.actualMwh - rec.forecastMwh) / rec.forecastMwh
        : rec.actualMwh > 0
          ? 1
          : 0;

    totalOverallCost += rec.imbalanceCost;
    totalOverallErrorRate += errorRate;

    return {
      timestamp: rec.timestamp,
      hour,
      timeInterval: interval,
      imbalanceCost: rec.imbalanceCost,
      imbalanceMwh: rec.imbalanceMwh,
      systemDirection: rec.systemDirection,
      ptf: rec.ptf,
      smf: rec.smf,
      forecastMwh: rec.forecastMwh,
      actualMwh: rec.actualMwh,
      errorRate,
    };
  });

  const overallMeanErrorRate = totalOverallErrorRate / hourlyResults.length;

  // Dengesizlik maliyetine göre büyükten küçüğe sırala ve topN seç
  const sorted = [...enrichedHours].sort((a, b) => b.imbalanceCost - a.imbalanceCost);
  const actualTopNCount = Math.min(topN, sorted.length);
  const topHours = sorted.slice(0, actualTopNCount);

  // Sistem yönü dağılımı
  let deficitCount = 0;
  let surplusCount = 0;
  let balancedCount = 0;

  // Zaman aralığı dağılımı
  const intervalCounts: Record<TimeOfDayInterval, number> = {
    NIGHT: 0,
    MORNING: 0,
    AFTERNOON: 0,
    EVENING: 0,
  };

  let totalTopNCost = 0;
  let totalTopNErrorRate = 0;
  let overForecastCount = 0; // actual < forecast (aşırı tahmin edilmiş)
  let underForecastCount = 0; // actual > forecast (eksik tahmin edilmiş)

  topHours.forEach((item) => {
    totalTopNCost += item.imbalanceCost;
    totalTopNErrorRate += item.errorRate;

    if (item.systemDirection === "DEFICIT") deficitCount++;
    else if (item.systemDirection === "SURPLUS") surplusCount++;
    else balancedCount++;

    intervalCounts[item.timeInterval]++;

    if (item.actualMwh < item.forecastMwh) {
      overForecastCount++;
    } else if (item.actualMwh > item.forecastMwh) {
      underForecastCount++;
    }
  });

  const topNMeanErrorRate =
    actualTopNCount > 0 ? totalTopNErrorRate / actualTopNCount : 0;
  const errorRateRatio =
    overallMeanErrorRate > 0 ? topNMeanErrorRate / overallMeanErrorRate : 1;

  // Hakim sistem yönü
  let dominantDirection: SystemDirection = "BALANCED";
  if (deficitCount >= surplusCount && deficitCount >= balancedCount) {
    dominantDirection = "DEFICIT";
  } else if (surplusCount >= deficitCount && surplusCount >= balancedCount) {
    dominantDirection = "SURPLUS";
  }

  // Hakim zaman aralığı
  let dominantIntervalType: TimeOfDayInterval = "MORNING";
  let maxIntervalCount = -1;

  (Object.keys(intervalCounts) as TimeOfDayInterval[]).forEach((key) => {
    if (intervalCounts[key] > maxIntervalCount) {
      maxIntervalCount = intervalCounts[key];
      dominantIntervalType = key;
    }
  });

  const timeIntervalDistribution: Record<
    TimeOfDayInterval,
    { count: number; percentage: number; label: string }
  > = {
    NIGHT: {
      count: intervalCounts.NIGHT,
      percentage: Number(((intervalCounts.NIGHT / actualTopNCount) * 100).toFixed(1)),
      label: "Gece (22:00 - 06:00)",
    },
    MORNING: {
      count: intervalCounts.MORNING,
      percentage: Number(((intervalCounts.MORNING / actualTopNCount) * 100).toFixed(1)),
      label: "Sabah (06:00 - 12:00)",
    },
    AFTERNOON: {
      count: intervalCounts.AFTERNOON,
      percentage: Number(((intervalCounts.AFTERNOON / actualTopNCount) * 100).toFixed(1)),
      label: "Öğle (12:00 - 17:00)",
    },
    EVENING: {
      count: intervalCounts.EVENING,
      percentage: Number(((intervalCounts.EVENING / actualTopNCount) * 100).toFixed(1)),
      label: "Akşam (17:00 - 22:00)",
    },
  };

  // Sistematik bias tespiti (%60+ tek yönlülük)
  let systematicBias: "UNDER_FORECASTING" | "OVER_FORECASTING" | "MIXED" = "MIXED";
  if (overForecastCount / actualTopNCount >= 0.6) {
    systematicBias = "OVER_FORECASTING";
  } else if (underForecastCount / actualTopNCount >= 0.6) {
    systematicBias = "UNDER_FORECASTING";
  }

  const percentageOfTotalCost =
    totalOverallCost > 0 ? (totalTopNCost / totalOverallCost) * 100 : 0;

  return {
    totalAnalyzedHours: hourlyResults.length,
    topNHours: actualTopNCount,
    topHours,
    directionDistribution: {
      DEFICIT: {
        count: deficitCount,
        percentage: Number(((deficitCount / actualTopNCount) * 100).toFixed(1)),
      },
      SURPLUS: {
        count: surplusCount,
        percentage: Number(((surplusCount / actualTopNCount) * 100).toFixed(1)),
      },
      BALANCED: {
        count: balancedCount,
        percentage: Number(((balancedCount / actualTopNCount) * 100).toFixed(1)),
      },
      dominantDirection,
    },
    timeIntervalDistribution,
    dominantInterval: {
      interval: dominantIntervalType,
      label: timeIntervalDistribution[dominantIntervalType].label,
      percentage: timeIntervalDistribution[dominantIntervalType].percentage,
      count: maxIntervalCount,
    },
    topNMeanErrorRate: Number(topNMeanErrorRate.toFixed(4)),
    overallMeanErrorRate: Number(overallMeanErrorRate.toFixed(4)),
    errorRateRatio: Number(errorRateRatio.toFixed(2)),
    systematicBias,
    overForecastCount,
    underForecastCount,
    totalTopNCost: Number(totalTopNCost.toFixed(2)),
    percentageOfTotalCost: Number(percentageOfTotalCost.toFixed(1)),
  };
}

/** Maliyetin ve saatlerin bir anahtara göre dağılımı (tüm saatler üzerinden) */
function costConcentration<K extends string>(hourly: HourlyResult[], keyOf: (h: HourlyResult) => K) {
  const totalCost = hourly.reduce((s, h) => s + h.imbalanceCost, 0);
  const groups = new Map<K, { cost: number; hours: number }>();
  for (const h of hourly) {
    const k = keyOf(h);
    const g = groups.get(k) ?? { cost: 0, hours: 0 };
    g.cost += h.imbalanceCost;
    g.hours += 1;
    groups.set(k, g);
  }
  return Array.from(groups.entries()).map(([key, g]) => ({
    key,
    costShare: totalCost > 0 ? g.cost / totalCost : 0,
    hourShare: hourly.length > 0 ? g.hours / hourly.length : 0,
  }));
}

const pct = (v: number) => `%${(v * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
const tl = (v: number) => `${Math.abs(Math.round(v)).toLocaleString("tr-TR")} ₺`;

/** Simülasyon sonucunu öneri kartındaki "Beklenen Etki" metnine çevirir */
function describeImpact(impact: SimulatedImpact | null): string {
  if (!impact) return "Veriyle simüle edilemedi; etki tahmini yok.";
  if (impact.savingTl > 0) {
    return `Geçmiş veride ${tl(impact.savingTl)} tasarruf (dengesizlik maliyetinin %${impact.percentOfCost.toLocaleString("tr-TR")} payı).`;
  }
  if (impact.savingTl < 0) return `Geçmiş veride maliyeti ${tl(impact.savingTl)} artırırdı; önerilmez.`;
  return "Geçmiş veride maliyeti değiştirmezdi.";
}

/**
 * 2. generateMitigationSuggestions(plant, analysisResult, hourly, profile)
 *
 * Kural tabanlı öneriler üretir. Kurallar, en pahalı 20 saate değil TÜM saatlerdeki maliyet dağılımına bakar
 * (20 saatlik örnekte bir zaman dilimi yalnızca şans eseri %30'u kolayca geçer).
 *
 * Her önerinin etkisi, önerilen aksiyon geçmiş veriye uygulanıp motor yeniden çalıştırılarak ölçülür
 * (impact-simulation.ts). Geçmişte maliyeti artıran öneriler "önerilmez" olarak işaretlenir ve sona alınır;
 * simüle edilemeyen öneriler etki tahmini taşımaz.
 */
export function generateMitigationSuggestions(
  plant: PlantInfo,
  analysisResult: HighestCostHoursAnalysis,
  hourly: HourlyResult[],
  profile: ImbalancePricingProfile = DEFAULT_IMBALANCE_PROFILE
): MitigationSuggestion[] {
  const suggestions: MitigationSuggestion[] = [];
  const add = (s: Omit<MitigationSuggestion, "expectedImpact" | "recommended">) => {
    const recommended = s.impact ? s.impact.savingTl > 0 : null;
    suggestions.push({
      ...s,
      priority: recommended === false ? "LOW" : s.priority,
      expectedImpact: describeImpact(s.impact),
      recommended,
    });
  };

  // KURAL 1: Maliyetin bir zaman diliminde yoğunlaşması → o dilimde GİP pozisyon güncellemesi
  const intervalOf = (h: HourlyResult) => getTimeOfDayInterval(new Date(h.timestamp).getUTCHours());
  const concentrated = costConcentration(hourly, (h) => intervalOf(h).interval)
    .filter((c) => c.costShare >= 0.3 && c.hourShare > 0 && c.costShare / c.hourShare >= 1.25)
    .sort((a, b) => b.costShare / b.hourShare - a.costShare / a.hourShare)[0];
  if (concentrated) {
    const label = getTimeOfDayInterval(
      { NIGHT: 0, MORNING: 6, AFTERNOON: 12, EVENING: 17 }[concentrated.key]
    ).label;
    add({
      id: "suggestion-intraday-timing",
      title: `${label} Diliminde Gün İçi Piyasası (GİP) Pozisyon Güncellemesi`,
      category: "INTRADAY",
      priority: "HIGH",
      triggerRule: `Dengesizlik maliyetinin ${pct(concentrated.costShare)} payı ${label} diliminde; bu dilim saatlerin yalnızca ${pct(concentrated.hourShare)} payını oluşturuyor.`,
      description:
        "Maliyetin belirli bir zaman diliminde yoğunlaşması, gün öncesi tahminin (KGÖP) bu saatlerde daha fazla saptığını gösterir. Bu saatlere yaklaşırken güncel üretim tahminiyle GİP'te pozisyon güncellenmelidir.",
      actionItems: [
        "Dilim başlamadan 2-3 saat önce güncel üretim tahminini ve gerçekleşmeleri kontrol edin.",
        "Beklenen sapmayı kapı kapanışına kadar GİP'te ters yönlü işlemle kapatın.",
      ],
      impact: intradayImpact(hourly, (h) => intervalOf(h).interval === concentrated.key, label),
    });
  }

  // KURAL 2: Maliyetin sistem yönünde yoğunlaşması
  const byDirection = costConcentration(hourly, (h) => h.systemDirection);
  const deficit = byDirection.find((d) => d.key === "DEFICIT");
  const surplus = byDirection.find((d) => d.key === "SURPLUS");

  if (deficit && deficit.costShare >= 0.5) {
    const ptfP75 = percentile(
      hourly.map((h) => h.ptf),
      0.75
    );
    add({
      id: "suggestion-deficit-protection",
      title: "Yüksek Fiyatlı Saatlerde Muhafazakâr KGÖP",
      category: "MARKET_TIMING",
      priority: "HIGH",
      triggerRule: `Dengesizlik maliyetinin ${pct(deficit.costShare)} payı sistemin enerji açığında olduğu saatlerde oluştu (saatlerin ${pct(deficit.hourShare)} payı).`,
      description:
        "Enerji açığında eksik üretim MAX(PTF, SMF) × (1 + k) üzerinden, fazla üretim ise MIN(PTF, SMF) × (1 − l) üzerinden uzlaşır. Açık saatlerinde eksik kalmanın maliyeti fazla kalmanınkinden yüksek olduğundan, pahalı saatlerde teklifi biraz düşük tutmak bu asimetriden yararlanabilir.",
      actionItems: [
        "PTF'nin üst çeyrekte beklendiği saatlerde KGÖP'ü %5 düşük bildirmeyi değerlendirin.",
        "Bilinçli düşük bildirim KÜPST ve piyasa gözetimi kuralları açısından ayrıca değerlendirilmelidir.",
      ],
      impact: multiplierImpact(
        hourly,
        (h) => h.ptf >= ptfP75,
        0.95,
        profile,
        `PTF'nin üst çeyrekte olduğu saatlerde (≥ ${Math.round(ptfP75).toLocaleString("tr-TR")} ₺/MWh) tahmin %5 düşürüldü.`,
        "Gerçekleşen PTF kullanıldı; teklif anında PTF bilinmez, fiyat tahmini gerektirir."
      ),
    });
  } else if (surplus && surplus.costShare >= 0.5) {
    add({
      id: "suggestion-surplus-optimization",
      title: "Enerji Fazlası Saatlerinde Fazla Üretimi GİP'te Satma",
      category: "MARKET_TIMING",
      priority: "MEDIUM",
      triggerRule: `Dengesizlik maliyetinin ${pct(surplus.costShare)} payı sistemin enerji fazlasında olduğu saatlerde oluştu (saatlerin ${pct(surplus.hourShare)} payı).`,
      description:
        "Enerji fazlasında sisteme verilen fazla üretim MIN(PTF, SMF) × (1 − l) üzerinden, yani iskontolu uzlaşır. Öngörülen fazla üretimi GİP'te satmak bu iskontodan kaçınmayı sağlar.",
      actionItems: [
        "Fazla üretim öngörüldüğünde enerjiyi kapı kapanışından önce GİP'te satın.",
        "Enerji fazlası beklenen saatlerde güncel tahmini daha sık yenileyin.",
      ],
      impact: intradayImpact(hourly, (h) => h.systemDirection === "SURPLUS" && h.imbalanceMwh > 0, "Sistemin enerji fazlasında olduğu ve santralin fazla ürettiği"),
    });
  }

  // KURAL 3: Tüm dönem boyunca tek yönlü (sistematik) sapma → tahmini tek katsayıyla kalibre etme
  const totalActual = hourly.reduce((s, h) => s + h.actualMwh, 0);
  const totalForecast = hourly.reduce((s, h) => s + h.forecastMwh, 0);
  const netError = totalActual - totalForecast;
  const absError = hourly.reduce((s, h) => s + Math.abs(h.actualMwh - h.forecastMwh), 0);
  const systematicShare = absError > 0 ? Math.abs(netError) / absError : 0;
  const netErrorRatio = totalActual > 0 ? Math.abs(netError) / totalActual : 0;
  if (totalForecast > 0 && systematicShare >= 0.15 && netErrorRatio >= 0.03) {
    const over = netError < 0;
    const factor = totalActual / totalForecast;
    add({
      id: over ? "suggestion-bias-overforecast" : "suggestion-bias-underforecast",
      title: over ? "Aşırı Tahmin (Over-Forecasting) Kalibrasyonu" : "Eksik Tahmin (Under-Forecasting) Kalibrasyonu",
      category: "CALIBRATION",
      priority: "HIGH",
      triggerRule: `Toplam tahmin gerçekleşenden ${pct(netErrorRatio)} ${over ? "fazla" : "eksik"}; hataların ${pct(systematicShare)} payı tek yönlü.`,
      description: over
        ? "Tahmin modeli santral üretimini düzenli olarak olduğundan yüksek öngörüyor; model parametreleri aşağı yönlü kalibre edilmelidir."
        : "Tahmin modeli santral üretimini düzenli olarak olduğundan düşük öngörüyor; üretimin bir kısmı GÖP yerine iskontolu dengesizlik fiyatından uzlaşıyor.",
      actionItems: [
        "Tahmin modeline son dönem sapmasına göre güncellenen bir yanlılık düzeltmesi ekleyin.",
        "Düzeltmeyi ileriye dönük uygulamadan önce geçmiş verinin ayrı bir döneminde test edin.",
      ],
      // Yeterli veri varsa etki geriye dönük testle (görmediği aylarda) ölçülür; yoksa aynı dönem hesabı
      impact: (() => {
        const bt = volumeRatioBacktestSummary(hourly, profile);
        if (bt) {
          return {
            savingTl: bt.outOfSampleSavingTl,
            percentOfCost: Number(bt.outOfSampleSavingPercent.toFixed(1)),
            method: `Geriye dönük test: her ay, önceki 4 ayın Σ gerçekleşen / Σ tahmin oranıyla ölçeklendi (${bt.testMonths} test ayı, ${bt.positiveMonths} ayı kazançlı).`,
            caveat: "Oran, planlama sayfasındaki yanlılık düzeltmesiyle aynı yöntemle hesaplandı.",
          };
        }
        return multiplierImpact(
          hourly,
          () => true,
          factor,
          profile,
          `Tüm saatlerde tahmin ${factor.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ile çarpıldı (Σ gerçekleşen / Σ tahmin).`,
          "Katsayı aynı dönemin verisinden hesaplandı; gelecekteki etki bunun altında kalabilir."
        );
      })(),
    });
  }

  // KURAL 4: Teknolojiye özel öneriler (veriyle simüle edilemez)
  if (plant.plantType === "RES") {
    add({
      id: "suggestion-tech-res",
      title: "RES Tahmininde Güncelleme Sıklığı ve Saha Verisi",
      category: "TECHNOLOGY_SPECIFIC",
      priority: "MEDIUM",
      triggerRule: "Santral RES tipinde; rüzgâr hızındaki küçük değişimler üretimi orantısız etkiler (güç eğrisi yaklaşık v³).",
      description:
        "Rüzgâr tahmininde hata, tahmin ufku kısaldıkça belirgin biçimde azalır. Gün içi güncellemeler GİP pozisyonlarının dayanağıdır.",
      actionItems: [
        "Türbin SCADA verilerini (rüzgâr hızı, kullanılabilirlik) tahmin modeline gerçek zamanlı besleyin.",
        "Gün içinde saatlik yenilenen tahminlere geçin.",
      ],
      impact: null,
    });
  } else if (plant.plantType === "HES") {
    add({
      id: "suggestion-tech-hes",
      title: "HES Rezervuar/Debi Yönetimi ile Portföy Dengeleme",
      category: "TECHNOLOGY_SPECIFIC",
      priority: "MEDIUM",
      triggerRule: "Santral HES tipinde; barajlı santraller üretimi saatler arasında kaydırabilir.",
      description:
        "Barajlı HES'ler portföydeki diğer santrallerin sapmalarını dengelemek için kullanılabilir. Nehir tipi santrallerde bu esneklik sınırlıdır.",
      actionItems: [
        "Portföydeki RES/GES sapmalarını gün içinde HES üretimini ayarlayarak dengeleyin.",
        "Dengeleme birimi olarak kayıtlıysanız SMF'nin yüksek olduğu saatlerde YAL teklifi vermeyi değerlendirin.",
      ],
      impact: null,
    });
  } else if (plant.plantType === "GES") {
    add({
      id: "suggestion-tech-ges",
      title: "GES Bulutluluk Takibi (Nowcasting)",
      category: "TECHNOLOGY_SPECIFIC",
      priority: "MEDIUM",
      triggerRule: "Santral GES tipinde; bulutluluk değişimleri kısa sürede büyük sapma yaratır.",
      description:
        "Güneş üretiminde gün öncesi tahminin en zayıf olduğu durumlar parçalı bulutlu günlerdir; kısa vadeli uydu tabanlı tahminler bu sapmayı azaltır.",
      actionItems: [
        "Uydu ve yer ölçümüne dayalı kısa vadeli (nowcasting) radyasyon tahminlerini kullanın.",
        "Parçalı bulutlu günlerde GİP pozisyonlarını daha sık güncelleyin.",
      ],
      impact: null,
    });
  }

  // KURAL 5: Maliyetin uç saatlerde yoğunlaşması (bu kural bilinçli olarak en pahalı saatlere bakar)
  const { errorRateRatio, topNMeanErrorRate, overallMeanErrorRate, topNHours, percentageOfTotalCost } =
    analysisResult;
  if (errorRateRatio >= 1.5) {
    add({
      id: "suggestion-error-spike",
      title: "Uç Sapmalar İçin Uyarı Mekanizması",
      category: "CALIBRATION",
      priority: "MEDIUM",
      triggerRule: `En pahalı ${topNHours} saat maliyetin %${percentageOfTotalCost.toLocaleString("tr-TR")} payını oluşturuyor; bu saatlerdeki ortalama hata (%${(topNMeanErrorRate * 100).toFixed(0)}) genel ortalamanın (%${(overallMeanErrorRate * 100).toFixed(0)}) ${errorRateRatio.toFixed(1)} katı.`,
      description:
        "Maliyetin önemli bir kısmı az sayıda aşırı sapmalı saatte oluşuyor. Bu saatleri önceden fark etmek için tahmin belirsizliği izlenmelidir.",
      actionItems: [
        "Tahmin modeline güven aralığı ekleyin; aralık genişlediğinde GİP'te erken pozisyon alın.",
        "Tahmin ile gerçekleşen arasındaki fark eşik değeri aştığında alarm üretin.",
      ],
      impact: null,
    });
  }

  // Sıralama: geçmişte tasarruf sağlayanlar (büyükten küçüğe) → etkisi bilinmeyenler → önerilmeyenler
  const rank = (s: MitigationSuggestion) => (s.recommended === true ? 0 : s.recommended === null ? 1 : 2);
  return suggestions
    .sort((a, b) => rank(a) - rank(b) || (b.impact?.savingTl ?? 0) - (a.impact?.savingTl ?? 0))
    .slice(0, 5);
}

/**
 * 3. comparePlantProfitability(plants, results)
 *
 * Aynı teknoloji tipindeki santralleri (RES-RES, HES-HES, GES-GES)
 * birim gelir ve birim dengesizlik maliyeti üzerinden sıralayıp,
 * bir "portföy yönetim hizmeti" için hangisinin daha karlı ve az riskli olduğunu
 * puanlayan skor (0-100) ve gerekçe metni üretir.
 */
export function comparePlantProfitability(
  plants: PlantInfo[],
  results: Record<
    string,
    {
      hourly: HourlyResult[];
      monthly: MonthlyAggregate[];
      yearly: YearlyAggregate;
    }
  >
): PlantComparisonResult[] {
  // Santralleri teknoloji tipine göre grupla
  const byType = new Map<string, PlantInfo[]>();
  plants.forEach((p) => {
    const list = byType.get(p.plantType) || [];
    list.push(p);
    byType.set(p.plantType, list);
  });

  const comparisons: PlantComparisonResult[] = [];

  for (const [plantType, groupPlants] of Array.from(byType.entries())) {
    // Her santralin metriklerini hazırla
    const plantMetrics = groupPlants.map((plant) => {
      const plantResult = results[plant.plantId];
      const yearly = plantResult?.yearly;

      const unitRevenue = yearly?.unitRevenue || 0;
      const unitImbalanceCost = yearly?.unitImbalanceCost || 0;
      const imbalanceCostRatio =
        unitRevenue > 0 ? (unitImbalanceCost / unitRevenue) * 100 : 0;

      // Net birim marj (₺/MWh)
      const netUnitMargin = unitRevenue - unitImbalanceCost;

      return {
        plant,
        unitRevenue,
        unitImbalanceCost,
        imbalanceCostRatio,
        netUnitMargin,
      };
    });

    // Net marj ve düşük maliyet oranına göre sırala
    plantMetrics.sort((a, b) => {
      if (b.netUnitMargin !== a.netUnitMargin) {
        return b.netUnitMargin - a.netUnitMargin;
      }
      return a.imbalanceCostRatio - b.imbalanceCostRatio;
    });

    // Skor ve gerekçe üret
    plantMetrics.forEach((item, index) => {
      const { plant, unitRevenue, unitImbalanceCost, imbalanceCostRatio, netUnitMargin } =
        item;
      const rankInType = index + 1;
      const totalInType = plantMetrics.length;

      // Skor Hesaplama (0-100)
      // Dengesizlik maliyet oranı ne kadar düşük ve birim gelir ne kadar yüksekse puan o kadar artar
      let score = 85;
      if (imbalanceCostRatio <= 2.5) {
        score += 10;
      } else if (imbalanceCostRatio <= 5.0) {
        score += 5;
      } else if (imbalanceCostRatio > 10.0) {
        score -= 20;
      } else if (imbalanceCostRatio > 7.0) {
        score -= 10;
      }

      // Sıralama bonusu
      if (rankInType === 1 && totalInType > 1) {
        score += 5;
      }

      score = Math.max(10, Math.min(100, Math.round(score)));

      let assessment: "EXCELLENT" | "GOOD" | "MODERATE" | "HIGH_RISK" = "GOOD";
      if (score >= 90) assessment = "EXCELLENT";
      else if (score >= 75) assessment = "GOOD";
      else if (score >= 60) assessment = "MODERATE";
      else assessment = "HIGH_RISK";

      // Açıklayıcı gerekçe metni
      let rationale = "";
      if (assessment === "EXCELLENT") {
        rationale = `${plant.plantName} (${plantType}), MWh başına ${unitRevenue.toFixed(
          2
        )} ₺ birim gelir elde ederken, birim dengesizlik maliyeti yalnızca ${unitImbalanceCost.toFixed(
          2
        )} ₺/MWh (gelirin %${imbalanceCostRatio.toFixed(
          1
)} payı) seviyesinde kalmıştır. Yüksek tahmin doğruluğu ve düşük ceza oranıyla portföy yönetim hizmeti için son derece cazip ve düşük riskli bir profildir.`;
      } else if (assessment === "GOOD") {
        rationale = `${plant.plantName} (${plantType}), ${unitRevenue.toFixed(
          2
        )} ₺/MWh birim gelir ve ${unitImbalanceCost.toFixed(
          2
        )} ₺/MWh dengesizlik maliyeti ile dengeli bir performans sunmaktadır. Dengesizlik maliyetinin toplam gelire oranı (%${imbalanceCostRatio.toFixed(
          1
        )}) makul düzeydedir; dengesizlik sonrası net birim marj ${netUnitMargin.toFixed(2)} ₺/MWh.`;
      } else if (assessment === "MODERATE") {
        rationale = `${plant.plantName} (${plantType}), ${unitImbalanceCost.toFixed(
          2
        )} ₺/MWh seviyesindeki dengesizlik maliyetiyle birim gelirin %${imbalanceCostRatio.toFixed(
          1
)} payını kaybetmektedir. Benzer teknolojiye sahip santrallere kıyasla operasyonel risk orta seviyededir; portföye alınmadan önce tahmin modelleri kalibre edilmelidir.`;
      } else {
        rationale = `${plant.plantName} (${plantType}), yüksek tahmin sapmaları ve ${unitImbalanceCost.toFixed(
          2
        )} ₺/MWh birim maliyetle yüksek risk taşımaktadır. Portföy yönetiminde net marjı baskılayan bu santral için acil tolerans ve GİP koruma önlemleri alınmalıdır.`;
      }

      comparisons.push({
        plantId: plant.plantId,
        plantName: plant.plantName,
        plantType: plant.plantType,
        capacityMw: plant.capacityMw,
        unitRevenue: Number(unitRevenue.toFixed(2)),
        unitImbalanceCost: Number(unitImbalanceCost.toFixed(2)),
        imbalanceCostRatio: Number(imbalanceCostRatio.toFixed(2)),
        score,
        rankInType,
        totalInType,
        assessment,
        rationale,
      });
    });
  }

  return comparisons.sort((a, b) => b.score - a.score);
}
