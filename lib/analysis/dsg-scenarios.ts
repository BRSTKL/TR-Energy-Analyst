/**
 * TR-Energy Analyst - DSG Senaryo Analizi
 *
 * Kullanıcının seçtiği santral grubu için:
 * - netleşmiş maliyet ve fayda, aylık istikrar
 * - marjinal değer: gruptaki her santral ayrılırsa / grup dışındaki her santral eklenirse fayda nasıl değişir
 * - en faydalı alt grupların sıralaması
 * - netleşen maliyetin üyeler arasında paylaştırılması (Shapley, maliyet orantılı, hata hacmi orantılı) ve
 *   istikrar kontrolü: herhangi bir alt grup, kendisine düşen paydan daha ucuza ayrı bir grup kurabilir mi?
 *
 * Grup maliyeti portfolio-netting.ts ile aynı yöntemle hesaplanır: her saat grubun toplam tahmini ve toplam
 * gerçekleşeni hesaplama motorundan geçirilir. Alt grup sayısı 2^n olduğundan saatler hizalanmış dizilere
 * çevrilir ve her alt grubun maliyeti bir kez hesaplanıp önbelleğe alınır.
 *
 * SAF fonksiyonlar: I/O yok.
 */

import { processHourlyRecord, pricedMarket } from "@/lib/calculations/engine";
import { HourlyResult, ImbalancePricingProfile } from "@/lib/calculations/types";
import type { NettingPlantInput } from "@/lib/analysis/portfolio-netting";

/** Tam alt grup sayımı ve Shapley için üst sınır (2^8 = 256 alt grup) */
export const MAX_EXACT_PLANTS = 8;
/** Bundan fazla santralde alt grup sıralaması yalnızca çiftleri içerir */
export const MAX_TRIPLE_PLANTS = 12;

export interface SubsetResult {
  plantIds: string[];
  plantNames: string[];
  standaloneCost: number;
  nettedCost: number;
  benefitTl: number;
  benefitRatio: number;
}

export interface MonthlyBenefit {
  month: string;
  standaloneCost: number;
  nettedCost: number;
  benefitRatio: number;
}

export interface MarginalValue {
  plantId: string;
  plantName: string;
  plantType: string;
  inGroup: boolean;
  /** Gruptaysa: ayrılırsa kaybedilecek fayda. Dışındaysa: eklenirse kazanılacak fayda. */
  benefitChangeTl: number;
}

export interface AllocationShare {
  plantId: string;
  plantName: string;
  standaloneCost: number;
  allocatedCost: number;
  /** standaloneCost − allocatedCost */
  discountTl: number;
  discountRatio: number;
}

export interface AllocationMethod {
  id: "shapley" | "cost-proportional" | "volume-proportional";
  label: string;
  description: string;
  shares: AllocationShare[];
  /** Kendi başına (veya kendi aralarında) bu paylardan daha ucuza grup kurabilecek alt gruplar */
  unstableSubgroups: string[][];
}

export interface DsgScenarioResult {
  selection: SubsetResult | null;
  offsettingHourShare: number;
  monthly: MonthlyBenefit[];
  marginal: MarginalValue[];
  /** Fayda TL'sine göre en iyi alt gruplar (en az 2 santral) */
  topSubsets: SubsetResult[];
  /** true: tüm alt gruplar sayıldı; false: santral sayısı fazla, yalnızca çiftler (ve 12 santrale kadar üçlüler) */
  subsetsExhaustive: boolean;
  /** Seçim MAX_EXACT_PLANTS'tan büyükse Shapley ve istikrar kontrolü hesaplanmaz */
  allocation: AllocationMethod[] | null;
  allocationNote: string | null;
}

interface Aligned {
  plants: NettingPlantInput[];
  samples: HourlyResult[];
  /** [santral][saat] tahmin / gerçekleşen; santralin o saatte verisi yoksa NaN */
  forecast: Float64Array[];
  actual: Float64Array[];
  months: string[];
}

function align(plants: NettingPlantInput[]): Aligned {
  const index = new Map<number, number>();
  const samples: HourlyResult[] = [];
  for (const p of plants) {
    for (const h of p.hourly) {
      const t = new Date(h.timestamp).getTime();
      if (!index.has(t)) {
        index.set(t, samples.length);
        samples.push(h);
      }
    }
  }
  const forecast = plants.map(() => new Float64Array(samples.length).fill(NaN));
  const actual = plants.map(() => new Float64Array(samples.length).fill(NaN));
  plants.forEach((p, i) => {
    for (const h of p.hourly) {
      const k = index.get(new Date(h.timestamp).getTime())!;
      forecast[i][k] = h.forecastMwh;
      actual[i][k] = h.actualMwh;
    }
  });
  return {
    plants,
    samples,
    forecast,
    actual,
    months: samples.map((s) => new Date(s.timestamp).toISOString().slice(0, 7)),
  };
}

