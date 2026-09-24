/**
 * TR-Energy Analyst Pure Calculation Engine
 *
 * Tüm fonksiyonlar SAF (pure) olarak tasarlanmıştır:
 * - Dışsal yan etkisi yoktur (No side-effects, no I/O, no DB).
 * - Aynı girdiler her zaman aynı çıktıları üretir.
 */

import {
  DateRange,
  DEFAULT_IMBALANCE_PROFILE,
  HourlyRecord,
  HourlyResult,
  ImbalancePricingProfile,
  ImbalanceProfile,
  MarketPriceRecord,
  PlantHourlyInput,
  resolveImbalanceProfile,
  SystemDirection,
} from "./types";

/**
 * 1. calculateImbalance(actualMwh, forecastMwh): number
 * → actualMwh - forecastMwh (pozitif = pozitif dengesizlik, negatif = negatif dengesizlik)
 */
export function calculateImbalance(actualMwh: number, forecastMwh: number): number {
  return actualMwh - forecastMwh;
}

/**
 * 2. calculatePositiveImbalancePrice(ptf, smf, systemDirection, profile): number
 * → systemDirection === 'SURPLUS' ise: min(ptf, smf) * profile.positiveSurplusCoef
 * → systemDirection === 'DEFICIT' veya 'BALANCED' ise: min(ptf, smf) * profile.positiveOtherCoef
 */
export function calculatePositiveImbalancePrice(
  ptf: number,
  smf: number,
  systemDirection: SystemDirection,
  profile: ImbalancePricingProfile
): number {
  const basePrice = Math.min(ptf, smf);
  if (systemDirection === "SURPLUS") {
    return basePrice * profile.positiveSurplusCoef;
  }
  return basePrice * profile.positiveOtherCoef;
}

/**
 * 3. calculateNegativeImbalancePrice(ptf, smf, systemDirection, profile): number
 * → systemDirection === 'DEFICIT' ise: max(ptf, smf) * profile.negativeDeficitCoef
 * → systemDirection === 'SURPLUS' veya 'BALANCED' ise: max(ptf, smf) * profile.negativeOtherCoef
 */
export function calculateNegativeImbalancePrice(
  ptf: number,
  smf: number,
  systemDirection: SystemDirection,
  profile: ImbalancePricingProfile
): number {
  const basePrice = Math.max(ptf, smf);
  if (systemDirection === "DEFICIT") {
    return basePrice * profile.negativeDeficitCoef;
  }
  return basePrice * profile.negativeOtherCoef;
}

/**
 * 4. calculateImbalanceAmount(imbalance, positivePrice, negativePrice): number
 * → imbalance > 0: imbalance * positivePrice
 * → imbalance < 0: imbalance * negativePrice (imbalance negatif olduğu için sonuç negatif TL çıkar)
 * → imbalance == 0: 0
 */
export function calculateImbalanceAmount(
  imbalance: number,
  positivePrice: number,
  negativePrice: number
): number {
  if (imbalance > 0) {
    return imbalance * positivePrice;
  }
  if (imbalance < 0) {
    return imbalance * negativePrice;
  }
  return 0;
}

/**
 * 5. calculateDayAheadSalesAmount(forecastMwh, ptf): number
 * → forecastMwh * ptf
 */
export function calculateDayAheadSalesAmount(forecastMwh: number, ptf: number): number {
  return forecastMwh * ptf;
}

/**
 * 6. calculateTotalRevenue(dayAheadSalesAmount, imbalanceAmount): number
 * → toplamı döndür
 */
export function calculateTotalRevenue(
  dayAheadSalesAmount: number,
  imbalanceAmount: number
): number {
  return dayAheadSalesAmount + imbalanceAmount;
}

/**
 * 7. calculateUnitRevenue(totalRevenue, actualMwh): number
 * → actualMwh sıfır veya negatifse 0 döndürür (bölme hatası engelleme),
 *   aksi halde totalRevenue / actualMwh
 */
export function calculateUnitRevenue(totalRevenue: number, actualMwh: number): number {
  if (!actualMwh || actualMwh <= 0 || isNaN(actualMwh) || !isFinite(totalRevenue)) {
    return 0;
  }
  return totalRevenue / actualMwh;
}

/**
 * 8. calculateFictiveRevenue(actualMwh, ptf): number
 * → tahmin hatasız olsaydı (forecast = actual) elde edilecek gelir = actualMwh * ptf
 */
export function calculateFictiveRevenue(actualMwh: number, ptf: number): number {
  return actualMwh * ptf;
}

