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
  /** Görünen ad (ayrıntı sayfası için; yoksa kimlik gösterilir) */
  name?: string;
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
  /** Listede olup analiz edilmeyen türdeki santraller (doğalgaz, biyokütle, jeotermal, kojenerasyon…) */
  otherTechPlants?: number;
  /** Rüzgâr/güneş/hidro olabilecek ama dönemde verisi olmayan ya da üretimi yayımlanmayan santraller */
  missingPlants?: number;
  byType: Record<string, number>;
  /** Teknoloji → üretim (MWh) */
  byTypeMwh: Record<string, number>;
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
  /**
   * Karışıma göre beklenen maliyet: her santralin üretimi × kendi teknolojisinin sektör medyanı (TL/MWh, santral tek
   * başına). "Sektörün ortalama santralleri bu karışımla tek başına ne öderdi"; medyanı olmayan tür hesaba girmez.
   */
  expectedCostTl: number;
  /** portfolio / expected: karışımdan bağımsız performans endeksi (1'in altı daha iyi); beklenen yoksa null */
  mixAdjustedIndex: number | null;
}

const cost = (d: number, p: BenchmarkHourPrice) => (d > 0 ? d * (p.ptf - p.pos) : d < 0 ? -d * (p.neg - p.ptf) : 0);

export function benchmarkAggregator(
  agg: { id: number; name: string; plantIds: number[] },
  plants: Map<number, BenchmarkPlant>,
  prices: Map<number, BenchmarkHourPrice>,
  /** Teknoloji → sektör medyanı TL/MWh (santral tek başına) */
  sectorMedians: Record<string, number> = {}
): AggregatorBenchmarkRow {
  const members = agg.plantIds.map((id) => plants.get(id)).filter((p): p is BenchmarkPlant => !!p && p.hours.size > 0);
  const portfolio = new Map<number, number>();
  const owners = new Map<string, Map<number, number>>();
  const byType: Record<string, number> = {};
  const byTypeMwh: Record<string, number> = {};
  let production = 0;
  let expected = 0;
  let plantLevel = 0;
  for (const p of members) {
    byType[p.type] = (byType[p.type] ?? 0) + 1;
    const key = p.owner ?? `plant:${p.epiasPlantId}`;
    const o = owners.get(key) ?? owners.set(key, new Map()).get(key)!;
    for (const [t, h] of Array.from(p.hours.entries())) {
      const price = prices.get(t);
      if (!price) continue;
      production += h.actual;
      byTypeMwh[p.type] = (byTypeMwh[p.type] ?? 0) + h.actual;
      const med = sectorMedians[p.type];
      if (med !== undefined) expected += h.actual * med;
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
    byTypeMwh,
    productionMwh: production,
    plantLevelCostTl: plantLevel,
    ownerLevelCostTl: ownerLevel,
    portfolioCostTl: portfolioCost,
    nettingValueTl: ownerLevel - portfolioCost,
    nettingPct: ownerLevel > 0 ? ((ownerLevel - portfolioCost) / ownerLevel) * 100 : 0,
    nettedTlPerMwh: production > 0 ? portfolioCost / production : 0,
    expectedCostTl: expected,
    mixAdjustedIndex: expected > 0 ? portfolioCost / expected : null,
  };
}

/**
 * Benzer ölçekli toplayıcı grubu (rapor ve ayrıntı özeti aynı kuralı kullanır). Ölçek bantları 8 aylık dönem için:
 * büyük ≥ 1.000 GWh, orta 300–1.000 GWh (kısa/uzun dönemde orantılanır); toplayıcı kendi bandındakilerle kıyaslanır. Grup
 * 4'ten küçük kalırsa ya da toplayıcı orta bandın bile altındaysa (küçük) üretimi en yakın 6 toplayıcı alınır. Satırlar karışıma göre düzeltilmiş endekse göre sıralıdır
 * (endeksi olmayan sona).
 */
export function peerGroup(
  all: AggregatorBenchmarkRow[],
  selfId: number,
  period: { start: string; end: string }
): { rows: AggregatorBenchmarkRow[]; minProductionMwh: number; largeThresholdMwh: number; selfLarge: boolean; band: "large" | "mid" | "nearest" } | null {
  const self = all.find((a) => a.id === selfId);
  if (!self) return null;
  const ym = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  const months = Math.max(1, ym(period.end) - ym(period.start) + 1);
  const large = 1_000_000 * (months / 8);
  const mid = 300_000 * (months / 8);
  const selfLarge = self.productionMwh >= large;
  let minProductionMwh = selfLarge ? large : mid;
  let band: "large" | "mid" | "nearest" = selfLarge ? "large" : "mid";
  let group = all.filter((a) => a.id === selfId || (selfLarge ? a.productionMwh >= large : a.productionMwh >= mid && a.productionMwh < large));
  if (group.length < 4 || self.productionMwh < mid) {
    band = "nearest";
    group = [...all].sort((a, b) => Math.abs(a.productionMwh - self.productionMwh) - Math.abs(b.productionMwh - self.productionMwh)).slice(0, 6);
    minProductionMwh = Math.min(...group.map((a) => a.productionMwh));
  }
  const idx = (a: AggregatorBenchmarkRow) => a.mixAdjustedIndex ?? Infinity;
  return { rows: [...group].sort((a, b) => idx(a) - idx(b)), minProductionMwh, largeThresholdMwh: large, selfLarge, band };
}
