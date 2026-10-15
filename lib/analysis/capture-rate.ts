/**
 * TR-Energy Analyst - Capture rate (PLAN 19.1)
 *
 * Santral ürettiği saatlerde piyasanın ortalamasına göre ne fiyat alıyor?
 *   capture fiyatı = Σ (üretim × PTF) / Σ üretim
 *   baz PTF        = verisi olan saatlerin PTF ortalaması (her saat bir kez; raporun PPA kutusuyla aynı tanım)
 *   capture rate   = capture fiyatı / baz PTF (%); %100'ün altı: üretim fiyatın düşük olduğu saatlerde yoğun
 *   profil kaybı   = Σ üretim × (baz PTF − PTF) = üretim × (baz − capture): baz yük fiyatından satılsaydı fark (TL)
 * Sıfır ve düşük fiyatlı saat eşikleri piyasa özetiyle aynı (market-summary). Teknoloji toplamı üretim ağırlıklıdır
 * (santrallerin üretimleri birleştirilir); santraller arası dağılım ağırlıksızdır (her santral bir nokta).
 * SAF: I/O yok.
 */

import { LOW_PRICE_MAX, ZERO_PRICE_MAX } from "@/lib/analysis/market-summary";

export interface CaptureHour {
  /** ms; duvar saati UTC alanında */
  t: number;
  mwh: number;
  ptf: number;
}

export interface CaptureStat {
  hours: number;
  mwh: number;
  capturePriceTl: number;
  baseloadPtfTl: number;
  /** Baz PTF sıfır ya da üretim yoksa null */
  ratePct: number | null;
  profileLossTl: number;
  /** PTF ≤ ZERO_PRICE_MAX saatlerindeki üretimin payı (%) */
  zeroSharePct: number;
  /** PTF < LOW_PRICE_MAX saatlerindeki üretimin payı (%; sıfır fiyatlılar dahil) */
  lowSharePct: number;
}

/** Saatler (aynı saat birden çok kez gelebilir: teknoloji toplamında santraller) → capture göstergeleri */
export function captureStat(hours: CaptureHour[]): CaptureStat {
  const ptfByHour = new Map<number, number>();
  let mwh = 0;
  let value = 0;
  let zero = 0;
  let low = 0;
  for (const h of hours) {
    ptfByHour.set(h.t, h.ptf);
    mwh += h.mwh;
    value += h.mwh * h.ptf;
    if (h.ptf < LOW_PRICE_MAX) {
      low += h.mwh;
      if (h.ptf <= ZERO_PRICE_MAX) zero += h.mwh;
    }
  }
  const base = ptfByHour.size ? Array.from(ptfByHour.values()).reduce((a, b) => a + b, 0) / ptfByHour.size : 0;
  const capture = mwh > 0 ? value / mwh : 0;
  return {
    hours: ptfByHour.size,
    mwh,
    capturePriceTl: capture,
    baseloadPtfTl: base,
    ratePct: mwh > 0 && base > 0 ? (capture / base) * 100 : null,
    profileLossTl: mwh * base - value,
    zeroSharePct: mwh > 0 ? (zero / mwh) * 100 : 0,
    lowSharePct: mwh > 0 ? (low / mwh) * 100 : 0,
  };
}

const monthOf = (t: number) => new Date(t).toISOString().slice(0, 7);

/** Ay ("YYYY-MM") başına capture göstergeleri (baz PTF o ayın saatlerinden) */
export function monthlyCapture(hours: CaptureHour[]): Array<{ month: string } & CaptureStat> {
  const byMonth = new Map<string, CaptureHour[]>();
  for (const h of hours) {
    const m = monthOf(h.t);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(h);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, hs]) => ({ month, ...captureStat(hs) }));
}

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export interface GroupCapture {
  key: string;
  plants: number;
  /** Üretim ağırlıklı (santraller birleştirilmiş) */
  pooled: CaptureStat;
  monthly: Array<{ month: string } & CaptureStat>;
  /** Santrallerin capture rate dağılımı (ağırlıksız; üretimi minMwh'ın altındakiler hariç) */
  distribution: { n: number; p10: number; p50: number; p90: number } | null;
}

/**
 * Grup (teknoloji, alt tip) başına capture: santrallerin saatleri birleştirilir (üretim ağırlıklı), dağılım santral
 * başına. minMwh: dağılıma girmek için en az üretim (küçük santrallerde oran gürültülü).
 */
export function groupCapture(plants: Array<{ key: string; group: string; hours: CaptureHour[] }>, minMwh = 1000): GroupCapture[] {
  const groups = new Map<string, Array<{ key: string; hours: CaptureHour[] }>>();
  for (const p of plants) {
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group)!.push(p);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, ps]) => {
      const all = ps.flatMap((p) => p.hours);
      const rates = ps
        .map((p) => captureStat(p.hours))
        .filter((s) => s.mwh >= minMwh && s.ratePct !== null)
        .map((s) => s.ratePct!)
        .sort((a, b) => a - b);
      return {
        key,
        plants: ps.length,
        pooled: captureStat(all),
        monthly: monthlyCapture(all),
        distribution: rates.length ? { n: rates.length, p10: quantile(rates, 0.1), p50: quantile(rates, 0.5), p90: quantile(rates, 0.9) } : null,
      };
    });
}

/** Değerin dağılımdaki yüzdelik yeri (0–100; yüksek capture rate = iyi). Boş dağılımda null */
export function percentileOf(value: number, sortedValues: number[]): number | null {
  if (!sortedValues.length) return null;
  const below = sortedValues.filter((v) => v < value).length;
  const equal = sortedValues.filter((v) => v === value).length;
  return ((below + equal / 2) / sortedValues.length) * 100;
}
