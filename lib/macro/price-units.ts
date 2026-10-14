/**
 * TR-Energy Analyst - Fiyat birimleri: nominal TL, reel TL ve USD
 *
 * TL rakamlar yıllar arasında doğrudan kıyaslanamaz: 2024–2026'da birikmiş enflasyon ~%90'dır. "Makas iki katına çıktı"
 * cümlesi nominal TL'de doğru, ama fiyatların genel artışı düşülmeden yanıltıcıdır. Bu modül her saatlik TL değerini
 * kendi ayının çarpanıyla dönüştürür:
 *   - Reel TL: değer × TÜFE[taban ay] / TÜFE[saatin ayı] (taban: serideki son ay, "Eylül 2026 TL'si")
 *   - USD:     değer / (TL/USD)[saatin ayı]
 * Kur EPİAŞ'ın PTF TL / PTF USD oranından (aylık medyan), TÜFE TCMB tablosundaki aylık değişimlerden zincirlenir
 * (scripts/macro-sync.mts → lib/macro/macro-series.json). Serinin dışında kalan ay en yakın aya bağlanır ve
 * `filled` listesinde bildirilir (ör. TÜFE'si henüz açıklanmamış son ay).
 * SAF: I/O yok.
 */

export interface MacroSeries {
  fetchedAt: string;
  /** "YYYY-MM" → TL/USD (aylık medyan) */
  usdTry: Record<string, number>;
  /** "YYYY-MM" → TÜFE endeksi (zincirlenmiş; yalnız oranları anlamlı) */
  cpi: Record<string, number>;
  sources: { usdTry: string; cpi: string };
}

export type PriceUnit = "TL" | "REAL" | "USD";

export const PRICE_UNITS: PriceUnit[] = ["TL", "REAL", "USD"];

export interface PriceConverter {
  unit: PriceUnit;
  /** Reel TL'nin taban ayı ("YYYY-MM"); diğer birimlerde null */
  baseMonth: string | null;
  /** Saatin TL değerini bu birime çeviren çarpan */
  factor: (t: number | Date | string) => number;
  /** Kısa birim: "TL", "TL (Eyl 2026)", "USD" */
  short: string;
  /** Uzun birim: "nominal TL", "Eylül 2026 TL'si", "ABD doları" */
  label: string;
  /** Seride verisi olmadığı için en yakın aya bağlanan aylar */
  filled: Set<string>;
}

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Zaman damgasının ayı (duvar saati UTC alanında, uygulamanın kuralı) */
export const monthOf = (t: number | Date | string) => new Date(t).toISOString().slice(0, 7);

/** "2026-09" → "Eylül 2026" */
export const monthLabelTr = (m: string) => `${MONTHS_TR[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const sortedKeys = (r: Record<string, number>) => Object.keys(r).filter((k) => r[k] > 0).sort();

/** Serideki son ay; boşsa null */
export const latestMonth = (r: Record<string, number>): string | null => sortedKeys(r).at(-1) ?? null;

/** Ay serideyse kendisi, değilse en yakın ay (önce geçmişe, sonra geleceğe bakılır) */
function nearest(keys: string[], m: string): string | null {
  if (!keys.length) return null;
  let prior: string | null = null;
  for (const k of keys) {
    if (k === m) return k;
    if (k < m) prior = k;
    else return prior ?? k;
  }
  return prior;
}

export function makeConverter(series: MacroSeries, unit: PriceUnit, baseMonth?: string): PriceConverter {
  const filled = new Set<string>();
  if (unit === "TL") return { unit, baseMonth: null, factor: () => 1, short: "TL", label: "nominal TL", filled };

  const source = unit === "REAL" ? series.cpi : series.usdTry;
  const keys = sortedKeys(source);
  if (!keys.length) throw new Error(unit === "REAL" ? "TÜFE serisi boş" : "TL/USD serisi boş");
  const cache = new Map<string, number>();
  const valueAt = (m: string) => {
    let v = cache.get(m);
    if (v === undefined) {
      const k = nearest(keys, m)!;
      if (k !== m) filled.add(m);
      v = source[k];
      cache.set(m, v);
    }
    return v;
  };

  if (unit === "USD") return { unit, baseMonth: null, factor: (t) => 1 / valueAt(monthOf(t)), short: "USD", label: "ABD doları", filled };

  const base = baseMonth && source[baseMonth] ? baseMonth : keys[keys.length - 1];
  const baseCpi = source[base];
  const short = `TL (${MONTHS_TR[Number(base.slice(5, 7)) - 1].slice(0, 3)} ${base.slice(0, 4)})`;
  return { unit, baseMonth: base, factor: (t) => baseCpi / valueAt(monthOf(t)), short, label: `${monthLabelTr(base)} TL'si`, filled };
}

/** Ay listesinin ortalama TÜFE düzeyi (dönemler arası fiyat oranı için) */
export function averagePriceLevel(series: MacroSeries, months: string[]): number | null {
  const keys = sortedKeys(series.cpi);
  const vals = months.map((m) => nearest(keys, m)).filter((k): k is string => !!k).map((k) => series.cpi[k]);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** İki dönemin genel fiyat oranı (B / A); ör. 2025 Oca–Ağu → 2026 Oca–Ağu ≈ 1,32 */
export function priceLevelRatio(series: MacroSeries, monthsA: string[], monthsB: string[]): number | null {
  const a = averagePriceLevel(series, monthsA);
  const b = averagePriceLevel(series, monthsB);
  return a && b ? b / a : null;
}

/** "YYYY-MM-DD" … "YYYY-MM-DD" aralığındaki aylar */
export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const last = end.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > last) break;
    out.push(key);
    m === 12 ? ((m = 1), y++) : m++;
  }
  return out;
}

/** Nominal değişimi (%) fiyat oranıyla reel değişime çevirir */
export const realChangePct = (nominalPct: number, priceRatio: number) => ((1 + nominalPct / 100) / priceRatio - 1) * 100;
