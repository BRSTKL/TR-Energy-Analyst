/**
 * TR-Energy Analyst - Dengeden Sorumlu Grup (DSG) Netleştirme Analizi
 *
 * Santraller aynı dengeden sorumlu grupta olsaydı, dengesizlikler saat bazında grup düzeyinde
 * netleşirdi: bir santralin fazlası diğerinin açığını kapatır. Bu modül, santrallerin tek başına
 * dengesizlik maliyetlerinin toplamını, grubun netleşmiş dengesizlik maliyetiyle karşılaştırır.
 *
 * Yöntem: Her saat için grubun toplam tahmini ve toplam gerçekleşeni, o saatin piyasa verisiyle
 * mevcut hesaplama motorundan (processHourlyRecord) geçirilir. Aynı saatte tüm santraller aynı
 * PTF / SMF / sistem yönüne tabi olduğu için bu, grup düzeyindeki uzlaştırmaya eşdeğerdir.
 *
 * Saatlik maliyet fonksiyonu Δ = 0'da sıfır olan dışbükey, parça parça doğrusal bir fonksiyondur;
 * bu nedenle netleştirme maliyeti hiçbir saatte artıramaz (fayda ≥ 0).
 *
 * Varsayımlar: Grup düzeyinde aynı dengesizlik fiyat formülü ve katsayıları uygulanır. Netleşen
 * maliyetin grup üyeleri arasında nasıl paylaştırılacağı DSG sözleşmesine bağlıdır ve burada modellenmez.
 */

import { processHourlyRecord, pricedMarket } from "@/lib/calculations/engine";
import {
  DEFAULT_IMBALANCE_PROFILE,
  HourlyResult,
  ImbalancePricingProfile,
} from "@/lib/calculations/types";

export interface NettingPlantInput {
  plantId: string;
  plantName: string;
  plantType: string;
  hourly: HourlyResult[];
}

export interface NettingGroupResult {
  key: string;
  label: string;
  kind: "portfolio" | "technology" | "pair";
  plantNames: string[];
  hours: number;
  /** Santrallerin tek başına dengesizlik maliyetlerinin toplamı */
  standaloneCost: number;
  /** Grubun saatlik netleşmiş dengesizlik maliyeti */
  nettedCost: number;
  /** standaloneCost − nettedCost (≥ 0) */
  benefitTl: number;
  /** benefitTl / standaloneCost */
  benefitRatio: number;
  /** Σ saat Σ santral |Δ| */
  grossImbalanceMwh: number;
  /** Σ saat |Σ santral Δ| */
  netImbalanceMwh: number;
  /** En az bir santralin fazla, en az birinin eksik ürettiği saatlerin payı */
  offsettingHourShare: number;
}

export interface NettingResult {
  portfolio: NettingGroupResult | null;
  technologies: NettingGroupResult[];
  /** Fayda TL'sine göre azalan sırada santral çiftleri */
  pairs: NettingGroupResult[];
}

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

interface HourBucket {
  sample: HourlyResult;
  forecastMwh: number;
  actualMwh: number;
  standaloneCost: number;
  grossAbs: number;
  hasSurplus: boolean;
  hasDeficit: boolean;
}

export function analyzeGroupNetting(
  plants: NettingPlantInput[],
  meta: Pick<NettingGroupResult, "key" | "label" | "kind">,
  profile: ImbalancePricingProfile = DEFAULT_IMBALANCE_PROFILE
): NettingGroupResult {
  const buckets = new Map<number, HourBucket>();

  for (const plant of plants) {
    for (const h of plant.hourly) {
      const key = new Date(h.timestamp).getTime();
      let b = buckets.get(key);
      if (!b) {
        b = {
          sample: h,
          forecastMwh: 0,
          actualMwh: 0,
          standaloneCost: 0,
          grossAbs: 0,
          hasSurplus: false,
          hasDeficit: false,
        };
        buckets.set(key, b);
      }
      b.forecastMwh += h.forecastMwh;
      b.actualMwh += h.actualMwh;
      b.standaloneCost += h.imbalanceCost;
      b.grossAbs += Math.abs(h.imbalanceMwh);
      if (h.imbalanceMwh > 0) b.hasSurplus = true;
      if (h.imbalanceMwh < 0) b.hasDeficit = true;
    }
  }

  let standaloneCost = 0;
  let nettedCost = 0;
  let grossImbalanceMwh = 0;
  let netImbalanceMwh = 0;
  let offsettingHours = 0;

  for (const b of buckets.values()) {
    const netted = processHourlyRecord(
      { timestamp: b.sample.timestamp, forecastMwh: b.forecastMwh, actualMwh: b.actualMwh },
      pricedMarket(b.sample),
      profile
    );
    standaloneCost += b.standaloneCost;
    nettedCost += netted.imbalanceCost;
    grossImbalanceMwh += b.grossAbs;
    netImbalanceMwh += Math.abs(b.actualMwh - b.forecastMwh);
    if (b.hasSurplus && b.hasDeficit) offsettingHours++;
  }

  const benefitTl = standaloneCost - nettedCost;

  return {
    ...meta,
    plantNames: plants.map((p) => p.plantName),
    hours: buckets.size,
    standaloneCost,
    nettedCost,
    benefitTl,
    benefitRatio: safeDiv(benefitTl, standaloneCost),
    grossImbalanceMwh,
    netImbalanceMwh,
    offsettingHourShare: safeDiv(offsettingHours, buckets.size),
  };
}

/**
 * Portföy, teknoloji grupları ve tüm santral çiftleri için DSG netleştirme faydasını hesaplar.
 */
export function analyzePortfolioNetting(
  plants: NettingPlantInput[],
  profile: ImbalancePricingProfile = DEFAULT_IMBALANCE_PROFILE
): NettingResult {
  const withData = plants.filter((p) => p.hourly.length > 0);

  const portfolio =
    withData.length > 1
      ? analyzeGroupNetting(withData, { key: "portfolio", label: "Tüm Portföy", kind: "portfolio" }, profile)
      : null;

  const types = Array.from(new Set(withData.map((p) => p.plantType))).sort();
  const technologies = types
    .map((type) => withData.filter((p) => p.plantType === type))
    .filter((members) => members.length > 1)
    .map((members) =>
      analyzeGroupNetting(
        members,
        { key: `type-${members[0].plantType}`, label: `${members[0].plantType} Grubu`, kind: "technology" },
        profile
      )
    );

  const pairs: NettingGroupResult[] = [];
  for (let i = 0; i < withData.length; i++) {
    for (let j = i + 1; j < withData.length; j++) {
      const a = withData[i];
      const b = withData[j];
      pairs.push(
        analyzeGroupNetting(
          [a, b],
          { key: `pair-${a.plantId}-${b.plantId}`, label: `${a.plantName} + ${b.plantName}`, kind: "pair" },
          profile
        )
      );
    }
  }
  pairs.sort((x, y) => y.benefitTl - x.benefitTl);

  return { portfolio, technologies, pairs };
}
