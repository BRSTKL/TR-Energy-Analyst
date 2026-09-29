/**
 * TR-Energy Analyst - Aday santral taraması (PLAN 4.2)
 *
 * Toplayıcı ya da dengeden sorumlu grup, portföyüne hangi santrali eklerse en çok kazanır? Portföy tek dengede saat
 * saat netleşir; bir aday eklendiğinde kazanç, o saatlerde portföyün ve adayın ayrı ayrı ödeyeceği dengesizlik
 * maliyeti ile birlikte ödedikleri arasındaki farktır:
 *   kazanç = Σ_saat [ c(portföy) + c(aday) − c(portföy + aday) ]
 * c, net sapmanın dengesizlik maliyetidir (imbalanceCostOf; sonuç sayfasıyla aynı motor). Kazanç, adayın sapması
 * portföyünkünü dengelediği saatlerden gelir. Adaylar kazanca göre sıralanır; ilk N aday için adayın portföydeki adil
 * payı Shapley ile hesaplanır (dsg-scenarios ile aynı tanım; üyelerin 2^n alt grubunun saatlik net sapması bir kez
 * hazırlanır). Üye sayısı MAX_EXACT_PLANTS'ı aşarsa portföy tek oyuncu sayılır ve kazanç ikiye bölünür.
 * Adil prim: (Shapley payı + tahmini KÜPST) / adayın üretimi; toplayıcının adaya önerebileceği MWh başına dengesizlik
 * bedelidir.
 * Sıralama iki türlüdür: toplam kazanç (TL) büyük santralleri öne çıkarır; MWh başına kazanç ise adayın her MWh'ına ne
 * kadar prim alanı açtığını gösterir. MWh başına sıralamada üretimi portföyün MIN_PER_MWH_SHARE'inden az adaylar sona
 * düşer: çok küçük ve tahmini çok kötü santrallerin kazancı neredeyse tamamen kendi maliyetidir, sözleşmeye değmez.
 * SAF: I/O yok.
 */

import { imbalanceCostOf, processHourlyRecord, pricedMarket } from "@/lib/calculations/engine";
import { HourlyResult, ImbalancePricingProfile, resolveImbalanceProfile } from "@/lib/calculations/types";
import { kupstTotal } from "@/lib/calculations/kupst";
import { MAX_EXACT_PLANTS } from "@/lib/analysis/dsg-scenarios";
import type { CandidateAccess } from "@/lib/analysis/candidate-access";

/** Portföy üyesi (toplayıcıda sahip, tek şirkette santral); saatlik serisi üyenin kendi içinde netleşmiş */
export interface ScreeningMember {
  key: string;
  name: string;
  plantType: string;
  hourly: HourlyResult[];
}

export interface ScreeningCandidate {
  key: string;
  epiasPlantId: number;
  name: string;
  type: string;
  organizationName: string | null;
  yekdem: boolean | null;
  hydroKind?: string | null;
  /** Ulaşılabilirlik (başka toplayıcıda, grupta, bağımsız …); taramayı etkilemez, sonuca aynen geçer */
  access?: CandidateAccess | null;
  /** Ham saatlik plan ve gerçekleşen (sektör karnesinin saatlik serisi); fiyatlar portföyün saatlerinden alınır */
  rows: Array<{ timestamp: Date | string; forecastMwh: number; actualMwh: number }>;
}

