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
  const days = new Map<string, { month: string; year: string; cost: number; mwh: number }>();
  for (const h of hours) {
    const key = new Date(Math.floor(h.t / DAY) * DAY).toISOString().slice(0, 10);
    const year = key.slice(0, 4);
    const d = days.get(key) ?? { month: key.slice(5, 7), year, cost: 0, mwh: 0 };
    d.cost += hourCost(h, scenario, scaleOf(year), opts.priceScale);
    d.mwh += h.actualMwh;
    days.set(key, d);
  }
  const byMonth = new Map<string, Array<{ year: string; cost: number; mwh: number }>>();
  for (const d of Array.from(days.values())) {
    if (!byMonth.has(d.month)) byMonth.set(d.month, []);
    byMonth.get(d.month)!.push(d);
  }

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
    const vals = new Array<number>(sims);
    const units = new Array<number>(sims);
    for (let s = 0; s < sims; s++) {
      let c = 0;
      let w = 0;
      for (let i = 0; i < n; i++) {
        const d = pool[Math.floor(rand() * pool.length)];
        c += d.cost;
        w += d.mwh;
      }
      units[s] = w > 0 ? c / w : 0;
      vals[s] = prod === undefined ? c * growth : units[s] * mwh;
      yearSims[s] += vals[s];
    }
    const meanUnit = meanMwh > 0 ? meanCost / meanMwh : 0;
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
      expected: prod === undefined ? meanCost * n * growth : meanUnit * mwh,
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
export function runRateProduction(plants: PlantMonths[], months = 12): { total: number[]; filled: Array<{ key: string; addedMwh: number }> } {
  const missing = (p: PlantMonths) => {
    const start = p.mwh.slice(0, months).findIndex((v) => v !== null && v > 0);
    return Array.from({ length: months }, (_, m) => start < 0 || m < start || p.mwh[m] === null);
  };
  const miss = new Map(plants.map((p) => [p.key, missing(p)]));
  const total = new Array<number>(months).fill(0);
  const filled: Array<{ key: string; addedMwh: number }> = [];
  for (const p of plants) {
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
        added += v;
      }
    filled.push({ key: p.key, addedMwh: added });
  }
  return { total, filled };
}
