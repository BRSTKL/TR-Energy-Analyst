/**
 * TR-Energy Analyst - Dengesizlik bütçesi (PLAN 17.1)
 *
 * Bir portföyün gelecek yılın aylık dengesizlik + KÜPST bütçesi ve kötü durum aralığı, tarihsel benzetimle. Fiyat
 * tahmini yapılmaz: geçmiş günler yeniden oynatılır.
 *
 * Gün: portföyün o günkü 24 saati, sapma ve fiyat birlikte (aynı takvim günü). Sapma ile sistem yönü aynı havadan
 * etkilendiği için gün içinde birlikte tutulur; ayrı ayrı örneklemek bu ilişkiyi koparır ve 2026 kuralının "sistemle
 * aynı yönde %6" maliyetini düşük gösterir.
 * Ay: hedef yılın her ayı, geçmiş yılların aynı ayındaki günlerden yerine koyarak gün çekilip toplanır (sabit tohum).
 * Medyan bütçe, P90 ve P95 kötü durumdur (aylık riske maruz değer); yıl, her benzetimde 12 ayın toplamıdır.
 *
 * Senaryo:
 * - Kural: katsayılar (CUSTOM profil) her saate aynen uygulanır. Fiyat formülle kurulur (resmi dengesizlik fiyatı
 *   kullanılmaz: makas ölçeklenince ve kural değişince resmi fiyat geçerli değildir).
 * - Makas: SMF' = PTF + s × (SMF − PTF); s = hedef makas / o yılın ortalama makası (ikisi de reel TL). Yıl içi mevsimsellik
 *   korunur, düzey hedefe taşınır.
 * - Birim: saatin nominal tutarı priceScale(t) ile reel TL'ye (son ayın fiyat düzeyi) çevrilir; taban ve negatif fiyat
 *   kuralları nominal TL'de uygulanır (ayrıştırmadaki gibi).
 * - KÜPST: saatin KÜPST miktarı (fazla sapma × oran, MWh) × max(PTF, SMF'); miktar mevzuat fonksiyonlarıyla dışarıda
 *   hesaplanır (santral ya da topluluk bazında).
 * - Büyüme: tutarlar (1 + g) ile çarpılır; birim maliyet değişmez.
 * - Üretim (17.5): verilirse bütçe = MWh başına maliyet × üretim. Birim maliyet aynı benzetimden (çekilen günlerin
 *   maliyeti / üretimi); üretim ayrıca tahmin edilir (yeni santral tam yıl, hidro senaryosu). Geçmişle sınamada
 *   ıskalamaların çoğu üretimden geldi (2025 kurak: aynı hidro santraller 2026'da ×1,41), MWh başına maliyet kararlıydı.
 * SAF: I/O yok.
 */

import { imbalanceCostOf } from "@/lib/calculations/engine";
import type { ImbalancePricingProfile, SystemDirection } from "@/lib/calculations/types";

export interface BudgetHour {
  /** ms; duvar saati UTC alanında */
  t: number;
  ptf: number;
  smf: number;
  systemDirection: SystemDirection;
  /** Uzlaştırma birimlerinin net sapması (gerçekleşen − plan), MWh */
  unitDeviations: number[];
  /** KÜPST miktarı: Σ fazla sapma × fiyat katsayısı (MWh); tutar = bu × max(PTF, SMF) */
  kupstQty: number;
  /** Portföyün üretimi (MWh) */
  actualMwh: number;
}

export interface BudgetScenario {
  key: string;
  label: string;
  /** Katsayı kuralı (her saate aynen) */
  rule: Pick<ImbalancePricingProfile, "positiveSurplusCoef" | "positiveOtherCoef" | "negativeDeficitCoef" | "negativeOtherCoef" | "floors">;
  /** Hedef ortalama makas (|SMF − PTF|, reel TL/MWh); null: geçmiş yılların makası olduğu gibi */
  targetSpreadReal: number | null;
  /** Portföy büyümesi (0,1 = %10) */
  growth?: number;
}

