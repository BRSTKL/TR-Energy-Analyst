/**
 * TR-Energy Analyst - Toplayıcı ayrıntısı (PLAN 9.2)
 *
 * Kıyas tablosundaki bir toplayıcının içi: santraller (tek başına maliyet, sektör medyanına göre), aylık netleşme ve
 * sahiplerin (üreticilerin) portföye katkısı. Tanımlar kıyasla (benchmarkAggregator) ve rapordaki üretici katkısıyla aynı:
 *   - netleşme değeri = sahipler tek başına − portföy
 *   - sahibin katkısı = (sahip olmadan portföy) + (sahip tek başına) − (portföy): sahip ayrılırsa kaybedilecek fayda
 * SAF: I/O yok (veri lib/services/aggregator-data.ts'te okunur).
 */

import { benchmarkAggregator, type AggregatorBenchmarkRow, type BenchmarkHourPrice, type BenchmarkPlant } from "./aggregator-benchmark";

const cost = (d: number, p: BenchmarkHourPrice) => (d > 0 ? d * (p.ptf - p.pos) : d < 0 ? -d * (p.neg - p.ptf) : 0);

export interface AggregatorDetailPlant {
  epiasPlantId: number;
  name: string;
  type: string;
  owner: string | null;
  productionMwh: number;
  /** Santral tek başına dengesizlik maliyeti (TL) ve MWh başına */
  standaloneTl: number;
  standaloneTlPerMwh: number;
  /** Aynı teknolojinin sektör medyanı (TL/MWh); yoksa null */
  sectorMedianTlPerMwh: number | null;
  /** (santral − medyan) / medyan, %: pozitif = sektör medyanından pahalı */
  vsMedianPct: number | null;
}

export interface AggregatorDetailMonth {
  /** YYYY-AA */
  month: string;
  productionMwh: number;
  ownerLevelTl: number;
  portfolioTl: number;
  nettingTl: number;
  nettingPct: number;
  portfolioTlPerMwh: number;
}

export interface AggregatorDetailOwner {
  name: string;
  plantCount: number;
  productionMwh: number;
  standaloneTlPerMwh: number;
  contributionTl: number;
  contributionTlPerMwh: number;
}

export interface AggregatorDetail {
  summary: AggregatorBenchmarkRow;
  plants: AggregatorDetailPlant[];
  months: AggregatorDetailMonth[];
  /** Katkıya göre azalan; sahibi bilinmeyen santral kendi başına sahip sayılır */
  owners: AggregatorDetailOwner[];
}

const monthKey = (t: number) => new Date(t).toISOString().slice(0, 7);

export function aggregatorDetail(
  agg: { id: number; name: string; plantIds: number[] },
  plants: Map<number, BenchmarkPlant>,
  prices: Map<number, BenchmarkHourPrice>,
  sectorMedians: Record<string, number> = {}
): AggregatorDetail {
  const summary = benchmarkAggregator(agg, plants, prices, sectorMedians);
  const members = agg.plantIds.map((id) => plants.get(id)).filter((p): p is BenchmarkPlant => !!p && p.hours.size > 0);

  const total = new Map<number, number>();
  const ownerMap = new Map<string, { name: string; plants: number; mwh: number; alone: number; d: Map<number, number> }>();
  const monthOwner = new Map<string, Map<string, Map<number, number>>>(); // ay → sahip → saat → sapma
  const monthMwh = new Map<string, number>();
  const detailPlants: AggregatorDetailPlant[] = [];

  for (const p of members) {
    const key = p.owner ?? `plant:${p.epiasPlantId}`;
    const o = ownerMap.get(key) ?? ownerMap.set(key, { name: p.owner ?? p.name ?? `Santral ${p.epiasPlantId}`, plants: 0, mwh: 0, alone: 0, d: new Map() }).get(key)!;
    o.plants++;
    let mwh = 0;
    let standalone = 0;
    for (const [t, h] of Array.from(p.hours.entries())) {
      const price = prices.get(t);
      if (!price) continue;
      mwh += h.actual;
      standalone += cost(h.d, price);
      total.set(t, (total.get(t) ?? 0) + h.d);
      o.d.set(t, (o.d.get(t) ?? 0) + h.d);
      const m = monthKey(t);
      const byOwner = monthOwner.get(m) ?? monthOwner.set(m, new Map()).get(m)!;
      const hours = byOwner.get(key) ?? byOwner.set(key, new Map()).get(key)!;
      hours.set(t, (hours.get(t) ?? 0) + h.d);
      monthMwh.set(m, (monthMwh.get(m) ?? 0) + h.actual);
    }
    o.mwh += mwh;
    const med = sectorMedians[p.type] ?? null;
    const unit = mwh > 0 ? standalone / mwh : 0;
    detailPlants.push({
      epiasPlantId: p.epiasPlantId,
      name: p.name ?? `Santral ${p.epiasPlantId}`,
      type: p.type,
      owner: p.owner,
      productionMwh: mwh,
      standaloneTl: standalone,
      standaloneTlPerMwh: unit,
      sectorMedianTlPerMwh: med,
      vsMedianPct: med && mwh > 0 ? ((unit - med) / med) * 100 : null,
    });
  }

  // Aylık: sahipler tek başına (kendi saatlik toplamları) ve portföy (hepsinin toplamı)
  const months: AggregatorDetailMonth[] = Array.from(monthOwner.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, byOwner]) => {
      let ownerLevel = 0;
      const port = new Map<number, number>();
      for (const hours of Array.from(byOwner.values()))
        for (const [t, d] of Array.from(hours.entries())) {
          port.set(t, (port.get(t) ?? 0) + d);
        }
      for (const hours of Array.from(byOwner.values())) for (const [t, d] of Array.from(hours.entries())) ownerLevel += cost(d, prices.get(t)!);
      let portfolio = 0;
      for (const [t, d] of Array.from(port.entries())) portfolio += cost(d, prices.get(t)!);
      const mwh = monthMwh.get(month) ?? 0;
      return {
        month,
        productionMwh: mwh,
        ownerLevelTl: ownerLevel,
        portfolioTl: portfolio,
        nettingTl: ownerLevel - portfolio,
        nettingPct: ownerLevel > 0 ? ((ownerLevel - portfolio) / ownerLevel) * 100 : 0,
        portfolioTlPerMwh: mwh > 0 ? portfolio / mwh : 0,
      };
    });

  // Sahip katkısı: sahip ayrılırsa kaybedilecek fayda
  let portfolioCost = 0;
  for (const [t, d] of Array.from(total.entries())) portfolioCost += cost(d, prices.get(t)!);
  const owners: AggregatorDetailOwner[] = Array.from(ownerMap.values())
    .map((o) => {
      let alone = 0;
      let without = 0;
      for (const [t, d] of Array.from(total.entries())) {
        const od = o.d.get(t) ?? 0;
        const price = prices.get(t)!;
        if (od !== 0) alone += cost(od, price);
        without += cost(d - od, price);
      }
      const contribution = without + alone - portfolioCost;
      return {
        name: o.name,
        plantCount: o.plants,
        productionMwh: o.mwh,
        standaloneTlPerMwh: o.mwh > 0 ? alone / o.mwh : 0,
        contributionTl: contribution,
        contributionTlPerMwh: o.mwh > 0 ? contribution / o.mwh : 0,
      };
    })
    .sort((a, b) => b.contributionTl - a.contributionTl);

  return { summary, plants: detailPlants.sort((a, b) => b.productionMwh - a.productionMwh), months, owners };
}