/**
 * 9. calculateImbalanceCost(fictiveRevenue, totalRevenue): number
 * → fictiveRevenue - totalRevenue
 */
export function calculateImbalanceCost(
  fictiveRevenue: number,
  totalRevenue: number
): number {
  return fictiveRevenue - totalRevenue;
}

/**
 * 10. calculateUnitImbalanceCost(imbalanceCost, actualMwh): number
 * → actualMwh sıfır veya negatifse 0, aksi halde imbalanceCost / actualMwh
 */
export function calculateUnitImbalanceCost(
  imbalanceCost: number,
  actualMwh: number
): number {
  if (!actualMwh || actualMwh <= 0 || isNaN(actualMwh) || !isFinite(imbalanceCost)) {
    return 0;
  }
  return imbalanceCost / actualMwh;
}

/**
 * Girdi Doğrulama ve Güvenli Temizleme (Sanitization)
 * Negatif üretim, NaN ve hatalı fiyatları tespit eder ve kullanıcıya anlamlı uyarılar döndürür.
 */
export interface HourlyValidationResult {
  isValid: boolean;
  sanitized: {
    actualMwh: number;
    forecastMwh: number;
    ptf: number;
    smf: number;
  };
  warnings: string[];
}

export function validateHourlyInput(
  actualMwh: number,
  forecastMwh: number,
  ptf: number,
  smf: number
): HourlyValidationResult {
  const warnings: string[] = [];

  let cleanActual = Number(actualMwh);
  if (isNaN(cleanActual)) {
    warnings.push("Gerçekleşen üretim (actualMwh) sayısal değil, 0 kabul edildi.");
    cleanActual = 0;
  } else if (cleanActual < 0) {
    warnings.push(
      `Gerçekleşen üretim negatif olamaz (${cleanActual} MWh). Fiziksel sınıra çekilip 0 kabul edildi.`
    );
    cleanActual = 0;
  }

  let cleanForecast = Number(forecastMwh);
  if (isNaN(cleanForecast)) {
    warnings.push("Tahmin üretimi (forecastMwh) sayısal değil, 0 kabul edildi.");
    cleanForecast = 0;
  } else if (cleanForecast < 0) {
    warnings.push(
      `Tahmin üretimi negatif olamaz (${cleanForecast} MWh). 0 kabul edildi.`
    );
    cleanForecast = 0;
  }

  let cleanPtf = Number(ptf);
  if (isNaN(cleanPtf) || cleanPtf < 0) {
    warnings.push(`PTF geçersiz (${ptf}). 0 kabul edildi.`);
    cleanPtf = Math.max(0, isNaN(cleanPtf) ? 0 : cleanPtf);
  }

  let cleanSmf = Number(smf);
  if (isNaN(cleanSmf) || cleanSmf < 0) {
    warnings.push(`SMF geçersiz (${smf}). 0 kabul edildi.`);
    cleanSmf = Math.max(0, isNaN(cleanSmf) ? 0 : cleanSmf);
  }

  return {
    isValid: warnings.length === 0,
    sanitized: {
      actualMwh: cleanActual,
      forecastMwh: cleanForecast,
      ptf: cleanPtf,
      smf: cleanSmf,
    },
    warnings,
  };
}

/**
 * Zaman serisinde eksik saatleri (gaps) tespit eder.
 */
export function detectMissingHours(
  timestamps: (Date | string)[]
): {
  hasMissingHours: boolean;
  missingHoursCount: number;
  missingGaps: Array<{ expected: Date; actualNext: Date; hoursMissing: number }>;
} {
  if (timestamps.length <= 1) {
    return { hasMissingHours: false, missingHoursCount: 0, missingGaps: [] };
  }

  const sortedTimes = timestamps
    .map((t) => new Date(t).getTime())
    .sort((a, b) => a - b);

  const missingGaps: Array<{ expected: Date; actualNext: Date; hoursMissing: number }> = [];
  let totalMissing = 0;
  const ONE_HOUR_MS = 60 * 60 * 1000;

  for (let i = 0; i < sortedTimes.length - 1; i++) {
    const current = sortedTimes[i];
    const next = sortedTimes[i + 1];
    const diffHours = Math.round((next - current) / ONE_HOUR_MS);

    if (diffHours > 1) {
      const missingCount = diffHours - 1;
      totalMissing += missingCount;
      missingGaps.push({
        expected: new Date(current + ONE_HOUR_MS),
        actualNext: new Date(next),
        hoursMissing: missingCount,
      });
    }
  }

  return {
    hasMissingHours: totalMissing > 0,
    missingHoursCount: totalMissing,
    missingGaps,
  };
}

