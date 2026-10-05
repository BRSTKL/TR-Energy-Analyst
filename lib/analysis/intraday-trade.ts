/**
 * TR-Energy Analyst - Gün içi düzeltmenin işlem maliyeti (GİP ağırlıklı ortalama fiyatıyla tahmin)
 *
 * İlk KGÜP gün öncesinde PTF'den taahhüt edilen pozisyondur; son KGÜP gün içi piyasası kapandıktan sonraki pozisyondur.
 * Aradaki fark Δ = ilk − son gün içinde işlemle kapatılmış sayılır: plan düştüyse (Δ > 0) PTF'den satılan Δ GİP'ten geri
 * alınır, plan arttıysa (Δ < 0) fazladan Δ GİP'ten satılır. Gelir farkı (PTF'deki gelire göre):
 *
 *   işlem maliyeti = Δ × (GİP − PTF)
 *
 * Plan düşüp GİP PTF'den pahalıysa ya da plan artıp GİP PTF'den ucuzsa maliyet pozitiftir. Dengesizlik tarafındaki azalma
 * (ilk plana göre sapma − son plana göre sapma) bu maliyet düşülünce net gün içi kazancı verir.
 *
 * Sınırlar: şirketin gerçek işlem fiyatı bilinmez (GİP saatlik kontratının ağırlıklı ortalaması kullanılır; 15 dakikalık ve
 * blok kontratlar ayrı izlenmez); plan değişikliğinin tamamı GİP işlemi sayılır. SAF: I/O yok.
 */

export interface IntradayTradeHour {
  forecastMwh: number;
  forecastFinalMwh?: number | null;
  ptf: number;
  gipPrice?: number | null;
}

export interface IntradayTradeCost {
  /** Σ Δ × (GİP − PTF), TL; pozitif = gün içi işlemlerin maliyeti */
  costTl: number;
  /** Plan düşüşü (ilk > son) toplamı, MWh */
  planDownMwh: number;
  /** Plan artışı (son > ilk) toplamı, MWh */
  planUpMwh: number;
  /** Planı değişen ama GİP fiyatı olmayan saatler (maliyeti 0 sayıldı) */
  hoursWithoutGip: number;
}

const EPS = 1e-6;

/** GİP işlem maliyeti brüt gün içi azalmanın bu payından küçükse raporda ayrı kalem olmaz (ihmal edilir) */
export const TRADE_COST_MIN_SHARE = 0.02;

/** Raporda gösterilecek işlem maliyeti: brüt azalmanın TRADE_COST_MIN_SHARE payından küçükse 0 */
export function materialTradeCost(tradeCostTl: number, grossCutTl: number): number {
  return Math.abs(tradeCostTl) >= TRADE_COST_MIN_SHARE * Math.abs(grossCutTl) ? tradeCostTl : 0;
}

export function intradayTradeCost(hours: Iterable<IntradayTradeHour>): IntradayTradeCost {
  let costTl = 0;
  let planDownMwh = 0;
  let planUpMwh = 0;
  let hoursWithoutGip = 0;
  for (const h of hours) {
    if (h.forecastFinalMwh === null || h.forecastFinalMwh === undefined) continue;
    const delta = h.forecastMwh - h.forecastFinalMwh;
    if (Math.abs(delta) < EPS) continue;
    if (delta > 0) planDownMwh += delta;
    else planUpMwh -= delta;
    if (h.gipPrice === null || h.gipPrice === undefined || !Number.isFinite(h.gipPrice)) {
      hoursWithoutGip++;
      continue;
    }
    costTl += delta * (h.gipPrice - h.ptf);
  }
  return { costTl, planDownMwh, planUpMwh, hoursWithoutGip };
}
