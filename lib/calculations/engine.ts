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
  regulatoryRegimeAt,
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

/** 2026 fiyat kuralları (DUY md. 110, yürürlük 1/1/2026): V ve B birim fiyatları (başlangıç değerleri, TL/MWh) */
export const IMBALANCE_FLOOR_V = 150;
export const IMBALANCE_NEGATIVE_B = 100;

/** Pozitif dengesizlik fiyatının tabanı (katsayıdan önce): 2026 kurallarında MIN(PTF, SMF) < V ise −B */
const positiveBase = (low: number, floors: boolean | undefined) => (floors && low < IMBALANCE_FLOOR_V ? -IMBALANCE_NEGATIVE_B : low);
/** Negatif dengesizlik fiyatının tabanı: 2026 kurallarında en az V */
const negativeBase = (high: number, floors: boolean | undefined) => (floors ? Math.max(IMBALANCE_FLOOR_V, high) : high);

const positiveCoef = (dir: SystemDirection, p: ImbalancePricingProfile) => (dir === "SURPLUS" ? p.positiveSurplusCoef : p.positiveOtherCoef);
const negativeCoef = (dir: SystemDirection, p: ImbalancePricingProfile) => (dir === "DEFICIT" ? p.negativeDeficitCoef : p.negativeOtherCoef);

/**
 * 2. calculatePositiveImbalancePrice(ptf, smf, systemDirection, profile): number (formül; resmi fiyat için imbalancePrices)
 * → taban = min(ptf, smf); profile.floors ise taban < 150 → −100 (2026 kuralı)
 * → systemDirection === 'SURPLUS' ise: taban * profile.positiveSurplusCoef
 * → systemDirection === 'DEFICIT' veya 'BALANCED' ise: taban * profile.positiveOtherCoef
 */
export function calculatePositiveImbalancePrice(
  ptf: number,
  smf: number,
  systemDirection: SystemDirection,
  profile: ImbalancePricingProfile
): number {
  return positiveBase(Math.min(ptf, smf), profile.floors) * positiveCoef(systemDirection, profile);
}

/**
 * 3. calculateNegativeImbalancePrice(ptf, smf, systemDirection, profile): number (formül; resmi fiyat için imbalancePrices)
 * → taban = max(ptf, smf); profile.floors ise en az 150 (2026 kuralı)
 * → systemDirection === 'DEFICIT' ise: taban * profile.negativeDeficitCoef
 * → systemDirection === 'SURPLUS' veya 'BALANCED' ise: taban * profile.negativeOtherCoef
 */
export function calculateNegativeImbalancePrice(
  ptf: number,
  smf: number,
  systemDirection: SystemDirection,
  profile: ImbalancePricingProfile
): number {
  return negativeBase(Math.max(ptf, smf), profile.floors) * negativeCoef(systemDirection, profile);
}

/** Fiyatlamaya giren piyasa alanları (MarketPriceRecord ve HourlyResult ikisi de uyar) */
export type PricedMarket = Pick<MarketPriceRecord, "timestamp" | "ptf" | "smf" | "systemDirection" | "imbalancePosPrice" | "imbalanceNegPrice">;

/** Bir saatlik sonuçtan ya da piyasa kaydından fiyatlamaya giren alanlar (resmi fiyatlar dahil). Yeniden fiyatlama yapan analizler bunu kullanır. */
export const pricedMarket = (m: PricedMarket): PricedMarket => ({
  timestamp: m.timestamp,
  ptf: m.ptf,
  smf: m.smf,
  systemDirection: m.systemDirection,
  imbalancePosPrice: m.imbalancePosPrice ?? null,
  imbalanceNegPrice: m.imbalanceNegPrice ?? null,
});

/**
 * Saatin pozitif ve negatif dengesizlik fiyatı. EPİAŞ'ın resmi fiyatı varsa o esas alınır: resmi fiyat, saatin kendi
 * tarihindeki mevzuat katsayısına bölünerek tabana çevrilir (pozitif: resmi / (1 − l), negatif: resmi / (1 + k)) ve
 * uygulanan profilin katsayısıyla çarpılır. Böylece mevzuat profili saatin kendi tarihinde resmi fiyatı birebir verir;
 * başka bir katsayı kuralı (ör. 2026 kurallarının 2025 verisine uygulanması, ayrıştırmadaki katsayı değişimi) aynı
 * tabana uygulanır. Resmi taban 15 dakikalık SMF, taban ve negatif fiyat kurallarını zaten içerir; 2026 kuralları
 * (floors) yalnızca kendi tarihinde bu kuralları içermeyen tabana (resmi fiyatı olmayan saat, 2026 öncesi saat) ayrıca
 * uygulanır.
 */
export function imbalancePrices(market: PricedMarket, effectiveProfile: ImbalancePricingProfile): { positive: number; negative: number } {
  const { low, high } = imbalanceBases(market, effectiveProfile.floors);
  return { positive: low * positiveCoef(market.systemDirection, effectiveProfile), negative: high * negativeCoef(market.systemDirection, effectiveProfile) };
}

/**
 * Katsayıdan önceki taban fiyatlar: pozitif fiyat = low × (1 − l), negatif fiyat = high × (1 + k). Resmi fiyat varsa
 * saatin kendi tarihindeki katsayıya bölünerek bulunur; yoksa MIN / MAX(PTF, SMF). `floors`: 2026 taban ve negatif fiyat
 * kuralları, kendi tarihinde bu kuralları içermeyen tabana uygulanır.
 */
export function imbalanceBases(market: PricedMarket, floors: boolean | undefined): { low: number; high: number } {
  const { ptf, smf, systemDirection: dir } = market;
  const own = regulatoryRegimeAt(market.timestamp).coefficients;
  const officialPos = market.imbalancePosPrice ?? null;
  const officialNeg = market.imbalanceNegPrice ?? null;
  const low = officialPos !== null ? officialPos / positiveCoef(dir, own) : Math.min(ptf, smf);
  const high = officialNeg !== null ? officialNeg / negativeCoef(dir, own) : Math.max(ptf, smf);
  return {
    low: officialPos !== null && own.floors ? low : positiveBase(low, floors),
    high: officialNeg !== null && own.floors ? high : negativeBase(high, floors),
  };
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
 * Net sapmanın dengesizlik maliyeti: processHourlyRecord(...).imbalanceCost ile aynı sonuç, ara nesne üretmeden.
 * Aynı saatte birçok bileşimin fiyatlandığı taramalar (aday santral, alt grup) için.
 */
export function imbalanceCostOf(imbalanceMwh: number, market: PricedMarket, profile: ImbalancePricingProfile): number {
  if (imbalanceMwh === 0) return 0;
  const prices = imbalancePrices(market, resolveImbalanceProfile(profile, market.timestamp));
  if (imbalanceMwh > 0) return imbalanceMwh * (market.ptf - prices.positive);
  return -imbalanceMwh * (prices.negative - market.ptf);
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

  // 2 & 3. Dengesizlik birim fiyatları (TL/MWh): EPİAŞ resmi fiyatı varsa o, yoksa mevzuat formülü
  const { positive: positivePrice, negative: negativePrice } = imbalancePrices(marketPriceRecord, effectiveProfile);

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
    imbalancePosPrice: marketPriceRecord.imbalancePosPrice ?? null,
    imbalanceNegPrice: marketPriceRecord.imbalanceNegPrice ?? null,
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