/** Seçim içi (en fazla MAX_EXACT_PLANTS üye) yerel maske */
const bitsOf = (mask: number, n: number) => Array.from({ length: n }, (_, i) => i).filter((i) => mask & (1 << i));
/**
 * Tüm üyeler üzerindeki maskeler BigInt'tir: JavaScript'in bit işlemleri 32 bitliktir (1 << 32 === 1). Toplayıcı
 * portföyünde 55 sahip olunca 32. üye 0. üyeyle çakışıyor, katkılar ikişer ikişer aynı ve toplam şişik çıkıyordu.
 */
const bit = (i: number) => 1n << BigInt(i);
const membersOf = (mask: bigint, n: number) => Array.from({ length: n }, (_, i) => i).filter((i) => (mask & bit(i)) !== 0n);

export function analyzeDsgScenario(
  plantsIn: NettingPlantInput[],
  selectedIds: string[],
  profile: ImbalancePricingProfile,
  { topN = 10 }: { topN?: number } = {}
): DsgScenarioResult {
  const plants = plantsIn.filter((p) => p.hourly.length > 0);
  const n = plants.length;
  const data = align(plants);

  // k. saatte verilen santrallerin netleşmiş maliyeti (o saatte verisi olmayan santral atlanır)
  const hourCost = (members: number[], k: number) => {
    let f = 0;
    let a = 0;
    let any = false;
    for (const i of members) {
      const fi = data.forecast[i][k];
      if (Number.isNaN(fi)) continue;
      f += fi;
      a += data.actual[i][k];
      any = true;
    }
    if (!any) return 0;
    const s = data.samples[k];
    return processHourlyRecord(
      { timestamp: s.timestamp, forecastMwh: f, actualMwh: a },
      pricedMarket(s),
      profile
    ).imbalanceCost;
  };

  const cache = new Map<bigint, number>();
  const cost = (mask: bigint) => {
    const hit = cache.get(mask);
    if (hit !== undefined) return hit;
    const members = membersOf(mask, n);
    let c = 0;
    for (let k = 0; k < data.samples.length; k++) c += hourCost(members, k);
    cache.set(mask, c);
    return c;
  };
  const standalone = (i: number) => cost(bit(i));
  const subsetResult = (mask: bigint): SubsetResult => {
    const members = membersOf(mask, n);
    const st = members.reduce((s, i) => s + standalone(i), 0);
    const netted = cost(mask);
    return {
      plantIds: members.map((i) => plants[i].plantId),
      plantNames: members.map((i) => plants[i].plantName),
      standaloneCost: st,
      nettedCost: netted,
      benefitTl: st - netted,
      benefitRatio: st > 0 ? (st - netted) / st : 0,
    };
  };
  const benefit = (mask: bigint) => (mask === 0n ? 0 : subsetResult(mask).benefitTl);

  const selMask = plants.reduce((m, p, i) => (selectedIds.includes(p.plantId) ? m | bit(i) : m), 0n);
  const selMembers = membersOf(selMask, n);
  const selection = selMembers.length >= 2 ? subsetResult(selMask) : null;

  // Zıt yönlü saat payı ve aylık fayda (yalnızca seçim için)
  let offsetting = 0;
  let hoursWithData = 0;
  const monthAgg = new Map<string, { st: number; net: number }>();
  if (selection) {
    for (let k = 0; k < data.samples.length; k++) {
      let surplus = false;
      let deficit = false;
      let any = false;
      let st = 0;
      for (const i of selMembers) {
        if (Number.isNaN(data.forecast[i][k])) continue;
        any = true;
        const d = data.actual[i][k] - data.forecast[i][k];
        if (d > 0) surplus = true;
        if (d < 0) deficit = true;
        st += hourCost([i], k);
      }
      if (!any) continue;
      hoursWithData++;
      if (surplus && deficit) offsetting++;
      const m = monthAgg.get(data.months[k]) ?? { st: 0, net: 0 };
      m.st += st;
      m.net += hourCost(selMembers, k);
      monthAgg.set(data.months[k], m);
    }
  }
  const monthly = Array.from(monthAgg.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      standaloneCost: v.st,
      nettedCost: v.net,
      benefitRatio: v.st > 0 ? (v.st - v.net) / v.st : 0,
    }));

  // Marjinal değer
  const baseBenefit = benefit(selMask);
  const marginal: MarginalValue[] = plants.map((p, i) => {
    const inGroup = (selMask & bit(i)) !== 0n;
    const other = inGroup ? selMask & ~bit(i) : selMask | bit(i);
    return {
      plantId: p.plantId,
      plantName: p.plantName,
      plantType: p.plantType,
      inGroup,
      benefitChangeTl: inGroup ? baseBenefit - benefit(other) : benefit(other) - baseBenefit,
    };
  });

  // En iyi alt gruplar: az santralde hepsi, çok santralde çiftler ve üçlüler
  const subsetsExhaustive = n <= MAX_EXACT_PLANTS;
  const candidateMasks: bigint[] = [];
  if (subsetsExhaustive) {
    for (let mask = 1n; mask < bit(n); mask++) if (membersOf(mask, n).length >= 2) candidateMasks.push(mask);
  } else {
    // Çiftler her zaman; üçlüler en fazla MAX_TRIPLE_PLANTS santrale kadar (C(20,3) = 1.140 grup yavaş kalır)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        candidateMasks.push(bit(i) | bit(j));
        if (n > MAX_TRIPLE_PLANTS) continue;
        for (let k = j + 1; k < n; k++) candidateMasks.push(bit(i) | bit(j) | bit(k));
      }
  }
  const topSubsets = candidateMasks
    .map(subsetResult)
    .sort((a, b) => b.benefitTl - a.benefitTl)
    .slice(0, topN);

  // Paylaştırma
  let allocation: AllocationMethod[] | null = null;
  let allocationNote: string | null = null;
  if (selection && selMembers.length > MAX_EXACT_PLANTS) {
    allocationNote = `Paylaştırma ve istikrar kontrolü en fazla ${MAX_EXACT_PLANTS} santrallik gruplar için hesaplanır.`;
  } else if (selection) {
    const k = selMembers.length;
    const total = cost(selMask);
    const fact = (x: number): number => (x <= 1 ? 1 : x * fact(x - 1));
    // Seçimin alt kümelerini seçimin kendi indeksleriyle dolaş
    const subMask = (local: number) => selMembers.reduce((m, gi, li) => (local & (1 << li) ? m | bit(gi) : m), 0n);

    const shapley = selMembers.map((_, li) => {
      let s = 0;
      for (let local = 0; local < 1 << k; local++) {
        if (local & (1 << li)) continue;
        const size = bitsOf(local, k).length;
        s += ((fact(size) * fact(k - size - 1)) / fact(k)) * (cost(subMask(local | (1 << li))) - cost(subMask(local)));
      }
      return s;
    });
    const st = selMembers.map(standalone);
    const stSum = st.reduce((a, b) => a + b, 0);
    const vol = selMembers.map((i) => {
      let v = 0;
      for (let h = 0; h < data.samples.length; h++) {
        if (!Number.isNaN(data.forecast[i][h])) v += Math.abs(data.actual[i][h] - data.forecast[i][h]);
      }
      return v;
    });
    const volSum = vol.reduce((a, b) => a + b, 0);

    const build = (
      id: AllocationMethod["id"],
      label: string,
      description: string,
      costs: number[]
    ): AllocationMethod => {
      const unstable: string[][] = [];
      for (let local = 1; local < (1 << k) - 1; local++) {
        const members = bitsOf(local, k);
        const allocated = members.reduce((s, li) => s + costs[li], 0);
        // 1 TL tolerans: yuvarlama farkları istikrarsızlık sayılmasın
        if (cost(subMask(local)) < allocated - 1) unstable.push(members.map((li) => plants[selMembers[li]].plantName));
      }
      return {
        id,
        label,
        description,
        shares: selMembers.map((gi, li) => ({
          plantId: plants[gi].plantId,
          plantName: plants[gi].plantName,
          standaloneCost: st[li],
          allocatedCost: costs[li],
          discountTl: st[li] - costs[li],
          discountRatio: st[li] > 0 ? (st[li] - costs[li]) / st[li] : 0,
        })),
        unstableSubgroups: unstable,
      };
    };

    allocation = [
      build(
        "shapley",
        "Shapley",
        "Her santral, gruba katılabileceği tüm sıralamalardaki ortalama marjinal maliyetini öder: kattığı fayda kadar indirim alır.",
        shapley
      ),
      build(
        "cost-proportional",
        "Maliyet orantılı",
        "Netleşen maliyet, santrallerin tek başına maliyetleriyle orantılı paylaştırılır; herkes aynı oranda indirim alır.",
        st.map((s) => (stSum > 0 ? (s * total) / stSum : total / k))
      ),
      build(
        "volume-proportional",
        "Hata hacmi orantılı",
        "Netleşen maliyet, santrallerin toplam |tahmin hatası| (MWh) payına göre paylaştırılır.",
        vol.map((v) => (volSum > 0 ? (v * total) / volSum : total / k))
      ),
    ];
  }

  return {
    selection,
    offsettingHourShare: hoursWithData > 0 ? offsetting / hoursWithData : 0,
    monthly,
    marginal,
    topSubsets,
    subsetsExhaustive,
    allocation,
    allocationNote,
  };
}