export interface BudgetStat {
  expected: number;
  p50: number;
  p90: number;
  p95: number;
}

export interface BudgetMonth extends BudgetStat {
  /** "MM" */
  month: string;
  /** MWh başına maliyet (reel TL/MWh) dağılımı */
  unit: BudgetStat;
  /** Hedef yılın bu ayındaki gün sayısı */
  days: number;
  /** Örneklenen günlerin kaynağı: yıl → gün sayısı */
  sourceDays: Record<string, number>;
  /** Bütçedeki üretim (MWh): verilen üretim ya da geçmiş günlerin ortalaması */
  mwh: number;
}

export interface BudgetResult {
  scenario: BudgetScenario;
  year: number;
  months: BudgetMonth[];
  total: BudgetStat & { mwh: number };
  /** Geçmiş yılların reel ortalama makası ve uygulanan ölçek */
  spreadByYear: Record<string, { realSpread: number; scale: number }>;
  /** Günü olmayan aylar (örneklenecek geçmiş gün yok) */
  missingMonths: string[];
}

export interface BudgetOptions {
  year: number;
  /** Nominal TL → reel TL çarpanı (saatin ayına göre) */
  priceScale: (t: number) => number;
  sims?: number;
  seed?: number;
  /** Ay ("MM") → üretim (MWh). Verilirse bütçe = birim maliyet × üretim; verilmeyen ay geçmiş günlerin üretimiyle */
  production?: Record<string, number>;
  /** Yıl → gün maliyeti çarpanı (ör. eski yılın günlerini son yılın tahmin kalitesine taşımak; yearQualityScale) */
  yearCostScale?: Record<string, number>;
  /** Ay ("MM") → tutar çarpanı (ör. reel TL'den nominal TL'ye aylık enflasyon yolu; inflationPath). Birim maliyete de uygulanır */
  monthScale?: Record<string, number>;
  /** Blok uzunluğu (gün): ay, aynı yılın aynı ayından art arda günlerle doldurulur (hava ve sistem yönü birkaç gün sürer).
   *  1 = günler bağımsız. Blok ay içinde başa sarar. */
  blockDays?: number;
}

const DAY = 86_400_000;

/** Küçük, tekrarlanabilir rastgele sayı üreteci (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

const stat = (values: number[]): BudgetStat => {
  const s = [...values].sort((a, b) => a - b);
  return { expected: values.reduce((a, b) => a + b, 0) / (values.length || 1), p50: quantile(s, 0.5), p90: quantile(s, 0.9), p95: quantile(s, 0.95) };
};

/** Geçmiş yılların reel ortalama makası: |SMF − PTF| × priceScale */
export function realSpreadByYear(hours: BudgetHour[], priceScale: (t: number) => number): Record<string, number> {
  const acc = new Map<string, { s: number; n: number }>();
  for (const h of hours) {
    const y = new Date(h.t).getUTCFullYear().toString();
    const a = acc.get(y) ?? { s: 0, n: 0 };
    a.s += Math.abs(h.smf - h.ptf) * priceScale(h.t);
    a.n++;
    acc.set(y, a);
  }
  return Object.fromEntries(Array.from(acc.entries()).map(([y, a]) => [y, a.s / a.n]));
}

/** Bir saatin senaryodaki maliyeti (reel TL): birimlerin dengesizliği + KÜPST */
export function hourCost(h: BudgetHour, scenario: BudgetScenario, spreadScale: number, priceScale: (t: number) => number): number {
  const smf = h.ptf + spreadScale * (h.smf - h.ptf);
  const market = { timestamp: new Date(h.t), ptf: h.ptf, smf, systemDirection: h.systemDirection, imbalancePosPrice: null, imbalanceNegPrice: null };
  const profile: ImbalancePricingProfile = { mode: "CUSTOM", ...scenario.rule };
  let cost = 0;
  for (const d of h.unitDeviations) cost += imbalanceCostOf(d, market, profile);
  cost += h.kupstQty * Math.max(h.ptf, smf);
  return cost * priceScale(h.t);
}

