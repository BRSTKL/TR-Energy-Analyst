/**
 * TR-Energy Analyst - PTF motoru: günlük seviye düzeltmesi (saf, I/O yok; deney: scripts/ptf/level-correction.mts, variants.mts)
 *
 * T günü tahminine, dünkü (T-1) düzeltilmemiş tahminin günlük ortalama hatasının γ katı eklenir ve [0, tavan]'a kırpılır:
 *   tahmin'(T, h) = tahmin(T, h) + γ · ortalama_h( gerçek(T-1, h) − tahmin_ham(T-1, h) )
 * Dünkü hata kesimde bilinir (T-1'in PTF'si T-2 14:00'te yayımlı, T-1 tahmini değişmeyen kayıtta). Hata düzeltilmemiş
 * tahminden hesaplanır (düzeltilmişten değil: geri besleme olmaz). Dünkü kayıt ya da gerçekleşen yoksa düzeltme 0.
 * γ = 0,5: 29.10.2026'da seçim döneminde (2025-07 – 2026-03) seçildi; 0,3–0,6 arası fark yok. Kazanç çalkantılı aylarda
 * (günlük ortalama hatası 600'ü aşan 24 günde 852 → 693), sakin aylarda ≈ 0.
 */

import type { DayResult } from "./replay";

export const LEVEL_GAMMA = 0.5;
const DAY_MS = 86_400_000;
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const ok = (a: ReadonlyArray<number> | null | undefined): a is number[] =>
  !!a && a.length === 24 && a.every((x) => Number.isFinite(x));

/** Bugüne eklenecek düzeltme (TL/MWh): γ · dünkü günlük ortalama hata; veri eksikse 0. `clip`: dünkü hatanın en çok ±clip kadarı */
export function levelAdjustment(
  prevActual: ReadonlyArray<number> | null | undefined,
  prevBase: ReadonlyArray<number> | null | undefined,
  gamma: number = LEVEL_GAMMA,
  clip: number | null = null
): number {
  if (!ok(prevActual) || !ok(prevBase)) return 0;
  let e = mean(prevActual.map((a, h) => a - prevBase[h]));
  if (clip !== null) e = Math.max(-clip, Math.min(clip, e));
  return gamma * e;
}

/** Tahmine düzeltmeyi ekler ve [0, tavan]'a kırpar (`cap` null ise üst sınır yok) */
export function applyLevel(pred: number[], adj: number, cap: number | null): number[] {
  return pred.map((v) => Math.max(0, cap === null ? v + adj : Math.min(cap, v + adj)));
}

/** Tavan: önceki 60 günde en az 3 saat görülen en yüksek fiyat (lib/ptf/features.ts inferCap ile aynı fikir) */
export function rollingCaps(results: DayResult[]): number[] {
  return results.map((r, i) => {
    const cnt = new Map<number, number>();
    for (const w of results.slice(Math.max(0, i - 60), i))
      for (const a of w.actual) cnt.set(Math.round(a), (cnt.get(Math.round(a)) ?? 0) + 1);
    let c = 0;
    for (const [p, n] of cnt) if (n >= 3 && p > c) c = p;
    return c > 0 ? c : Math.max(...r.actual);
  });
}

/**
 * `baseId` tahminine düzeltme uygular; sonucu her günün `preds[outId]`'ine yazar (yeni dizi döner). Yalnız ardışık günler
 * düzeltilir. `cap`: verilmezse her gün için `rollingCaps`; sayı sabit tavan; null üst sınır yok.
 */
export function correctLevel(
  results: DayResult[],
  baseId: string,
  outId: string,
  gamma: number = LEVEL_GAMMA,
  clip: number | null = null,
  cap?: number | null
): DayResult[] {
  const caps = cap === undefined ? rollingCaps(results) : null;
  return results.map((r, i) => {
    const prev = results[i - 1];
    const consecutive =
      !!prev &&
      Date.parse(`${r.day}T00:00:00Z`) - Date.parse(`${prev.day}T00:00:00Z`) === DAY_MS;
    const adj = consecutive
      ? levelAdjustment(prev.actual, prev.preds[baseId], gamma, clip)
      : 0;
    return {
      ...r,
      preds: {
        ...r.preds,
        [outId]: applyLevel(r.preds[baseId], adj, caps ? caps[i] : (cap ?? null)),
      },
    };
  });
}