/**
 * processHourlyRecord(hourlyRecord, marketPriceRecord, profile): HourlyResult
 * → Yukarıdaki tüm alanları hesaplayıp tek bir obje döndürür.
 */
export function processHourlyRecord(
  hourlyRecord: HourlyRecord,
  marketPriceRecord: MarketPriceRecord,
  profile: ImbalancePricingProfile = DEFAULT_IMBALANCE_PROFILE
): HourlyResult {
  const { actualMwh, forecastMwh, timestamp } = hourlyRecord;
  const { ptf, smf, systemDirection } = marketPriceRecord;
  // Mevzuat modunda katsayılar saatin tarihine göre seçilir (2026 öncesi sabit %3)
  const effectiveProfile = resolveImbalanceProfile(profile, timestamp);

  // 1. Dengesizlik miktarı (MWh)
  const imbalanceMwh = calculateImbalance(actualMwh, forecastMwh);

  // 2 & 3. Dengesizlik birim fiyatları (TL/MWh)
  const positivePrice = calculatePositiveImbalancePrice(
    ptf,
    smf,
    systemDirection,
    effectiveProfile
  );
  const negativePrice = calculateNegativeImbalancePrice(
    ptf,
    smf,
    systemDirection,
    effectiveProfile
  );

  // 4. Dengesizlik tutarı (TL)
  const imbalanceAmount = calculateImbalanceAmount(
    imbalanceMwh,
    positivePrice,
    negativePrice
  );

  // 5. Gün Öncesi Piyasası satış geliri (TL)
  const dayAheadSalesAmount = calculateDayAheadSalesAmount(forecastMwh, ptf);

  // 6. Toplam gerçekleşen gelir (TL)
  const totalRevenue = calculateTotalRevenue(dayAheadSalesAmount, imbalanceAmount);

  // 7. Birim gerçekleşen gelir (TL/MWh)
  const unitRevenue = calculateUnitRevenue(totalRevenue, actualMwh);

  // 8. Fiktif gelir (Tahmin hatasız olsaydı elde edilecek gelir) (TL)
  const fictiveRevenue = calculateFictiveRevenue(actualMwh, ptf);

  // 9. Dengesizlik maliyeti (Kayıp / Kazanç farkı) (TL)
  const imbalanceCost = calculateImbalanceCost(fictiveRevenue, totalRevenue);

  // 10. Birim dengesizlik maliyeti (TL/MWh)
  const unitImbalanceCost = calculateUnitImbalanceCost(imbalanceCost, actualMwh);

  return {
    timestamp,
    actualMwh,
    forecastMwh,
    ptf,
    smf,
    systemDirection,
    imbalanceMwh,
    positivePrice,
    negativePrice,
    imbalanceAmount,
    dayAheadSalesAmount,
    totalRevenue,
    unitRevenue,
    fictiveRevenue,
    imbalanceCost,
    unitImbalanceCost,
    gipPrice: marketPriceRecord.gipPrice ?? null,
    gipVolumeMwh: marketPriceRecord.gipVolumeMwh ?? null,
    gipMinPrice: marketPriceRecord.gipMinPrice ?? null,
    gipMaxPrice: marketPriceRecord.gipMaxPrice ?? null,
    plantId: hourlyRecord.plantId,
    plantName: hourlyRecord.plantName,
  };
}

/**
 * processPlant(plantId, dateRange, records, profile): HourlyResult[]
 * → Santral ID'sine ve verilen tarih aralığına göre kayıtları filtreleyip
 * tüm saatlik kayıtları işleyerek HourlyResult[] döndüren saf fonksiyon.
 */
export function processPlant(
  plantId: string,
  dateRange: DateRange,
  records: PlantHourlyInput[],
  profile: ImbalancePricingProfile = DEFAULT_IMBALANCE_PROFILE
): HourlyResult[] {
  const startTime = new Date(dateRange.start).getTime();
  const endTime = new Date(dateRange.end).getTime();

  return records
    .filter((entry) => {
      if (entry.plantId !== plantId) return false;
      const recordTime = new Date(entry.hourlyRecord.timestamp).getTime();
      return recordTime >= startTime && recordTime <= endTime;
    })
    .sort((a, b) => {
      const timeA = new Date(a.hourlyRecord.timestamp).getTime();
      const timeB = new Date(b.hourlyRecord.timestamp).getTime();
      return timeA - timeB;
    })
    .map((entry) =>
      processHourlyRecord(entry.hourlyRecord, entry.marketPriceRecord, profile)
    );
}
