/**
 * TR-Energy Analyst Kural Tabanlı (Rule-Based) Strateji ve İçgörü Motoru
 *
 * SAF ve deterministik fonksiyonlar:
 * 1. findHighestCostHours: En yüksek dengesizlik maliyetine sahip saatleri ve ortak örüntüleri analiz eder.
 * 2. generateMitigationSuggestions: Teknoloji tipine (RES/HES/GES) ve bulunan örüntülere göre somut aksiyon üretir.
 * 3. comparePlantProfitability: Aynı teknoloji grubundaki santralleri birim metrikler ve portföy yönetim riski üzerinden puanlar.
 */

import {
  HourlyResult,
  MonthlyAggregate,
  SystemDirection,
  YearlyAggregate,
} from "../calculations/types";

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
  expectedImpact: string;
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

/**
 * 2. generateMitigationSuggestions(plant, analysisResult)
 *
 * Teknoloji tipine (RES/HES/GES) ve bulunan örüntülere göre
 * kural tabanlı 3-5 somut aksiyon önerisi üretir.
 */
export function generateMitigationSuggestions(
  plant: PlantInfo,
  analysisResult: HighestCostHoursAnalysis
): MitigationSuggestion[] {
  const suggestions: MitigationSuggestion[] = [];
  const {
    dominantInterval,
    directionDistribution,
    systematicBias,
    errorRateRatio,
    topNMeanErrorRate,
    overallMeanErrorRate,
  } = analysisResult;

  // KURAL 1: Zaman Aralığı Yoğunlaşması Kuralı
  if (dominantInterval.percentage >= 30) {
    suggestions.push({
      id: "suggestion-intraday-timing",
      title: `${dominantInterval.label} Diliminde Gün İçi Piyasası (GİP) Pozisyon Güncellemesi`,
      category: "INTRADAY",
      priority: "HIGH",
      triggerRule: `En yüksek maliyetli saatlerin %${dominantInterval.percentage.toFixed(0)}'i ${dominantInterval.label} diliminde yoğunlaşıyor.`,
      description: `Maliyet kayıplarının belirgin bir zaman aralığında kümelenmesi, gün öncesi tahminlerin (KGÖP) bu saatlerde sapma yaptığını gösterir. Bu saatler yaklaşırken Gün İçi Piyasasında (GİP) aktif karşı pozisyon alınmalıdır.`,
      actionItems: [
        `${dominantInterval.label} başlangıcından 2-3 saat önce güncel üretim gerçekleşmelerini kontrol edin.`,
        "GİP üzerinde kapı kapanış saatine kadar ters yönlü alım/satım kontratları ile pozisyonu sıfırlayın.",
        "Bu saat dilimi için KGÖP tahmin güvenilirlik katsayısını dinamik olarak güncelleyin.",
      ],
      expectedImpact: `${dominantInterval.label} dilimindeki dengesizlik maliyetlerinde %25 - %40 oranında düşüş.`,
    });
  }

  // KURAL 2: Sistem Yönü Yoğunlaşması Kuralı
  if (directionDistribution.DEFICIT.percentage >= 45) {
    suggestions.push({
      id: "suggestion-deficit-protection",
      title: "Sistem Enerji Açığı Yönündeyken Muhafazakar Tahmin Marjı",
      category: "MARKET_TIMING",
      priority: "HIGH",
      triggerRule: `Kritik saatlerin %${directionDistribution.DEFICIT.percentage.toFixed(0)}'si sistemin enerji açığında olduğu (SMF > PTF) dönemlerde gerçekleşti.`,
      description: `Sistem enerji açığındayken negatif dengesizlik (eksik üretim) birim cezası Max(PTF, SMF) * (1 + k) üzerinden çok ağır fiyatlandırılır. Bu zamanlarda eksik kalmamak esastır.`,
      actionItems: [
        "Piyasa Takas Fiyatının (PTF) yüksek beklendiği saatlerde KGÖP teklifini %5 aşağı yönlü revize ederek güvenlik payı bırakın.",
        "Sistemin enerji açığı verme ihtimali yüksek saatlerde (sabah ve akşam pikleri) pozitif dengesizlik tarafında kalmayı hedefleyin.",
      ],
      expectedImpact: "Ceza katsayılı Max(PTF, SMF) borçlanmalarının önlenmesi.",
    });
  } else if (directionDistribution.SURPLUS.percentage >= 45) {
    suggestions.push({
      id: "suggestion-surplus-optimization",
      title: "Enerji Fazlası Saatlerinde İskontolu Satıştan Kaçınma Stratejisi",
      category: "MARKET_TIMING",
      priority: "MEDIUM",
      triggerRule: `Kritik saatlerin %${directionDistribution.SURPLUS.percentage.toFixed(0)}'si sistemin enerji fazlasında olduğu (SMF < PTF) dönemlerde gerçekleşti.`,
      description: `Sistem enerji fazlasındayken sisteme verilen fazla enerji Min(PTF, SMF) * (1 - k) üzerinden iskontolu alınır. Fazla enerjiyi dengesizliğe bırakmak gelir kaybı yaratır.`,
      actionItems: [
        "Fazla üretim öngörüldüğünde enerjiyi GÖP veya GİP üzerinde doğrudan PTF/fiyat eşleşmesiyle satın.",
        "Dengeleme Güç Piyasası üzerinden düşük fiyattan uzlaştırılacak hacmi minimumda tutun.",
      ],
      expectedImpact:
        "Üretilen enerjinin tam piyasa takas fiyatından nakde dönüştürülmesi.",
    });
  }

  // KURAL 3: Sistematik Yanlılık (Bias) Kuralı
  if (systematicBias === "OVER_FORECASTING") {
    suggestions.push({
      id: "suggestion-bias-overforecast",
      title: "Tahmin Modelinde Aşırı Tahmin (Over-Forecasting) Kalibrasyonu",
      category: "CALIBRATION",
      priority: "HIGH",
      triggerRule: `En yüksek maliyetli saatlerin çoğunluğunda santral taahhüt ettiğinden daha az üretim yaptı (Aşırı Tahmin).`,
      description: `Tahmin modeli santralin fiili üretim kapasitesini düzenli olarak olduğundan yüksek tahmin etmektedir. Model parametrelerinin veya hava tahmin katsayılarının aşağı yönlü kalibre edilmesi gerekir.`,
      actionItems: [
        "Makine öğrenmesi / regresyon modellerinde son 30 günlük sapma eğilimine göre bias düzeltme katsayısı uygulayın.",
        "Santral türbin/panel degradasyonunu ve kirlilik katsayılarını güncelleyin.",
      ],
      expectedImpact: "Sistematik negatif dengesizlik cezalarında anında %30 iyileşme.",
    });
  } else if (systematicBias === "UNDER_FORECASTING") {
    suggestions.push({
      id: "suggestion-bias-underforecast",
      title: "Eksik Tahmin Sapması ve GÖP Gelir Hacminin Artırılması",
      category: "CALIBRATION",
      priority: "MEDIUM",
      triggerRule: `Santral yüksek maliyetli saatlerde düzenli olarak taahhüdünün üzerinde üretim yaptı (Eksik Tahmin).`,
      description: `Model santral potansiyelini ihtiyatlı tahmin ederek enerjinin GÖP yerine daha düşük marjla dengesizlik mekanizmasında satılmasına yol açmaktadır.`,
      actionItems: [
        "Tahmin tabanını yukarı çekerek GÖP satış hacmini maksimize edin.",
        "Rüzgar/güneş potansiyelini tam kapasite değerlendiren dinamik eşik değerleri kullanın.",
      ],
      expectedImpact: "GÖP üzerinden ek satış geliri ve minimum dengesizlik iskontosu.",
    });
  }

  // KURAL 4: Teknoloji Tipine Özel Kural (RES / HES / GES)
  if (plant.plantType === "RES") {
    suggestions.push({
      id: "suggestion-tech-res",
      title: "RES Meteoroloji İstasyonu ve Mikro-Klima Model Güncelleme Sıklığı",
      category: "TECHNOLOGY_SPECIFIC",
      priority: "HIGH",
      triggerRule: `Santral RES (Rüzgar) tipindedir; rüzgar hızı üretim üzerinde kübik (v³) etkiye sahiptir.`,
      description: `Rüzgar santrallerinde ani esinti veya rüzgar durması 1 saat içinde kurulu gücün %40'ı kadar sapma yaratabilir. Sayısal hava tahmin (NWP) modelleri sık güncellenmelidir.`,
      actionItems: [
        "Türbin anemometre verilerini tahmin algoritmasına gerçek zamanlı (SCADA) telemetri ile besleyin.",
        "6 saatlik genel hava tahminleri yerine saatlik yenilenen yüksek çözünürlüklü rüzgar modellerine geçin.",
      ],
      expectedImpact: "Rüzgar tahmin hatalarında %20 - %35 azalma.",
    });
  } else if (plant.plantType === "HES") {
    suggestions.push({
      id: "suggestion-tech-hes",
      title: "HES Rezervuar/Debi Yönetimi ve DGP YAL/YAT Arbitrajı",
      category: "TECHNOLOGY_SPECIFIC",
      priority: "HIGH",
      triggerRule: `Santral HES (Hidroelektrik) tipindedir; depolama ve hızlı yük alma/atma esnekliğine sahiptir.`,
      description: `HES santralleri portföy için doğal bir tampon (buffer) mekanizmasıdır. Dengesizlik cezası ödemek yerine su rezervuarı kontrol edilerek sistem açığında YAL (Yük Alma) teklifi verilebilir.`,
      actionItems: [
        "SMF'nin yüksek seyrettiği saatlerde türbinleri devreye sokarak yüksek fiyattan sisteme elektrik verin.",
        "DGP piyasasında saatlik bazda aktif YAL teklifleri vererek ek kazanç sağlayın.",
      ],
      expectedImpact: "Sıfır dengesizlik cezası ve pozitif YAL arbitraj karları.",
    });
  } else if (plant.plantType === "GES") {
    suggestions.push({
      id: "suggestion-tech-ges",
      title: "GES Bulutlanma Takibi (Nowcasting) ve Geçiş Saati Optimizasyonu",
      category: "TECHNOLOGY_SPECIFIC",
      priority: "MEDIUM",
      triggerRule: `Santral GES (Güneş) tipindedir; bulutluluk ve açısal radyasyon geçiş saatlerinde sapma yaratır.`,
      description: `Güneş santrallerinde en büyük dengesizlikler sabah 07-09 ve akşamüstü 16-18 saatlerinde güneş açısının değiştiği geçiş pencerelerinde gerçekleşir.`,
      actionItems: [
        "Uydu ve yer tabanlı radyasyon nowcasting modellerini devreye alın.",
        "Sabah ilk ışık ve akşam batım saatlerinde KGÖP bildirimlerini konservatif tutun.",
      ],
      expectedImpact: "Öngörülemeyen bulut örtüsü kaynaklı cezaların minimize edilmesi.",
    });
  }

  // KURAL 5: Hata Çarpanı Sıçraması (Error Rate Spike)
  if (errorRateRatio >= 1.5 && suggestions.length < 5) {
    suggestions.push({
      id: "suggestion-error-spike",
      title: "Uç Nokta (Outlier) Tahmin Hatalarına Karşı Güvenilirlik Filtresi",
      category: "CALIBRATION",
      priority: "MEDIUM",
      triggerRule: `Top saatlerdeki ortalama tahmin hatası (%${(topNMeanErrorRate * 100).toFixed(0)}), genel ortalamanın (%${(overallMeanErrorRate * 100).toFixed(0)}) ${errorRateRatio.toFixed(1)} katıdır.`,
      description: `Maliyetlerin büyük kısmı birkaç aşırı sapmalı saatte gerçekleşmektedir. Tahmin modellerine aşırı uç noktaları yumuşatan tolerans bantları eklenmelidir.`,
      actionItems: [
        "Tahmin motoruna güven aralığı (%90 confidence interval) filtresi ekleyin.",
        "Tarihsel volatilite eşiği aşıldığında alarm mekanizması çalıştırın.",
      ],
      expectedImpact: "Tek seferlik büyük maliyet şoklarının engellenmesi.",
    });
  }

  return suggestions.slice(0, 5);
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
        )}'i) seviyesinde kalmıştır. Yüksek tahmin doğruluğu ve düşük ceza oranıyla portföy yönetim hizmeti için son derece cazip ve düşük riskli bir profildir.`;
      } else if (assessment === "GOOD") {
        rationale = `${plant.plantName} (${plantType}), ${unitRevenue.toFixed(
          2
        )} ₺/MWh birim gelir ve ${unitImbalanceCost.toFixed(
          2
        )} ₺/MWh dengesizlik maliyeti ile dengeli bir performans sunmaktadır. Dengesizlik maliyetinin toplam gelire oranı (%${imbalanceCostRatio.toFixed(
          1
        )}) makul düzeydedir; GİP optimizasyonuyla karlılık marjı (%${(
          (netUnitMargin / unitRevenue) *
          100
        ).toFixed(1)}) daha da artırılabilir.`;
      } else if (assessment === "MODERATE") {
        rationale = `${plant.plantName} (${plantType}), ${unitImbalanceCost.toFixed(
          2
        )} ₺/MWh seviyesindeki dengesizlik maliyetiyle birim gelirin %${imbalanceCostRatio.toFixed(
          1
        )}'ini kaybetmektedir. Benzer teknolojiye sahip santrallere kıyasla operasyonel risk orta seviyededir; portföye alınmadan önce tahmin modelleri kalibre edilmelidir.`;
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
