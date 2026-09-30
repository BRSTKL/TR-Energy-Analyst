/**
 * TR-Energy Analyst - Toplayıcılar arası kıyas (PLAN 8.7)
 *
 * EPİAŞ'taki her toplayıcının portföyündeki lisanslı santraller için aynı yöntem: saatlik sapma (UEVM − ilk KGÜP),
 * EPİAŞ resmi dengesizlik fiyatı. Sahipler tek başına (aynı sahibin santralleri kendi dengesinde netleşir) ile toplayıcı
 * portföyünde tek denge karşılaştırılır; netleşme değeri = sahipler tek başına − portföy. Böylece raporun "portföy
 * değeri" rakamıyla aynı tanımdır. SAF: I/O yok (veri betikte okunur: scripts/aggregator-benchmark.mts).
 *
 * Sınırlar: üyelik listenin alındığı güne göredir (santraller dönem boyunca portföydeymiş gibi); santral bazında üretimi
 * yayımlanmayan lisanssız santraller hesapta yoktur; KÜPST hariçtir (netleşmez, toplayıcıyı ayırt etmez).
 */

export interface BenchmarkHourPrice {
  ptf: number;
  /** Resmi pozitif / negatif dengesizlik fiyatı (TL/MWh) */
  pos: number;
  neg: number;
}

export interface BenchmarkPlant {
  epiasPlantId: number;
  type: string;
  /** Sahip (lisans sahibi) anahtarı; bilinmiyorsa null (santral kendi başına sahip sayılır) */
  owner: string | null;
  /** Saat → sapma (MWh) ve gerçekleşen (MWh) */
  hours: Map<number, { d: number; actual: number }>;
}

export interface AggregatorBenchmarkRow {
  id: number;
  name: string;
  listedPlants: number;
  coveredPlants: number;
  byType: Record<string, number>;
  productionMwh: number;
  plantLevelCostTl: number;
  ownerLevelCostTl: number;
  portfolioCostTl: number;
  /** ownerLevel − portfolio */
  nettingValueTl: number;
  /** nettingValue / ownerLevel (%) */
  nettingPct: number;
  /** portfolio / üretim (TL/MWh) */
  nettedTlPerMwh: number;
}

const cost = (d: number, p: BenchmarkHourPrice) => (d > 0 ? d * (p.ptf - p.pos) : d < 0 ? -d * (p.neg - p.ptf) : 0);

export function benchmarkAggregator(
  agg: { id: number; name: string; plantIds: number[] },
  plants: Map<number, BenchmarkPlant>,
  prices: Map<number, BenchmarkHourPrice>
): AggregatorBenchmarkRow {
  const members = agg.plantIds.map((id) => plants.get(id)).filter((p): p is BenchmarkPlant => !!p && p.hours.size > 0);
  const portfolio = new Map<number, number>();
  const owners = new Map<string, Map<number, number>>();
  const byType: Record<string, number> = {};
  let production = 0;
  let plantLevel = 0;
  for (const p of members) {
    byType[p.type] = (byType[p.type] ?? 0) + 1;
    const key = p.owner ?? `plant:${p.epiasPlantId}`;
    const o = owners.get(key) ?? owners.set(key, new Map()).get(key)!;
    for (const [t, h] of Array.from(p.hours.entries())) {
      const price = prices.get(t);
      if (!price) continue;
      production += h.actual;
      plantLevel += cost(h.d, price);
      portfolio.set(t, (portfolio.get(t) ?? 0) + h.d);
      o.set(t, (o.get(t) ?? 0) + h.d);
    }
  }
  const settle = (m: Map<number, number>) => {
    let c = 0;
    for (const [t, d] of Array.from(m.entries())) c += cost(d, prices.get(t)!);
    return c;
  };
  const portfolioCost = settle(portfolio);
  let ownerLevel = 0;
  for (const m of Array.from(owners.values())) ownerLevel += settle(m);
  return {
    id: agg.id,
    name: agg.name,
    listedPlants: agg.plantIds.length,
    coveredPlants: members.length,
    byType,
    productionMwh: production,
    plantLevelCostTl: plantLevel,
    ownerLevelCostTl: ownerLevel,
    portfolioCostTl: portfolioCost,
    nettingValueTl: ownerLevel - portfolioCost,
    nettingPct: ownerLevel > 0 ? ((ownerLevel - portfolioCost) / ownerLevel) * 100 : 0,
    nettedTlPerMwh: production > 0 ? portfolioCost / production : 0,
  };
}