export function imbalanceBudget(hours: BudgetHour[], scenario: BudgetScenario, opts: BudgetOptions): BudgetResult {
  const sims = opts.sims ?? 2000;
  const growth = 1 + (scenario.growth ?? 0);
  const realSpread = realSpreadByYear(hours, opts.priceScale);
  const scaleOf = (y: string) => (scenario.targetSpreadReal !== null && realSpread[y] > 0 ? scenario.targetSpreadReal / realSpread[y] : 1);

  // Günler: takvim günü → maliyet ve üretim (gün tam olmasa da toplanır; eksik saatler maliyeti düşük gösterir, kaynak yıl sayılır)
  const days = new Map<string, { date: string; month: string; year: string; cost: number; mwh: number }>();
  for (const h of hours) {
    const key = new Date(Math.floor(h.t / DAY) * DAY).toISOString().slice(0, 10);
    const year = key.slice(0, 4);
    const d = days.get(key) ?? { date: key, month: key.slice(5, 7), year, cost: 0, mwh: 0 };
    d.cost += hourCost(h, scenario, scaleOf(year), opts.priceScale) * (opts.yearCostScale?.[year] ?? 1);
    d.mwh += h.actualMwh;
    days.set(key, d);
  }
  const byMonth = new Map<string, Array<{ date: string; year: string; cost: number; mwh: number }>>();
  for (const d of Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date))) {
    if (!byMonth.has(d.month)) byMonth.set(d.month, []);
    byMonth.get(d.month)!.push(d);
  }
  const block = Math.max(1, Math.floor(opts.blockDays ?? 1));

  const rand = rng(opts.seed ?? 1);
  const yearSims = new Float64Array(sims);
  const months: BudgetMonth[] = [];
  const missingMonths: string[] = [];
  let totalMwh = 0;
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const n = new Date(Date.UTC(opts.year, m, 0)).getUTCDate();
    const pool = byMonth.get(mm) ?? [];
    if (!pool.length) {
      missingMonths.push(mm);
      continue;
    }
    const meanCost = pool.reduce((a, d) => a + d.cost, 0) / pool.length;
    const meanMwh = pool.reduce((a, d) => a + d.mwh, 0) / pool.length;
    const prod = opts.production?.[mm];
    const mwh = (prod ?? meanMwh * n) * growth;
    const ms = opts.monthScale?.[mm] ?? 1;
    // Yıl bölütleri (aynı yılın bu ayının günleri, tarih sırasıyla): blok bir bölütün içinde art arda gider
    const segStart = new Map<string, { from: number; len: number }>();
    pool.forEach((d, i) => {
      const g = segStart.get(d.year);
      if (g) g.len++;
      else segStart.set(d.year, { from: i, len: 1 });
    });
    const vals = new Array<number>(sims);
    const units = new Array<number>(sims);
    for (let s = 0; s < sims; s++) {
      let c = 0;
      let w = 0;
      for (let i = 0; i < n; ) {
        const start = Math.floor(rand() * pool.length);
        const seg = segStart.get(pool[start].year)!;
        for (let b = 0; b < block && i < n; b++, i++) {
          const d = pool[seg.from + ((start - seg.from + b) % seg.len)];
          c += d.cost;
          w += d.mwh;
        }
      }
      units[s] = w > 0 ? (c / w) * ms : 0;
      vals[s] = (prod === undefined ? c * growth : (c / (w || 1)) * mwh) * ms;
      yearSims[s] += vals[s];
    }
    const meanUnit = (meanMwh > 0 ? meanCost / meanMwh : 0) * ms;
    const st = stat(vals);
    const sourceDays: Record<string, number> = {};
    for (const d of pool) sourceDays[d.year] = (sourceDays[d.year] ?? 0) + 1;
    months.push({
      month: mm,
      days: n,
      sourceDays,
      mwh,
      unit: { ...stat(units), expected: meanUnit },
      ...st,
      expected: prod === undefined ? meanCost * n * growth * ms : meanUnit * mwh,
    });
    totalMwh += mwh;
  }
  const total = stat(Array.from(yearSims));
  return {
    scenario,
    year: opts.year,
    months,
    total: { ...total, expected: months.reduce((a, m) => a + m.expected, 0), mwh: totalMwh },
    spreadByYear: Object.fromEntries(Object.entries(realSpread).map(([y, v]) => [y, { realSpread: v, scale: scaleOf(y) }])),
    missingMonths,
  };
}