export interface CandidateResult {
  key: string;
  epiasPlantId: number;
  name: string;
  type: string;
  organizationName: string | null;
  yekdem: boolean | null;
  hydroKind: string | null;
  access: CandidateAccess | null;
  /** Portföy saatlerinden adayın verisi olanlar */
  hours: number;
  actualMwh: number;
  /** Aday tek başına (kendi dengesinde) dengesizlik maliyeti */
  standaloneCostTl: number;
  /** Aday eklenince portföy + aday toplam maliyetindeki azalma (netleşme kazancı) */
  gainTl: number;
  /** Kazanç / adayın tek başına maliyeti (%) */
  gainPct: number;
  /** Kazanç, adayın üretilen MWh'ı başına */
  gainPerMwhTl: number;
  /** Adayın sapmasının portföyünkünün tersine olduğu saatlerin payı (ikisi de sıfırdan farklıyken, %) */
  offsettingPct: number;
  /** İlk N adayda: adil pay (Shapley) ve MWh başına adil prim; diğerlerinde null */
  fair: {
    method: "shapley" | "two-player";
    allocatedCostTl: number;
    kupstTl: number;
    /** Tek başına: (maliyet + KÜPST) / üretim */
    standaloneUnitTl: number;
    /** Portföyde adil prim: (Shapley payı + KÜPST) / üretim */
    fairUnitTl: number;
    discountPct: number;
  } | null;
}

export type CandidateSort = "total" | "perMwh";

export interface ScreeningResult {
  portfolio: { members: number; hours: number; actualMwh: number; costTl: number };
  sortBy: CandidateSort;
  /** MWh başına sıralamada üst sıralara girmek için gereken en az üretim (MWh); toplam sıralamada null */
  minActualMwh: number | null;
  candidates: CandidateResult[];
  /** Kapsam eşiğini geçemeyen (portföy saatlerinin %90'ından azında verisi olan) aday sayısı */
  skippedForCoverage: number;
}

export const MIN_CANDIDATE_COVERAGE = 0.9;
/** MWh başına sıralamada adayın üretimi portföy üretiminin en az bu payı olmalı */
export const MIN_PER_MWH_SHARE = 0.05;

