/**
 * Enerji Üreticileri İçin Tahmin ve Dengesizlik Strateji Öneri Modülü
 */

export interface StrategyContext {
  plantType: "RES" | "HES" | "GES";
  historicalImbalanceTrend: "OVER_FORECASTING" | "UNDER_FORECASTING" | "BALANCED";
  avgPtf: number;
  avgSmf: number;
  systemDirectionTendency: "ENERGY_DEFICIT" | "ENERGY_SURPLUS" | "VOLATILE";
}

export interface StrategyRecommendation {
  summary: string;
  actionItems: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  expectedImpact: string;
}

/**
 * Santral tipi ve piyasa koşullarına göre optimizasyon stratejisi üretir
 */
export function generateStrategyRecommendation(
  context: StrategyContext
): StrategyRecommendation {
  const { plantType, historicalImbalanceTrend, systemDirectionTendency } = context;

  if (systemDirectionTendency === "ENERGY_DEFICIT") {
    // Sistemde enerji açığı var (SMF > PTF). Negatif dengesizlik (eksik üretim) çok maliyetlidir!
    if (plantType === "RES") {
      return {
        summary: "Sistem Enerji Açığı Yönünde: Eksik Tahmin/Üretim Cezası Çok Yüksek",
        actionItems: [
          "Rüzgar tahmin modellerinizi muhafazakar (conservative) tarafa yaklaştırın.",
          "Eksik üretim durumunda Max(PTF, SMF) cezası ödememek adına KGÖP taahhüdünü %5-8 oranında aşağı yönlü revize edin.",
          "Gün İçi Piyasası (GİP) üzerinde son 1-2 saatlik pencerede pozisyon kapatın.",
        ],
        riskLevel: "HIGH",
        expectedImpact: "Negatif dengesizlik cezalarında %20-35 oranında tasarruf.",
      };
    }

    if (plantType === "HES") {
      return {
        summary: "Sistem Enerji Açığı Yönünde: HES Baraj/Kanal Depolama Fırsatı",
        actionItems: [
          "Su rezervuarını SMF'nin zirve yaptığı saatlerde devreye sokacak şekilde planlayın.",
          "Piyasa Takas Fiyatının üzerinde kalan saatlerde Dengeleme Güç Piyasası (DGP) YAL (Yük Alma) teklifleri verin.",
        ],
        riskLevel: "LOW",
        expectedImpact: "Ek YAL gelirleri ve sıfır dengesizlik cezası.",
      };
    }

    if (plantType === "GES") {
      return {
        summary: "Sistem Enerji Açığı Yönünde: Bulutlanma Riskine Karşı Temkinli Tahmin",
        actionItems: [
          "Öğle saatleri dışındaki (sabah 07-09, akşamüstü 16-18) geçiş saatlerinde üretim tahminini düşük tutun.",
          "Ani bulutlanma kaynaklı eksik üretim riskine karşı GİP'te alış pozisyonu hazırlığı yapın.",
        ],
        riskLevel: "MEDIUM",
        expectedImpact:
          "Pik saatlerde oluşabilecek negatif dengesizlik riskini minimize etme.",
      };
    }
  }

  if (systemDirectionTendency === "ENERGY_SURPLUS") {
    // Sistemde enerji fazlası var (SMF < PTF). Pozitif dengesizlik satış fiyatı düşüktür (Min(PTF, SMF)).
    return {
      summary: "Sistem Enerji Fazlası Yönünde: Fazla Üretim İskontolu Satılmaktadır",
      actionItems: [
        "Sisteme fazla verilen enerji Min(PTF, SMF) üzerinden iskontolu alınmaktadır.",
        "Üretim tahminlerini gerçekçi tutarak GÖP'te mümkün olan en yüksek hacmi PTF üzerinden satmayı hedefleyin.",
        "Özellikle RES ve GES santralleri için fazla enerji üretme durumunda GİP üzerinden satış yapmayı değerlendirin.",
      ],
      riskLevel: "MEDIUM",
      expectedImpact:
        "GÖP satış gelirinin optimize edilmesi ve düşük fiyattan dengesizlik satışının önlenmesi.",
    };
  }

  return {
    summary: "Dengeli Piyasa Koşulları",
    actionItems: [
      "Standart tahmin modellerine devam edin.",
      "Tolerans katsayısı (%3) dahilinde kalacak şekilde portföy içi dengeleme yapın.",
    ],
    riskLevel: "LOW",
    expectedImpact: "Stabil operasyonel verimlilik.",
  };
}
