/**
 * Türkiye Elektrik Piyasası (DGP / EPİAŞ) Dengesizlik Hesaplama Modülü
 */

export type SystemDirection = "ENERGY_DEFICIT" | "ENERGY_SURPLUS" | "IN_BALANCE";

export interface ImbalanceInput {
  actualMwh: number; // Gerçekleşen Üretim (MWh)
  forecastMwh: number; // Gün Öncesi Tahmini (KGÜP) (MWh)
  ptf: number; // Piyasa Takas Fiyatı (TL/MWh)
  smf: number; // Sistem Marjinal Fiyatı (TL/MWh)
  kFactor?: number; // Dengesizlik ceza katsayısı (varsayılan: %3 yani 0.03)
}

export interface ImbalanceResult {
  imbalanceMwh: number; // Dengesizlik Miktarı (Pozitif: Fazla Üretim, Negatif: Eksik Üretim)
  systemDirection: SystemDirection;
  unitPriceTl: number; // Dengesizlik birim uzlaştırma fiyatı
  imbalanceAmountTl: number; // Pozitif dengesizlik alacağı veya Negatif dengesizlik borcu
  penaltyCostTl: number; // İdeal duruma (PTF'den satmaya) göre oluşan net maliyet/kayıp
}

/**
 * Sistem Yönü Tespiti
 * SMF > PTF -> Enerji Açığı (Sistemde enerji yetersiz)
 * SMF < PTF -> Enerji Fazlası (Sistemde gereğinden fazla enerji var)
 * SMF == PTF -> Dengede
 */
export function determineSystemDirection(ptf: number, smf: number): SystemDirection {
  if (smf > ptf) return "ENERGY_DEFICIT";
  if (smf < ptf) return "ENERGY_SURPLUS";
  return "IN_BALANCE";
}

/**
 * Dengesizlik Miktarı: Gerçekleşen - Tahmin
 */
export function calculateImbalanceMwh(actualMwh: number, forecastMwh: number): number {
  return Number((actualMwh - forecastMwh).toFixed(4));
}

/**
 * EPİAŞ Mevzuatına Uygun Dengesizlik Tutarı ve Maliyet Hesaplama
 *
 * Pozitif Dengesizlik (actual > forecast):
 * Üretici sisteme fazla enerji vermiştir.
 * Satış Birim Fiyatı = Min(PTF, SMF) * (1 - k)
 *
 * Negatif Dengesizlik (actual < forecast):
 * Üretici taahhüt ettiğinden az enerji üretmiştir, eksik enerjiyi sistemden satın alır.
 * Alış Birim Fiyatı = Max(PTF, SMF) * (1 + k)
 */
export function calculateImbalanceCost({
  actualMwh,
  forecastMwh,
  ptf,
  smf,
  kFactor = 0.03,
}: ImbalanceInput): ImbalanceResult {
  const imbalanceMwh = calculateImbalanceMwh(actualMwh, forecastMwh);
  const systemDirection = determineSystemDirection(ptf, smf);

  if (imbalanceMwh === 0) {
    return {
      imbalanceMwh: 0,
      systemDirection,
      unitPriceTl: ptf,
      imbalanceAmountTl: 0,
      penaltyCostTl: 0,
    };
  }

  if (imbalanceMwh > 0) {
    // Pozitif dengesizlik (Fazla üretim satışı)
    const unitPriceTl = Math.min(ptf, smf) * (1 - kFactor);
    const imbalanceAmountTl = imbalanceMwh * unitPriceTl;
    // Eğer üretici bu fazla enerjiyi GÖP'te doğru tahmin etseydi PTF'den satacaktı:
    const potentialGopRevenue = imbalanceMwh * ptf;
    const penaltyCostTl = Math.max(0, potentialGopRevenue - imbalanceAmountTl);

    return {
      imbalanceMwh,
      systemDirection,
      unitPriceTl: Number(unitPriceTl.toFixed(2)),
      imbalanceAmountTl: Number(imbalanceAmountTl.toFixed(2)),
      penaltyCostTl: Number(penaltyCostTl.toFixed(2)),
    };
  } else {
    // Negatif dengesizlik (Eksik üretim alımı)
    const absImbalance = Math.abs(imbalanceMwh);
    const unitPriceTl = Math.max(ptf, smf) * (1 + kFactor);
    const imbalanceAmountTl = -(absImbalance * unitPriceTl);
    // GÖP'te satılan miktar PTF üzerinden tahsil edilmişti, ancak eksik kısım ceza ile geri ödenir:
    const gopRevenueCollected = absImbalance * ptf;
    const penaltyCostTl = Math.max(0, absImbalance * unitPriceTl - gopRevenueCollected);

    return {
      imbalanceMwh,
      systemDirection,
      unitPriceTl: Number(unitPriceTl.toFixed(2)),
      imbalanceAmountTl: Number(imbalanceAmountTl.toFixed(2)),
      penaltyCostTl: Number(penaltyCostTl.toFixed(2)),
    };
  }
}