/** Santralin aylık üretimi (MWh); null: o ay verisi yok */
export interface PlantMonths {
  key: string;
  type: string;
  mwh: Array<number | null>;
}

/**
 * Yeni santral tam yıl (17.5): santral ilk üretim ayından önce (ya da verisi olmayan ayda) eksik sayılır; eksik ay, aynı
 * türdeki tam yıl santrallerinin o ayki üretimi × santralin ölçeği ile doldurulur. Ölçek: santralin var olan aylardaki
 * üretimi / aynı aylarda emsallerin üretimi. Aynı türde tam yıl emsali yoksa ay doldurulmaz. İlk ay (kısmi olabilir)
 * var sayılır: yeni santralin yıllığı biraz düşük kalabilir.
 */
export function runRateProduction(
  plants: PlantMonths[],
  months = 12
): { total: number[]; perPlant: Record<string, number[]>; filled: Array<{ key: string; addedMwh: number }> } {
  const missing = (p: PlantMonths) => {
    const start = p.mwh.slice(0, months).findIndex((v) => v !== null && v > 0);
    return Array.from({ length: months }, (_, m) => start < 0 || m < start || p.mwh[m] === null);
  };
  const miss = new Map(plants.map((p) => [p.key, missing(p)]));
  const total = new Array<number>(months).fill(0);
  const perPlant: Record<string, number[]> = {};
  const filled: Array<{ key: string; addedMwh: number }> = [];
  for (const p of plants) {
    perPlant[p.key] = Array.from({ length: months }, (_, m) => p.mwh[m] ?? 0);
    for (let m = 0; m < months; m++) total[m] += p.mwh[m] ?? 0;
    const pm = miss.get(p.key)!;
    if (!pm.some(Boolean) || pm.every(Boolean)) continue;
    const peers = plants.filter((q) => q.type === p.type && q.key !== p.key && !miss.get(q.key)!.some(Boolean));
    if (!peers.length) continue;
    const peerAt = (m: number) => peers.reduce((a, q) => a + (q.mwh[m] ?? 0), 0);
    let own = 0;
    let base = 0;
    for (let m = 0; m < months; m++)
      if (!pm[m]) {
        own += p.mwh[m] ?? 0;
        base += peerAt(m);
      }
    if (base <= 0) continue;
    let added = 0;
    for (let m = 0; m < months; m++)
      if (pm[m]) {
        const v = (own / base) * peerAt(m) - (p.mwh[m] ?? 0);
        total[m] += v;
        perPlant[p.key][m] += v;
        added += v;
      }
    filled.push({ key: p.key, addedMwh: added });
  }
  return { total, perPlant, filled };
}

export type HydroScenario = "dry" | "normal" | "wet";

/**
 * Üretim senaryoları (17.3): santral başına iki yılın aylık üretimi (önceki yıl tam, son yıl verisi olan aylar; ikisi de
 * yeni santraller için tam yıla tamamlanmış). Son yılın verisi olmayan ayı = önceki yılın o ayı × santralin son yıl /
 * önceki yıl oranı (ortak aylardan). Hidro (HES): kurak = önceki yıl, yağışlı = son yıl, normal = ortalama. Diğer
 * türler her senaryoda son yılın düzeyinde (yağışa bağlı değil; kapasite değişimini izler).
 */