export function screenCandidates(
  members: ScreeningMember[],
  candidates: ScreeningCandidate[],
  profile: ImbalancePricingProfile,
  { top = 10, sortBy = "total" }: { top?: number; sortBy?: CandidateSort } = {}
): ScreeningResult {
  // Portföy saatleri: piyasa örneği, bu saatin katsayıları ve portföyün net sapması
  const index = new Map<number, number>();
  const samples: HourlyResult[] = [];
  const pDelta: number[] = [];
  let pActual = 0;
  for (const m of members)
    for (const h of m.hourly) {
      const t = new Date(h.timestamp).getTime();
      let k = index.get(t);
      if (k === undefined) {
        k = samples.length;
        index.set(t, k);
        samples.push(h);
        pDelta.push(0);
      }
      pDelta[k] += h.actualMwh - h.forecastMwh;
      pActual += h.actualMwh;
    }
  // Katsayılar saat başına bir kez çözülür (CUSTOM: imbalanceCostOf yeniden çözmez)
  const rules = samples.map((s) => ({ ...resolveImbalanceProfile(profile, s.timestamp), mode: "CUSTOM" as const }));
  const cost = (delta: number, k: number) => imbalanceCostOf(delta, samples[k], rules[k]);
  const pCost = pDelta.map((d, k) => cost(d, k));

  let skipped = 0;
  const results: Array<CandidateResult & { _cand: ScreeningCandidate }> = [];
  for (const c of candidates) {
    let hours = 0;
    let actual = 0;
    let standalone = 0;
    let gain = 0;
    let both = 0;
    let offsetting = 0;
    for (const r of c.rows) {
      const k = index.get(new Date(r.timestamp).getTime());
      if (k === undefined) continue;
      hours++;
      actual += r.actualMwh;
      const d = r.actualMwh - r.forecastMwh;
      const own = cost(d, k);
      standalone += own;
      gain += pCost[k] + own - cost(pDelta[k] + d, k);
      if (d !== 0 && pDelta[k] !== 0) {
        both++;
        if (Math.sign(d) !== Math.sign(pDelta[k])) offsetting++;
      }
    }
    if (hours < samples.length * MIN_CANDIDATE_COVERAGE) {
      skipped++;
      continue;
    }
    results.push({
      key: c.key,
      epiasPlantId: c.epiasPlantId,
      name: c.name,
      type: c.type,
      organizationName: c.organizationName,
      yekdem: c.yekdem,
      hydroKind: c.hydroKind ?? null,
      access: c.access ?? null,
      hours,
      actualMwh: actual,
      standaloneCostTl: standalone,
      gainTl: gain,
      gainPct: standalone > 0 ? (gain / standalone) * 100 : 0,
      gainPerMwhTl: actual > 0 ? gain / actual : 0,
      offsettingPct: both > 0 ? (offsetting / both) * 100 : 0,
      fair: null,
      _cand: c,
    });
  }
  const minActualMwh = sortBy === "perMwh" ? pActual * MIN_PER_MWH_SHARE : null;
  if (minActualMwh === null) results.sort((a, b) => b.gainTl - a.gainTl);
  else {
    const big = (r: CandidateResult) => (r.actualMwh >= minActualMwh ? 1 : 0);
    results.sort((a, b) => big(b) - big(a) || b.gainPerMwhTl - a.gainPerMwhTl);
  }

  // İlk N aday: adil pay. Shapley: aday, üyelerin her S alt grubuna katılımındaki marjinal maliyetini
  // |S|!(n−|S|)!/(n+1)! ağırlığıyla öder. Alt grupların saatlik net sapması ve maliyeti adaydan bağımsızdır.
  const n = members.length;
  const exact = n + 1 <= MAX_EXACT_PLANTS;
  const H = samples.length;
  let masks: Array<{ delta: Float64Array; cost: number; weight: number }> = [];
  if (exact && results.length) {
    const memberDelta = members.map((m) => {
      const arr = new Float64Array(H);
      for (const h of m.hourly) arr[index.get(new Date(h.timestamp).getTime())!] += h.actualMwh - h.forecastMwh;
      return arr;
    });
    const fact = (x: number): number => (x <= 1 ? 1 : x * fact(x - 1));
    masks = Array.from({ length: 1 << n }, (_, mask) => {
      const delta = new Float64Array(H);
      let size = 0;
      for (let i = 0; i < n; i++) {
        if (!(mask & (1 << i))) continue;
        size++;
        for (let k = 0; k < H; k++) delta[k] += memberDelta[i][k];
      }
      let c = 0;
      for (let k = 0; k < H; k++) c += cost(delta[k], k);
      return { delta, cost: c, weight: (fact(size) * fact(n - size)) / fact(n + 1) };
    });
  }
  for (const r of results.slice(0, top)) {
    const own = new Float64Array(H);
    const hourly: HourlyResult[] = [];
    for (const row of r._cand.rows) {
      const k = index.get(new Date(row.timestamp).getTime());
      if (k === undefined) continue;
      own[k] = row.actualMwh - row.forecastMwh;
      const s = samples[k];
      hourly.push(
        processHourlyRecord(
          { timestamp: s.timestamp, forecastMwh: row.forecastMwh, actualMwh: row.actualMwh },
          pricedMarket(s),
          profile
        )
      );
    }
    let allocated = r.standaloneCostTl - r.gainTl / 2;
    if (exact) {
      allocated = 0;
      for (const m of masks) {
        let withC = 0;
        for (let k = 0; k < H; k++) withC += cost(m.delta[k] + own[k], k);
        allocated += m.weight * (withC - m.cost);
      }
    }
    const kupst = kupstTotal(hourly, r.type);
    const per = (v: number) => (r.actualMwh > 0 ? v / r.actualMwh : 0);
    r.fair = {
      method: exact ? "shapley" : "two-player",
      allocatedCostTl: allocated,
      kupstTl: kupst,
      standaloneUnitTl: per(r.standaloneCostTl + kupst),
      fairUnitTl: per(allocated + kupst),
      discountPct: r.standaloneCostTl + kupst > 0 ? ((r.standaloneCostTl - allocated) / (r.standaloneCostTl + kupst)) * 100 : 0,
    };
  }

  return {
    portfolio: { members: members.length, hours: samples.length, actualMwh: pActual, costTl: pCost.reduce((a, b) => a + b, 0) },
    sortBy,
    minActualMwh,
    candidates: results.map(({ _cand, ...r }) => r),
    skippedForCoverage: skipped,
  };
}
