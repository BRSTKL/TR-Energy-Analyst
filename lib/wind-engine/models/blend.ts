/**
 * TR-Energy Analyst - Şirket planıyla karışım (Aşama 23.8): analiz aracı
 *
 * Santral başına ağırlık w: karışım = w × model + (1 − w) × ilk KGÜP. w, GEÇMİŞ aylarda (test ayından önce) ızgarada
 * (0, 0,1, …, 1) en küçük hatayı veren değer; hata varsayılan olarak mutlak hata, istenirse çağıranın maliyet fonksiyonu
 * (dönemin dengesizlik kuralıyla TL). Güçlü tahmincide w → 0 (şirketin planı zaten iyi), zayıf tahmincide w büyür.
 * Eşitlikte küçük w (şirketin planı; değişiklik önermemek kötümser).
 *
 * SINIR: ilk KGÜP canlıda bizim elimizde değildir (şirketin kendi bildirimi). Bu bir tahmin sürümü değil, geçmişe bakan
 * analiz ve şirkete sunulacak "planınızı şöyle düzeltirdik" kanıtıdır. Zayıf tahminci listesi aday taramasına bağlanır
 * (`weakForecasters`). SAF: I/O yok.
 */

export const BLEND_WEIGHTS = Array.from({ length: 11 }, (_, i) => i / 10);
/** Zayıf tahminci eşiği: geçmiş aylarda modelin ağırlığı bu değer ya da üstü */
export const WEAK_WEIGHT = 0.5;
export const MIN_BLEND_ROWS = 500;

export interface BlendRow {
  pred: number;
  kgup: number;
  actual: number;
}

export const blendValue = (w: number, pred: number, kgup: number) => w * pred + (1 - w) * kgup;

/** Geçmiş satırlardan w; satır azsa null. `cost`: (w → toplam hata) verilirse o kullanılır */
export function fitBlendWeight(rows: BlendRow[], cost?: (w: number) => number): { w: number; errors: Record<string, number> } | null {
  if (!cost && rows.length < MIN_BLEND_ROWS) return null;
  const f = cost ?? ((w: number) => rows.reduce((s, r) => s + Math.abs(blendValue(w, r.pred, r.kgup) - r.actual), 0));
  const errors: Record<string, number> = {};
  let best = 0;
  let bestErr = Infinity;
  for (const w of BLEND_WEIGHTS) {
    const e = f(w);
    errors[w.toFixed(1)] = e;
    if (e < bestErr - 1e-9) {
      best = w;
      bestErr = e;
    }
  }
  return { w: best, errors };
}

/** Zayıf tahminci santraller: modelin ağırlığı eşik ya da üstü; ağırlığa göre azalan */
export function weakForecasters<T extends { w: number }>(plants: T[], threshold = WEAK_WEIGHT): T[] {
  return plants.filter((p) => p.w >= threshold).sort((a, b) => b.w - a.w);
}
