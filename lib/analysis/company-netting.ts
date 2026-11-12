/**
 * TR-Energy Analyst - Şirket profili: şirket içi netleşmiş dengesizlik maliyeti (SAF, I/O yok)
 *
 * İki sayı üretir: santraller tek tek (her santral kendi sapmasıyla fiyatlanır) ve netleşmiş (şirketin kendi portföyündeki
 * santrallerin plan ve üretimi saat saat toplanır, tek birim gibi fiyatlanır). Fiyatlama dışarıdan verilir (`cost`), böylece
 * sektör karnesiyle aynı motor ve aynı fiyatlar kullanılır.
 *
 * Varsayım ve sınırlar (sayfada yazar):
 *   - Toplayıcı portföyünde görünen santral netleşmeye katılmaz: şirketle değil toplayıcının diğer santralleriyle dengelenir.
 *     Üyelik listesi tek bir tarihin durumudur; yıl içinde giren / çıkan santral bütün dönem için o günkü hâliyle sayılır.
 *   - Kalan santrallerin tek portföyde dengelendiği varsayılır (toplayıcı dışı grup üyelikleri açık veride yok).
 *   - Plan gün öncesi plandır; gün içi işlemler ve talimatlar yok. KÜPST santral bazında kesilir, netleşmez.
 *   - Şirketin kendi portföyünde 2'den az santral varsa netleşmiş değer yoktur (`nettedTl: null`).
 */

export interface NettingRow {
  timestamp: Date;
  forecastMwh: number;
  actualMwh: number;
}

export interface NettingPlant {
  id: number;
  /** Toplayıcının adı; toplayıcıda değilse null */
  aggregator: string | null;
  /** Saatlik plan ve üretim; serisi yoksa null */
  rows: NettingRow[] | null;
}

export interface CompanyNetting {
  /** Şirketin kendi portföyü (toplayıcıda olmayan, serisi olan santraller) */
  own: { plants: number; mwh: number; sumTl: number; nettedTl: number | null };
  /** Toplayıcı portföyündeki santraller (netleşmeye katılmaz) */
  aggregated: { plants: number; mwh: number; sumTl: number; aggregators: Array<{ name: string; plants: number }> };
  /** Saatlik serisi bulunmayan santral sayısı (iki toplamda da yok) */
  missing: number;
  /** Toplayıcı üyelik listesinin tarihi (YYYY-AA-GG); liste yoksa null (o zaman hiçbir santral toplayıcıda sayılmaz) */
  membershipAsOf: string | null;
}

/** Santrallerin plan ve üretimini saat saat toplar (zaman sırasıyla) */
export function sumSeries(series: NettingRow[][]): NettingRow[] {
  const byHour = new Map<number, NettingRow>();
  for (const rows of series)
    for (const r of rows) {
      const t = r.timestamp.getTime();
      const b = byHour.get(t);
      if (b) {
        b.forecastMwh += r.forecastMwh;
        b.actualMwh += r.actualMwh;
      } else byHour.set(t, { timestamp: r.timestamp, forecastMwh: r.forecastMwh, actualMwh: r.actualMwh });
    }
  return Array.from(byHour.entries())
    .sort(([a], [b]) => a - b)
    .map(([, r]) => r);
}

/**
 * @param cost bir serinin dengesizlik maliyeti (TL) ve fiyatlanan saatlerdeki üretimi (MWh)
 */
export function companyNetting(
  plants: NettingPlant[],
  cost: (rows: NettingRow[]) => { costTl: number; mwh: number },
  membershipAsOf: string | null
): CompanyNetting {
  const own = { plants: 0, mwh: 0, sumTl: 0, nettedTl: null as number | null };
  const aggregated = { plants: 0, mwh: 0, sumTl: 0, aggregators: [] as Array<{ name: string; plants: number }> };
  const byAggregator = new Map<string, number>();
  const ownSeries: NettingRow[][] = [];
  let missing = 0;
  for (const p of plants) {
    if (!p.rows) {
      missing++;
      continue;
    }
    const c = cost(p.rows);
    if (p.aggregator) {
      aggregated.plants++;
      aggregated.mwh += c.mwh;
      aggregated.sumTl += c.costTl;
      byAggregator.set(p.aggregator, (byAggregator.get(p.aggregator) ?? 0) + 1);
    } else {
      own.plants++;
      own.mwh += c.mwh;
      own.sumTl += c.costTl;
      ownSeries.push(p.rows);
    }
  }
  if (own.plants >= 2) own.nettedTl = cost(sumSeries(ownSeries)).costTl;
  aggregated.aggregators = Array.from(byAggregator.entries(), ([name, n]) => ({ name, plants: n })).sort(
    (a, b) => b.plants - a.plants || a.name.localeCompare(b.name, "tr")
  );
  return { own, aggregated, missing, membershipAsOf };
}