export function productionScenarios(
  plants: Array<{ key: string; type: string }>,
  prev: Record<string, number[]>,
  latest: Record<string, Array<number | null>>
): Record<HydroScenario, number[]> {
  const out: Record<HydroScenario, number[]> = { dry: new Array(12).fill(0), normal: new Array(12).fill(0), wet: new Array(12).fill(0) };
  for (const p of plants) {
    const a = prev[p.key] ?? new Array(12).fill(0);
    const b = latest[p.key] ?? new Array(12).fill(null);
    let sa = 0;
    let sb = 0;
    for (let m = 0; m < 12; m++)
      if (b[m] !== null && b[m] !== undefined) {
        sa += a[m] ?? 0;
        sb += b[m]!;
      }
    const r = sa > 0 ? sb / sa : 1;
    const full = Array.from({ length: 12 }, (_, m) => (b[m] !== null && b[m] !== undefined ? b[m]! : (a[m] ?? 0) * r));
    const hydro = p.type === "HES";
    for (let m = 0; m < 12; m++) {
      const dry = hydro ? a[m] ?? 0 : full[m];
      out.dry[m] += dry;
      out.wet[m] += full[m];
      out.normal[m] += (dry + full[m]) / 2;
    }
  }
  return out;
}

/**
 * Tahmin kalitesi taşıma (17.3): son yılın verisi olmayan aylar yalnız önceki yılın günlerinden çekilir; portföyün tahmini
 * yıldan yıla değiştiyse (ör. Gain 2026'da MWh başına maliyet ×0,72) o aylar eski kaliteyi taşır. Çarpan: ortak aylarda
 * (her iki yılın verisi olan aylar) son yılın MWh başına maliyeti / önceki yılınki, aynı senaryoyla. Önceki yılın bütün
 * günlerine uygulanır: varsayım "en güncel tahmin kalitesi sürer".
 */
export function yearQualityScale(hours: BudgetHour[], scenario: BudgetScenario, priceScale: (t: number) => number, prevYear: number, lastYear: number): number {
  const realSpread = realSpreadByYear(hours, priceScale);
  const scale = (y: string) => (scenario.targetSpreadReal !== null && realSpread[y] > 0 ? scenario.targetSpreadReal / realSpread[y] : 1);
  const lastMonths = new Set(hours.filter((h) => new Date(h.t).getUTCFullYear() === lastYear).map((h) => new Date(h.t).getUTCMonth()));
  const acc: Record<string, { c: number; w: number }> = { [prevYear]: { c: 0, w: 0 }, [lastYear]: { c: 0, w: 0 } };
  for (const h of hours) {
    const d = new Date(h.t);
    const y = String(d.getUTCFullYear());
    if (!acc[y] || !lastMonths.has(d.getUTCMonth())) continue;
    acc[y].c += hourCost(h, scenario, scale(y), priceScale);
    acc[y].w += h.actualMwh;
  }
  const a = acc[prevYear].w > 0 ? acc[prevYear].c / acc[prevYear].w : 0;
  const b = acc[lastYear].w > 0 ? acc[lastYear].c / acc[lastYear].w : 0;
  return a > 0 && b > 0 ? b / a : 1;
}

/**
 * Aylık enflasyon yolu (17.6): yıllık oran ay ay bileşik uygulanır. Taban ay ("YYYY-MM", reel TL'nin fiyat düzeyi) ile
 * hedef yılın her ayı arasındaki ay farkı k için çarpan = (1 + yıllık)^(k / 12). Ör. taban Eylül 2026, yıllık %42:
 * Ocak 2027 ×1,12, Aralık 2027 ×1,55; yıl ortalaması ≈ ×1,32 (tek çarpan ×1,42 değil).
 */
export function inflationPath(annualPct: number, baseMonth: string, year: number): Record<string, number> {
  const by = Number(baseMonth.slice(0, 4));
  const bm = Number(baseMonth.slice(5, 7));
  return Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => {
      const k = (year - by) * 12 + (i + 1 - bm);
      return [String(i + 1).padStart(2, "0"), Math.pow(1 + annualPct / 100, k / 12)];
    })
  );
}
