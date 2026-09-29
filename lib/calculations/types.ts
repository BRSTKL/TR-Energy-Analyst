/**
 * TR-Energy Analyst Hesaplama Motoru Tip Tanımları
 */

export type SystemDirection = "SURPLUS" | "DEFICIT" | "BALANCED";

export type ImbalanceProfileMode = "REGULATORY" | "CUSTOM";

export interface ImbalancePricingProfile {
  id?: string;
  projectId?: string;
  name?: string;
  /**
   * REGULATORY: katsayılar her saatin tarihine göre mevzuattan seçilir (aşağıdaki alanlar yalnızca
   *   güncel rejimi gösterir). CUSTOM: aşağıdaki katsayılar her tarihe aynen uygulanır.
   * Tanımsızsa CUSTOM kabul edilir; böylece elle kurulan katsayı nesneleri beklendiği gibi çalışır.
   */
  mode?: ImbalanceProfileMode;
  positiveSurplusCoef: number; // örn: 0.94
  positiveOtherCoef: number; // örn: 0.97
  negativeDeficitCoef: number; // örn: 1.06
  negativeOtherCoef: number; // örn: 1.03
  /**
   * 2026 fiyat kuralları (DUY md. 110, RG 29/12/2025, yürürlük 1/1/2026): negatif dengesizlik fiyatı en az
   * V (150 TL/MWh) × (1 + k); MIN(PTF, SMF) < V ise pozitif dengesizlik fiyatı −B (100 TL/MWh) × (1 − l).
   * REGULATORY profilde saatin tarihine göre seçilir; CUSTOM profilde tanımsızsa uygulanmaz.
   */
  floors?: boolean;
}

/** Geriye dönük uyumluluk takma adı */
export type ImbalanceProfile = ImbalancePricingProfile;

/**
 * Mevzuattaki dengesizlik katsayı rejimleri (DUY md. 110, EPDK Kurul kararları).
 * Formül: pozitif = MIN(PTF,SMF) × (1 − l), negatif = MAX(PTF,SMF) × (1 + k).
 *
 * - 2026 öncesi: k = l = 0,03, sistem yönünden bağımsız.
 * - 1 Ocak 2026'dan itibaren: sapma yönü sistem yönüyle AYNIYSA %6, değilse (veya sistem dengedeyse) %3.
 *   (EPDK "k ve l Katsayılarının 1/1/2026 tarihinden itibaren Belirlenmesine İlişkin Kurul Kararı".) Ayrıca taban
 *   ve negatif fiyat kuralları (floors): negatif fiyat ≥ 150 × (1 + k); MIN(PTF, SMF) < 150 ise pozitif fiyat −100 × (1 − l).
 *
 * Tarihler Türkiye duvar saatidir (uygulamanın zaman damgası kuralıyla aynı: UTC alanlarında saklanır).
 */
export const REGULATORY_IMBALANCE_REGIMES: {
  from: string;
  label: string;
  coefficients: Omit<ImbalancePricingProfile, "id" | "projectId" | "name" | "mode">;
}[] = [
  {
    from: "0000-01-01",
    label: "Sabit %3 (2026 öncesi)",
    coefficients: {
      positiveSurplusCoef: 0.97,
      positiveOtherCoef: 0.97,
      negativeDeficitCoef: 1.03,
      negativeOtherCoef: 1.03,
      floors: false,
    },
  },
  {
    from: "2026-01-01",
    label: "Sistem yönüne bağlı %3 / %6 (2026+)",
    coefficients: {
      positiveSurplusCoef: 0.94,
      positiveOtherCoef: 0.97,
      negativeDeficitCoef: 1.06,
      negativeOtherCoef: 1.03,
      floors: true,
    },
  },
];

const REGIME_STARTS = REGULATORY_IMBALANCE_REGIMES.map((r) => Date.parse(`${r.from}T00:00:00Z`));

/** Verilen saat için geçerli mevzuat rejimi */
export function regulatoryRegimeAt(timestamp: Date | string) {
  const t = new Date(timestamp).getTime();
  let idx = 0;
  for (let i = 0; i < REGIME_STARTS.length; i++) if (t >= REGIME_STARTS[i]) idx = i;
  return REGULATORY_IMBALANCE_REGIMES[idx];
}

/**
 * Bir saatin fiyatlanmasında kullanılacak katsayıları döndürür.
 * REGULATORY profilde tarih rejimi, CUSTOM (veya modu tanımsız) profilde profilin kendi katsayıları.
 */
export function resolveImbalanceProfile(
  profile: ImbalancePricingProfile,
  timestamp: Date | string
): ImbalancePricingProfile {
  if (profile.mode !== "REGULATORY") return profile;
  return { ...profile, ...regulatoryRegimeAt(timestamp).coefficients };
}

