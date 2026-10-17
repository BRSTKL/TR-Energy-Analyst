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
  /** PTF (TL/MWh): yalnız parasal karşılık için (`monthlyLoss`) */
  ptf?: number | null;
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
  /** Devreye alma bitişi (`commissioning` seçeneğiyle; öncesi kayıp sayılmaz), yoksa null */
  steadyFrom: number | null;
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

/**
 * `commissioning: true` (Aşama 20, ürün çıktısı): devreye alma dönemi kayıp sayılmaz. Bitişi VERİMLE bulunur (mevsimden
 * bağımsız): günün en yüksek verim oranı (üretim ÷ uydu POA, POA ≥ 300) ilk kez dönemin P90 oranının %80'ine ulaştığı
 * gün (ham üretim tepesi kışın yaz tepesinin altında kaldığı için kullanılmaz). Varsayılan kapalı: Aşama 15 geriye
 * dönük testi ve eğitim temizliği aynı kalır. Bütün dönemle çağrılmalıdır (yıl yıl değil).
 */
export function detectLostHours(hours: LossInput[], site: SolarSite, opts: { commissioning?: boolean } = {}): LossResult {
  const all = hours.filter((h) => h.uevm !== null && h.satGhi !== null && h.satDirect !== null && h.satDiffuse !== null);
  if (!opts.commissioning) return detectOn(all, site, null);
  // İlk geçiş: kurulum ve verim oranları bütün dönemle; devreye alma bitişi oranla
  const first = detectOn(all, site, null);
  const steady = commissioningEnd(all, first.poa);
  return detectOn(steady === null ? all : all.filter((h) => h.t >= steady), site, steady);
}

const DAY = 86_400_000;
export const COMMISSIONING_SHARE = 0.8;

function commissioningEnd(hours: LossInput[], poa: Map<number, number>): number | null {
  const ratios: number[] = [];
  const dayMax = new Map<number, number>();
  for (const h of hours) {
    const p = poa.get(h.t);
    if (p === undefined || p < REF_POA_MIN) continue;
    const r = h.uevm! / p;
    ratios.push(r);
    const d = Math.floor(h.t / DAY) * DAY;
    dayMax.set(d, Math.max(dayMax.get(d) ?? 0, r));
  }
  const ref = quantile(ratios, REF_QUANTILE);
  if (!ref) return null;
  const days = Array.from(dayMax.keys()).sort((a, b) => a - b);
  return days.find((d) => dayMax.get(d)! >= COMMISSIONING_SHARE * ref) ?? null;
}

function detectOn(hoursIn: LossInput[], site: SolarSite, steady: number | null): LossResult & { poa: Map<number, number> } {
  const valid = hoursIn;
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
  if (!best) return { mount: "-", lost, expected, lostMwh, steadyFrom: steady, poa: new Map() };

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
  return { mount: best.id, lost, expected, lostMwh, steadyFrom: steady, poa: best.poa };
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

export interface MonthlyLoss {
  /** "YYYY-MM" */
  month: string;
  /** Ayın gerçekleşen üretimi (MWh) */
  actualMwh: number;
  plannedLossMwh: number;
  unplannedLossMwh: number;
  /** Kayıp ÷ (gerçekleşen + kayıp), % */
  lossPct: number;
  plannedHours: number;
  unplannedHours: number;
  /** Kayıp × max(PTF, 0) (TL): planlı kısıntı çoğunlukla sıfır fiyatlı saatte, plansız kayıp gelir kaybıdır */
  plannedValueTl: number;
  unplannedValueTl: number;
  /** Ayın tamamı ya da bir kısmı devreye alma döneminde (kayıp sayılmadı) */
  commissioning: boolean;
}

/** Santral × ay kayıp özeti (Aşama 20.1): `detectLostHours` (güneş) ya da `detectWindLoss` (rüzgâr) sonucundan */
export function monthlyLoss(hours: Array<Pick<LossInput, "t" | "uevm" | "ptf">>, r: Pick<LossResult, "lost" | "expected" | "steadyFrom">): MonthlyLoss[] {
  const byMonth = new Map<string, MonthlyLoss>();
  for (const h of hours) {
    if (h.uevm === null) continue;
    const month = new Date(h.t).toISOString().slice(0, 7);
    let m = byMonth.get(month);
    if (!m) {
      m = { month, actualMwh: 0, plannedLossMwh: 0, unplannedLossMwh: 0, lossPct: 0, plannedHours: 0, unplannedHours: 0, plannedValueTl: 0, unplannedValueTl: 0, commissioning: false };
      byMonth.set(month, m);
    }
    m.actualMwh += h.uevm;
    if (r.steadyFrom !== null && h.t < r.steadyFrom) m.commissioning = true;
    const kind = r.lost.get(h.t);
    if (!kind) continue;
    const lost = r.expected.get(h.t)! - h.uevm;
    const value = lost * Math.max(0, h.ptf ?? 0);
    if (kind === "planned") {
      m.plannedLossMwh += lost;
      m.plannedHours++;
      m.plannedValueTl += value;
    } else {
      m.unplannedLossMwh += lost;
      m.unplannedHours++;
      m.unplannedValueTl += value;
    }
  }
  const out = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  for (const m of out) {
    const lost = m.plannedLossMwh + m.unplannedLossMwh;
    m.lossPct = m.actualMwh + lost > 0 ? (lost / (m.actualMwh + lost)) * 100 : 0;
  }
  return out;
}
