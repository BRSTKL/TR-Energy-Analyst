/**
 * TR-Energy Analyst - PTF motoru: modeller (saf, I/O yok)
 *
 * Her model hedef gün T için 24 saatlik PTF tahmini verir; eğitim yalnız T'den önceki günlerin etiketleriyle (T-1'in PTF'si
 * kesimde bilinir) ve aynı bilgi kuralıyla kurulmuş özelliklerle yapılır. Tahmin [0, tavan] aralığına kırpılır.
 *   R1 lastWeek : geçen haftanın aynı saati
 *   R2 base     : aynı gün sınıfının son 28 gün saatlik ortancası
 *   R3 yesterday: dünün aynı saati (kalıcılık)
 *   LEAR        : 24 saat ayrı ayrı ridge (standartlaştırılmış özellikler); λ, eğitim penceresinin son 28 gününde (zaman
 *                 sırasıyla) seçilir, sonra bütün pencerede yeniden kurulur. Hedef: PTF − base
 *   GBM         : tek ortak gradient boosting (saat bir özellik), Huber kaybı (lib/forecast/gbm.ts). Hedef: PTF − base
 * Eğitim penceresi ve yeniden kurma sıklığı modele özgü; yeniden kurma arasında model sabit kalır (canlıdaki gibi).
 */

import { fitRidge, predictRidge, type RidgeModel } from "@/lib/analysis/direction-model";
import { fitGbm, type GbmModel, type GbmOptions } from "@/lib/forecast/gbm";
import { buildFeatures, FEATURE_NAMES, type DayFeatures } from "./features";
import { H, PtfView, shiftDay, type PtfDay, type PtfField } from "./history";

export interface PtfModel {
  id: string;
  /** Hedef gün için tahmin; kurulamıyorsa null */
  predict(target: string): number[] | null;
}

export interface ModelContext {
  days: Map<string, PtfDay>;
  /** Kusursuz girdi tanısı için açılan alanlar (yalnız hata bütçesi deneyi) */
  oracle?: ReadonlySet<PtfField>;
  /** Modellerden çıkarılan özellikler (ablation; FEATURE_NAMES adlarıyla; "hour" çıkarılamaz) */
  exclude?: ReadonlySet<string>;
}

const clamp = (v: number, cap: number | null) => Math.max(0, cap ? Math.min(cap, v) : v);

/** Özellik önbelleği: aynı hedef gün için bir kez kurulur */
export class FeatureCache {
  private memo = new Map<string, DayFeatures | null>();
  constructor(private ctx: ModelContext) {
    const ex = ctx.exclude;
    if (ex?.has("hour"))
      throw new Error("hour özelliği çıkarılamaz (saat modelleri ona dayanır)");
    this.keep =
      ex && ex.size
        ? FEATURE_NAMES.map((n, j) => (ex.has(n) ? -1 : j)).filter((j) => j >= 0)
        : null;
  }
  private keep: number[] | null;
  get(target: string): DayFeatures | null {
    if (!this.memo.has(target)) {
      const f = buildFeatures(new PtfView(this.ctx.days, target, this.ctx.oracle));
      const keep = this.keep;
      this.memo.set(
        target,
        f && keep ? { ...f, rows: f.rows.map((r) => keep.map((j) => r[j])) } : f
      );
    }
    return this.memo.get(target)!;
  }
  label(day: string): number[] | null {
    const p = this.ctx.days.get(day)?.ptf;
    return p && p.length === H && p.every((x) => Number.isFinite(x)) ? p : null;
  }
}

export function referenceModels(
  ctx: ModelContext,
  cache = new FeatureCache(ctx)
): PtfModel[] {
  const view = (t: string) => new PtfView(ctx.days, t, ctx.oracle);
  return [
    {
      id: "R1-gecen-hafta",
      predict: (t) => view(t).series("ptf", shiftDay(t, -7)),
    },
    {
      id: "R2-sinif-ortancasi",
      predict: (t) => cache.get(t)?.base ?? null,
    },
    {
      id: "R3-dun",
      predict: (t) => view(t).series("ptf", shiftDay(t, -1)),
    },
  ];
}

interface TrainOpts {
  /** Eğitim penceresi (gün) */
  windowDays: number;
  /** Kaç günde bir yeniden kurulur */
  retrainDays: number;
  /** Eğitim için en az gün */
  minDays: number;
}

/** Ortak eğitim döngüsü: hedef günden önceki pencerenin satırlarını toplar */
function trainingSet(cache: FeatureCache, target: string, windowDays: number) {
  const xs: number[][] = [];
  const ys: number[] = [];
  const rowsByDay: Array<{ day: string; from: number; to: number }> = [];
  for (let i = windowDays; i >= 1; i--) {
    const d = shiftDay(target, -i);
    const f = cache.get(d);
    const y = cache.label(d);
    if (!f || !y) continue;
    const from = xs.length;
    for (let h = 0; h < H; h++) {
      xs.push(f.rows[h]);
      ys.push(y[h] - f.base[h]);
    }
    rowsByDay.push({ day: d, from, to: xs.length });
  }
  return { xs, ys, rowsByDay };
}

