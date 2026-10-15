/**
 * TR-Energy Analyst - GİP likiditesi ve gerçekleşen katılım (PLAN 18.1)
 *
 * Soru: bir portföy GİP'te saatte gerçekçi olarak ne kadar işlem yapabilir? Toplayıcıların gün içi plan düzeltmesi
 * (ilk KGÜP − son KGÜP) GİP'te işlem olarak varsayılır; portföy tek dengede olduğu için santrallerin düzeltmeleri saat
 * içinde netleşir, piyasaya çıkan net miktardır. Katılım = |Σ (ilk − son)| / o saatin GİP eşleşme hacmi.
 * Yalnız son planı olan santral-saatler sayılır. Plan değişikliğinin hepsi GİP işlemi olmayabilir (ikili anlaşma, talimat):
 * katılım üst sınırdır.
 * Likidite profili: saatlik GİP hacminin aya ve günün saatine göre dağılımı; en düşük–en yüksek eşleşme fiyatı aralığının
 * ağırlıklı ortalamaya oranı (derinlik vekili; emir defteri açık veride yok).
 * SAF: I/O yok.
 */

export interface PlanHour {
  /** İlk KGÜP (MWh) */
  firstPlan?: number;
  /** Son KGÜP (MWh); yoksa null / eksik */
  finalPlan?: number | null;
}

export interface ParticipationHour {
  t: number;
  /** Portföyün net işlemi |Σ (ilk − son)| (MWh) */
  tradeMwh: number;
  gipVolumeMwh: number;
  /** tradeMwh / gipVolumeMwh */
  share: number;
}

export interface Quantiles {
  p50: number;
  p90: number;
  p99: number;
  max: number;
}

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export function quantiles(values: number[]): Quantiles {
  const s = [...values].sort((a, b) => a - b);
  return { p50: quantile(s, 0.5), p90: quantile(s, 0.9), p99: quantile(s, 0.99), max: s.length ? s[s.length - 1] : 0 };
}

/**
 * Portföyün saatlik net GİP işlemi. members: santral → saat → plan; volume: saat → GİP eşleşme hacmi (MWh).
 * GİP hacmi olmayan ya da sıfır olan saat sayılmaz. Hiç son planı olmayan saat sayılmaz.
 */
export function portfolioTradeHours(members: Array<Map<number, PlanHour>>, volume: Map<number, number>): { hours: ParticipationHour[]; coveragePct: number } {
  const net = new Map<number, number>();
  let total = 0;
  let withFinal = 0;
  for (const m of members)
    for (const [t, h] of Array.from(m.entries())) {
      if (!(volume.get(t)! > 0)) continue;
      total++;
      if (h.finalPlan === null || h.finalPlan === undefined || h.firstPlan === undefined) continue;
      withFinal++;
      net.set(t, (net.get(t) ?? 0) + (h.firstPlan - h.finalPlan));
    }
  const hours = Array.from(net.entries())
    .sort(([a], [b]) => a - b)
    .map(([t, d]) => {
      const v = volume.get(t)!;
      return { t, tradeMwh: Math.abs(d), gipVolumeMwh: v, share: Math.abs(d) / v };
    });
  return { hours, coveragePct: total > 0 ? (withFinal / total) * 100 : 0 };
}

export interface ParticipationStats {
  hours: number;
  /** Saatlik katılım (işlem / GİP hacmi) dağılımı */
  share: Quantiles;
  /** Saatlik net işlem (MWh) dağılımı */
  tradeMwh: Quantiles;
  /** İşlem yapılan saatlerin payı (|Δ| > 0,1 MWh, %) */
  activePct: number;
}

export function participationStats(hours: ParticipationHour[]): ParticipationStats {
  return {
    hours: hours.length,
    share: quantiles(hours.map((h) => h.share)),
    tradeMwh: quantiles(hours.map((h) => h.tradeMwh)),
    activePct: hours.length ? (hours.filter((h) => h.tradeMwh > 0.1).length / hours.length) * 100 : 0,
  };
}

/** Bir sınırın (saatlik GİP hacminin payı) kaç saatte bağlayacağı ve kesilen işlem payı */
export function capImpact(hours: ParticipationHour[], capShare: number): { bindingPct: number; cutTradePct: number } {
  let binding = 0;
  let total = 0;
  let cut = 0;
  for (const h of hours) {
    total += h.tradeMwh;
    const cap = capShare * h.gipVolumeMwh;
    if (h.tradeMwh > cap) {
      binding++;
      cut += h.tradeMwh - cap;
    }
  }
  return { bindingPct: hours.length ? (binding / hours.length) * 100 : 0, cutTradePct: total > 0 ? (cut / total) * 100 : 0 };
}

export interface LiquidityHour {
  t: number;
  volumeMwh: number;
  price: number | null;
  minPrice: number | null;
  maxPrice: number | null;
}

export interface LiquidityProfile {
  /** "YYYY-MM" → saatlik hacim medyanı ve P10 (MWh) */
  byMonth: Array<{ month: string; hours: number; median: number; p10: number }>;
  /** Günün saati (0–23) → hacim medyanı ve P10 */
  byHour: Array<{ hour: number; median: number; p10: number }>;
  /** Hacim beşte birliklerine göre fiyat aralığı (en yüksek − en düşük) / ağırlıklı ortalama medyanı: hacim düşükken aralık açılıyor mu? */
  rangeByVolume: Array<{ quintile: number; volumeFrom: number; volumeTo: number; rangePct: number }>;
}

export function liquidityProfile(hours: LiquidityHour[]): LiquidityProfile {
  const valid = hours.filter((h) => h.volumeMwh > 0);
  const group = <K>(key: (h: LiquidityHour) => K) => {
    const m = new Map<K, number[]>();
    for (const h of valid) {
      const k = key(h);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(h.volumeMwh);
    }
    return m;
  };
  const stat = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return { median: quantile(s, 0.5), p10: quantile(s, 0.1) };
  };
  const byMonth = Array.from(group((h) => new Date(h.t).toISOString().slice(0, 7)).entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, xs]) => ({ month, hours: xs.length, ...stat(xs) }));
  const byHour = Array.from(group((h) => new Date(h.t).getUTCHours()).entries())
    .sort(([a], [b]) => a - b)
    .map(([hour, xs]) => ({ hour, ...stat(xs) }));
  const ranged = valid
    .filter((h) => h.price !== null && h.price > 0 && h.minPrice !== null && h.maxPrice !== null)
    .sort((a, b) => a.volumeMwh - b.volumeMwh);
  const rangeByVolume = [0, 1, 2, 3, 4]
    .map((q) => {
      const part = ranged.slice(Math.floor((q * ranged.length) / 5), Math.floor(((q + 1) * ranged.length) / 5));
      if (!part.length) return null;
      const r = part.map((h) => (h.maxPrice! - h.minPrice!) / h.price!).sort((a, b) => a - b);
      return { quintile: q + 1, volumeFrom: part[0].volumeMwh, volumeTo: part[part.length - 1].volumeMwh, rangePct: quantile(r, 0.5) * 100 };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return { byMonth, byHour, rangeByVolume };
}