/** Veritabanı satırını (veya yokluğunu) hesaplama profiline çevirir. */
export function toPricingProfile(
  row:
    | {
        mode?: string | null;
        positiveSurplusCoef: number;
        positiveOtherCoef: number;
        negativeDeficitCoef: number;
        negativeOtherCoef: number;
      }
    | null
    | undefined
): ImbalancePricingProfile {
  if (!row) return DEFAULT_IMBALANCE_PROFILE;
  return {
    mode: row.mode === "CUSTOM" ? "CUSTOM" : "REGULATORY",
    positiveSurplusCoef: row.positiveSurplusCoef,
    positiveOtherCoef: row.positiveOtherCoef,
    negativeDeficitCoef: row.negativeDeficitCoef,
    negativeOtherCoef: row.negativeOtherCoef,
  };
}

/**
 * Standart EPİAŞ profili: mevzuat modu. Katsayı alanları güncel (2026+) rejimi gösterir:
 * - Pozitif Dengesizlik (SURPLUS): 0.94, (DEFICIT / BALANCED): 0.97
 * - Negatif Dengesizlik (DEFICIT): 1.06, (SURPLUS / BALANCED): 1.03
 * 2026 öncesi saatler resolveImbalanceProfile ile 0.97 / 1.03 üzerinden fiyatlanır.
 */
export const DEFAULT_IMBALANCE_PROFILE: ImbalancePricingProfile = {
  mode: "REGULATORY",
  positiveSurplusCoef: 0.94,
  positiveOtherCoef: 0.97,
  negativeDeficitCoef: 1.06,
  negativeOtherCoef: 1.03,
  floors: true,
};

/**
 * EPİAŞ'ın saat için uyguladığı resmi dengesizlik fiyatları (TL/MWh): sistemin pozitif / negatif dengesizlik tutarı
 * bölü miktarı (Şeffaflık Platformu imbalance-amount / imbalance-quantity). 2026'daki 15 dakikalık SMF, taban ve negatif
 * fiyat kurallarını içerir. Yoksa (eski veri, çok küçük sistem dengesizliği) null: fiyat formülden hesaplanır.
 */
export interface OfficialImbalancePrices {
  imbalancePosPrice?: number | null;
  imbalanceNegPrice?: number | null;
}

export interface HourlyRecord {
  timestamp: Date | string;
  actualMwh: number;
  forecastMwh: number;
  plantId?: string;
  plantName?: string;
}

export interface MarketPriceRecord extends OfficialImbalancePrices {
  timestamp: Date | string;
  ptf: number;
  smf: number;
  systemDirection: SystemDirection;
  gipPrice?: number | null;
  /** GİP saatlik kontratında eşleşen miktar ve en düşük / en yüksek eşleşme fiyatı (yoksa null) */
  gipVolumeMwh?: number | null;
  gipMinPrice?: number | null;
  gipMaxPrice?: number | null;
}

export interface HourlyResult extends OfficialImbalancePrices {
  timestamp: Date | string;
  actualMwh: number;
  forecastMwh: number;
  ptf: number;
  smf: number;
  systemDirection: SystemDirection;
  imbalanceMwh: number;
  positivePrice: number;
  negativePrice: number;
  imbalanceAmount: number;
  dayAheadSalesAmount: number;
  totalRevenue: number;
  unitRevenue: number;
  fictiveRevenue: number;
  imbalanceCost: number;
  unitImbalanceCost: number;
  gipPrice?: number | null;
  /** GİP saatlik kontratında eşleşen miktar ve en düşük / en yüksek eşleşme fiyatı (yoksa null) */
  gipVolumeMwh?: number | null;
  gipMinPrice?: number | null;
  gipMaxPrice?: number | null;
  plantId?: string;
  plantName?: string;
}

export interface PlantHourlyInput {
  plantId: string;
  plantName?: string;
  hourlyRecord: HourlyRecord;
  marketPriceRecord: MarketPriceRecord;
}

export interface DateRange {
  start: Date | string;
  end: Date | string;
}

export interface MonthlyAggregate {
  plantId?: string;
  plantName?: string;
  year: number;
  month: number; // 1-12
  yearMonth: string; // "YYYY-MM"
  totalDayAheadSalesAmount: number;
  totalImbalanceAmount: number;
  totalRevenue: number;
  totalActualMwh: number;
  unitRevenue: number; // totalRevenue / totalActualMwh (0 if totalActualMwh === 0)
  totalImbalanceCost: number;
  unitImbalanceCost: number; // totalImbalanceCost / totalActualMwh (0 if totalActualMwh === 0)
}

export interface YearlyAggregate {
  plantId?: string;
  plantName?: string;
  year: number;
  totalDayAheadSalesAmount: number;
  totalImbalanceAmount: number;
  totalRevenue: number;
  totalActualMwh: number;
  unitRevenue: number; // totalRevenue / totalActualMwh (0 if totalActualMwh === 0)
  totalImbalanceCost: number;
  unitImbalanceCost: number; // totalImbalanceCost / totalActualMwh (0 if totalActualMwh === 0)
}