/** Yeniden kurma takvimli model sarmalayıcısı */
function scheduled<M>(
  id: string,
  cache: FeatureCache,
  o: TrainOpts,
  fit: (target: string) => M | null,
  apply: (m: M, f: DayFeatures) => number[]
): PtfModel {
  let model: M | null = null;
  let fittedAt: string | null = null;
  return {
    id,
    predict(target) {
      const f = cache.get(target);
      if (!f) return null;
      const due =
        !fittedAt ||
        Math.round(
          (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${fittedAt}T00:00:00Z`)) /
            86_400_000
        ) >= o.retrainDays ||
        target < fittedAt;
      if (due) {
        model = fit(target);
        fittedAt = target;
      }
      if (!model) return null;
      return apply(model, f).map((v) => clamp(v, f.cap));
    },
  };
}

/**
 * Eğitim penceresi 728 gün ve gaz özelliği çıkarılmış (27.10.2026, 2024 sistem verisiyle; seçim dönemi 2025-07 – 2026-03'te
 * seçildi: birleşim MAE 364 gün + gaz 338, 728 gün + gazsız 328; sınama 2026-04 – 10'da 413 → 415, fark yok). Gaz GRF serisi
 * 2024-11'den önce yok, önceki satırlarda yedek değer taşıyordu.
 */
/**
 * Son 7 günün tahmin sapması özellikleri (lepBias7, windFBias7; 28.10.2026) de çıkarıldı: seçim döneminde birleşim 328,4 →
 * 327,9 (gürültü), rüzgâr sapması sınamada LEAR'ı kötüleştirdi (425 → 435; seçim döneminde EPİAŞ rüzgâr tahmini yok).
 */
export const ENGINE_EXCLUDE: readonly string[] = ["gas", "lepBias7", "windFBias7"];
export const LEAR_DEFAULTS: TrainOpts = { windowDays: 728, retrainDays: 7, minDays: 90 };
const LAMBDAS = [0.3, 3, 30, 300];

export function learModel(
  ctx: ModelContext,
  cache = new FeatureCache(ctx),
  o: TrainOpts = LEAR_DEFAULTS,
  id = "LEAR-ridge"
): PtfModel {
  return scheduled<RidgeModel[]>(
    id,
    cache,
    o,
    (target) => {
      const { xs, ys, rowsByDay } = trainingSet(cache, target, o.windowDays);
      if (rowsByDay.length < o.minDays) return null;
      // λ seçimi: son 28 gün doğrulama, öncesi eğitim (zaman sırası)
      const cut = rowsByDay[Math.max(0, rowsByDay.length - 28)].from;
      const byHour = (lo: number, hi: number, h: number) => {
        const X: number[][] = [];
        const Y: number[] = [];
        for (let i = lo; i < hi; i++) if (xs[i][0] === h) (X.push(xs[i]), Y.push(ys[i]));
        return { X, Y };
      };
      let best = LAMBDAS[0];
      let bestErr = Infinity;
      for (const lam of LAMBDAS) {
        let err = 0;
        for (let h = 0; h < H; h++) {
          const tr = byHour(0, cut, h);
          const va = byHour(cut, xs.length, h);
          if (tr.X.length < 20 || !va.X.length) continue;
          const m = fitRidge(tr.X, tr.Y, lam);
          for (let i = 0; i < va.X.length; i++)
            err += Math.abs(predictRidge(m, va.X[i]) - va.Y[i]);
        }
        if (err < bestErr) ((bestErr = err), (best = lam));
      }
      return Array.from({ length: H }, (_, h) => {
        const all = byHour(0, xs.length, h);
        return fitRidge(all.X, all.Y, best);
      });
    },
    (ms, f) => f.rows.map((x, h) => f.base[h] + predictRidge(ms[h], x))
  );
}

export const GBM_DEFAULTS: TrainOpts = { windowDays: 728, retrainDays: 28, minDays: 120 };
export const GBM_PARAMS: GbmOptions = {
  trees: 300,
  depth: 4,
  learningRate: 0.05,
  minLeaf: 30,
  subsample: 0.8,
  bins: 32,
  seed: 7,
};

export function gbmModel(
  ctx: ModelContext,
  cache = new FeatureCache(ctx),
  o: TrainOpts = GBM_DEFAULTS,
  params: GbmOptions = GBM_PARAMS,
  id = "GBM"
): PtfModel {
  return scheduled<GbmModel>(
    id,
    cache,
    o,
    (target) => {
      const { xs, ys, rowsByDay } = trainingSet(cache, target, o.windowDays);
      if (rowsByDay.length < o.minDays) return null;
      return fitGbm(xs, ys, params);
    },
    (m, f) => f.rows.map((x, h) => f.base[h] + m.predict(x))
  );
}
