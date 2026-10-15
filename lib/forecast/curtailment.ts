/**
 * TR-Energy Analyst - Uydu ışınımıyla kısıntı / arıza tespiti (PLAN 15.5)
 *
 * Gerçekleşen uydu ışınımı (SARAH3, satellite.ts) santralin panel düzlemine çevrilir (solar-geometry.ts
 * `planeOfArray`; kurulum, üretimle korelasyonu en yüksek olan). Santralin normal verimi = güneşli saatlerde (POA ≥
 * 300 W/m²) üretim ÷ POA oranının P90'ı, ayın ve komşu iki ayın saatleriyle (genişleme ve mevsim izlenir; kısıntılı
 * saatler P90'ı aşağı çekmez). Beklenen üretim = verim × POA. KAYIP SAAT: POA ≥ 200 W/m² iken üretim beklenenin yarısının
 * altında. Türü: şirketin ilk KGÜP'ü beklenenin %10'unun altındaysa "planlı" (kısıntı kararı), değilse "plansız" (arıza,
 * talimat, şebeke). İnverter sınırı (kırpma) oranı ≈ %70–90'a indirir, eşiğin üstünde kalır.
 *
 * Yalnız ETİKETTİR: gerçekleşen bilgi kullanır; tahmin girdisi olamaz. Eğitim temizliğinde yalnız eğitim saatleriyle ve
 * uydu gecikmesinden önce elde olan saatlerle çağrılır.
 */

import { PANEL_MOUNTS } from "./production-model-v2";
import { planeOfArray, type PanelMount } from "./solar-geometry";
import type { SolarSite } from "./production-model";

export const LOSS_POA_MIN = 200;
export const LOSS_SHARE = 0.5;
export const REF_POA_MIN = 300;
export const REF_QUANTILE = 0.9;
export const PLANNED_SHARE = 0.1;

export interface LossInput {
  t: number;
  uevm: number | null;
  kgupFirst: number | null;
  satGhi: number | null;
  satDirect: number | null;
  satDiffuse: number | null;
}

export type LossKind = "planned" | "unplanned";

export interface LossResult {
  mount: string;
  /** Saat → kayıp türü (yalnız kayıp saatler) */
  lost: Map<number, LossKind>;
  /** Saat → beklenen üretim (MWh; POA ≥ 200 olan saatler) */
  expected: Map<number, number>;
  /** Kayıp üretim tahmini (MWh): beklenen − gerçekleşen, kayıp saatlerde */
  lostMwh: { planned: number; unplanned: number };
}

const monthKey = (t: number) => {
  const d = new Date(t);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

function quantile(xs: number[], q: number): number | null {
  if (xs.length < 20) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

function correlation(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 50) return -1;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : -1;
}

export function detectLostHours(hours: LossInput[], site: SolarSite): LossResult {
  const valid = hours.filter((h) => h.uevm !== null && h.satGhi !== null && h.satDirect !== null && h.satDiffuse !== null);
  // Kurulum: üretimle korelasyonu en yüksek POA
  let best: { id: string; mount: PanelMount; poa: Map<number, number>; r: number } | null = null;
  for (const m of PANEL_MOUNTS) {
    const poa = new Map<number, number>();
    for (const h of valid) poa.set(h.t, planeOfArray(site.latitude, site.longitude, h.t, h.satGhi!, h.satDirect!, h.satDiffuse!, m.mount));
    const xs = valid.filter((h) => poa.get(h.t)! > 50);
    const r = correlation(
      xs.map((h) => h.uevm!),
      xs.map((h) => poa.get(h.t)!)
    );
    if (!best || r > best.r) best = { id: m.id, mount: m.mount, poa, r };
  }
  const lost = new Map<number, LossKind>();
  const expected = new Map<number, number>();
  const lostMwh = { planned: 0, unplanned: 0 };
  if (!best) return { mount: "-", lost, expected, lostMwh };

  // Ay başına verim oranları
  const ratios = new Map<number, number[]>();
  for (const h of valid) {
    const p = best.poa.get(h.t)!;
    if (p < REF_POA_MIN) continue;
    const k = monthKey(h.t);
    if (!ratios.has(k)) ratios.set(k, []);
    ratios.get(k)!.push(h.uevm! / p);
  }
  const refOf = new Map<number, number | null>();
  for (const k of ratios.keys()) refOf.set(k, quantile([...(ratios.get(k - 1) ?? []), ...ratios.get(k)!, ...(ratios.get(k + 1) ?? [])], REF_QUANTILE));

  for (const h of valid) {
    const p = best.poa.get(h.t)!;
    if (p < LOSS_POA_MIN) continue;
    const ref = refOf.get(monthKey(h.t));
    if (!ref || ref <= 0) continue;
    const exp = ref * p;
    expected.set(h.t, exp);
    if (h.uevm! < LOSS_SHARE * exp) {
      const kind: LossKind = h.kgupFirst !== null && h.kgupFirst < PLANNED_SHARE * exp ? "planned" : "unplanned";
      lost.set(h.t, kind);
      lostMwh[kind] += exp - h.uevm!;
    }
  }
  return { mount: best.id, lost, expected, lostMwh };
}

/**
 * Eğitim temizliği (sürüm 3): eğitim saatlerinde uyduyla işaretlenen kayıp saatleri ve etiketi `trainingEnd` anında henüz
 * elde olmayan saatleri (uydu gecikmesi + 1 gün) dışarıda bırakan süzgeç. Etiket yalnız eğitim saatleriyle kurulur.
 */
export function trainingLossFilter(
  train: Array<LossInput>,
  site: SolarSite,
  trainingEnd: number,
  delayDays: number
): { exclude: (h: { t: number }) => boolean; lostHours: number; unlabeled: number } {
  const labelCutoff = trainingEnd - (delayDays + 1) * 86_400_000;
  const labeled = train.filter((h) => h.t < labelCutoff);
  const r = detectLostHours(labeled, site);
  return {
    exclude: (h) => h.t >= labelCutoff || r.lost.has(h.t),
    lostHours: r.lost.size,
    unlabeled: train.length - labeled.length,
  };
}
