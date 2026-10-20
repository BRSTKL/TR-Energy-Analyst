/**
 * TR-Energy Analyst - Rüzgârda birden çok hava modeli (Aşama 23.4): ECMWF IFS 0,25° + DWD ICON-EU + NOAA GFS
 *
 * Rüzgârda hava modelinin hız hatası güç eğrisinin dik bölgesinde küple büyür; modeller farklı yerde yanılır, birleşim
 * güneştekinden değerli olabilir (güneşte ≈ %3,5, PLAN 22.3). Her hava modeli KENDİ güç eğrisiyle eğitilir
 * (models/baseline.ts: hız × yön medyanı, isteğe bağlı yoğunluk; modelin sistematik sapması ve arazi etkisi eğriye girer).
 * Birleşimler:
 *   - `mean`: tahminlerin ortalaması;
 *   - `speed`: hızların ortalaması ve yönlerin vektör ortalamasıyla kurulan tek eğri ("girdi ortalaması");
 *   - `weighted`: santral başına ağırlık ∝ 1 / hata². Hata: eğitimin `validationFrom` öncesiyle kurulan eğrilerin
 *     `validationFrom` sonrasındaki (eğitimin son ayı) ortalama mutlak hatası, BÜTÜN modellerin verisi olan ortak saatlerde.
 *     Test günü görülmez. Ağırlıklar seçildikten sonra eğriler bütün eğitimle yeniden kurulur.
 * Modellerin ayrışması (`spreadMs`: hızların en yükseği − en düşüğü, m/s) belirsizlik ölçüsü olarak verilir (kayda yazılır;
 * 23.5 düzeltme ve 23.6 olasılıksal tahminin girdisi).
 * Eksik model: `fallback: true` (canlı) ile o saatte verisi olan modellerle (ağırlıklar yeniden ölçeklenir), kapalıyken
 * (geriye dönük test: ortak saat kümesi) null.
 *
 * Bilgi zamanı: eğitimde her model `d2` (lib/forecast/info-time.ts `WEATHER_RUN_RULES`, modelin kendi çalışma aralığı ve
 * yayım gecikmesi); tahminde her kaynağın özelliği kendi kuralıyla denetlenir. 23.0: `icon_eu`'nun d2 değerleri fiilen 6
 * saatlik çalışmalardan gelir, kural 3 saat varsayar (kötümser). SAF: I/O yok.
 */

import { assertAvailable, weatherFeature, type WeatherSource } from "@/lib/forecast/info-time";
import type { WindForecastModel } from "@/lib/forecast/wind-forecast";
import { fitWindBaseline, type WindEngineHour } from "./baseline";

const DAY = 86_400_000;

export const WIND_ENSEMBLE_SOURCES: WeatherSource[] = ["ecmwf_ifs025", "icon_eu", "gfs_global"];
export const WIND_ENSEMBLE_KINDS = ["mean", "speed", "weighted"] as const;
export type WindEnsembleKind = (typeof WIND_ENSEMBLE_KINDS)[number];
/** Ağırlık hesabında hatanın alt sınırı (kurulu gücün oranı): sıfıra yakın hata tek modele bütün ağırlığı vermesin */
const MIN_MAE_SHARE = 0.01;

export interface SourceWind {
  /** Üretim saati ortalaması 100 m (ya da göbek yüksekliğine taşınmış) hız, m/s; `d2` sürümü */
  ws: number | null;
  /** Yön, derece */
  dir: number | null;
}

export interface WindEnsembleHour extends WindEngineHour {
  /** Kaynak → d2 rüzgârı (`WIND_ENSEMBLE_SOURCES` adlarıyla); ECMWF yoksa `ws.d2` / `dir.d2` kullanılır */
  src: Partial<Record<WeatherSource, SourceWind>>;
}

export interface WindEnsembleOptions {
  trainingEnd: number;
  /** Ağırlık için doğrulama döneminin başı (eğitimin içinde, ör. eğitimin son ayı) */
  validationFrom: number;
  density?: boolean;
  elevationM?: number | null;
  sources?: WeatherSource[];
}

export type WindEnsemblePrediction = Record<WindEnsembleKind, number | null> & { sources: Array<number | null>; spreadMs: number | null };

export interface WindEnsembleModel {
  predict: (h: WindEnsembleHour, fallback?: boolean) => WindEnsemblePrediction;
  /** `weighted` ağırlıkları, kaynak sırasıyla (toplam 1) */
  weights: number[];
  sources: WeatherSource[];
}

/** Kaynağın rüzgârı (ECMWF için kayıt yoksa saatin kendi d2 değeri) */
function sourceWind(h: WindEnsembleHour, s: WeatherSource): SourceWind {
  const v = h.src[s];
  if (v) return v;
  return s === "ecmwf_ifs025" ? { ws: h.ws.d2, dir: h.dir.d2 } : { ws: null, dir: null };
}

/** Saatin bir kaynağın rüzgârıyla kopyası (yalnız d2; d1 kapatılır) */
const asSource = (h: WindEnsembleHour, w: SourceWind): WindEngineHour => ({ ...h, ws: { d1: null, d2: w.ws }, dir: { d1: null, d2: w.dir } });

/** Hızların ortalaması, yönlerin hıza ağırlıklı vektör ortalaması; biri eksikse null */
export function meanWind(ws: SourceWind[]): SourceWind {
  if (!ws.length || ws.some((w) => w.ws === null || w.dir === null)) return { ws: null, dir: null };
  const rad = Math.PI / 180;
  let u = 0;
  let v = 0;
  for (const w of ws) {
    u += w.ws! * Math.sin(w.dir! * rad);
    v += w.ws! * Math.cos(w.dir! * rad);
  }
  return { ws: ws.reduce((s, w) => s + w.ws!, 0) / ws.length, dir: ((Math.atan2(u, v) / rad) % 360 + 360) % 360 };
}

export function fitWindEnsemble(train: WindEnsembleHour[], capacityMw: number, opts: WindEnsembleOptions): WindEnsembleModel {
  const sources = opts.sources ?? WIND_ENSEMBLE_SOURCES;
  const base = { lead: "d2" as const, density: opts.density ?? false, elevationM: opts.elevationM ?? null };
  const fit = (rows: WindEnsembleHour[], s: WeatherSource | "speed", end: number): WindForecastModel =>
    fitWindBaseline(
      rows.map((h) => asSource(h, s === "speed" ? meanWind(sources.map((x) => sourceWind(h, x))) : sourceWind(h, s))),
      capacityMw,
      { ...base, trainingEnd: end }
    );

  // Ağırlıklar: doğrulama öncesiyle kurulan eğrilerin doğrulama dönemindeki hatası (ortak saatler). Bilgi zamanı
  // geriye dönük testteki gibi: doğrulamanın ilk günü için eğitim bir gün önce biter (D-2 üretimi D-1 12:00'da elde)
  const preEnd = opts.validationFrom - DAY;
  const pre = train.filter((h) => h.t < preEnd);
  const val = train.filter((h) => h.t >= opts.validationFrom && h.uevm !== null && (h.ptf ?? 1) > 0);
  let weights = sources.map(() => 1 / sources.length);
  try {
    const preCurves = sources.map((s) => fit(pre, s, preEnd));
    const err = sources.map(() => 0);
    let n = 0;
    for (const h of val) {
      const p = sources.map((s, i) => preCurves[i].predict({ ...asSource(h, sourceWind(h, s)), t: h.t }));
      if (p.some((x) => x === null)) continue;
      p.forEach((x, i) => (err[i] += Math.abs(x! - h.uevm!)));
      n++;
    }
    if (n >= 100) {
      const inv = err.map((e) => 1 / Math.max(MIN_MAE_SHARE * capacityMw, e / n) ** 2);
      const tot = inv.reduce((a, b) => a + b, 0);
      weights = inv.map((x) => x / tot);
    }
  } catch (e) {
    if ((e as Error).name === "LeakageError") throw e;
    // doğrulama öncesi veri yetersiz: eşit ağırlık
  }

  const curves = sources.map((s) => fit(train, s, opts.trainingEnd));
  const speedCurve = fit(train, "speed", opts.trainingEnd);

  return {
    weights,
    sources,
    predict: (h, fallback = false) => {
      assertAvailable(
        sources.flatMap((s) => [weatherFeature(`ws_${s}@i`, h.t, "instant", 2, s), weatherFeature(`ws_${s}@i+1`, h.t, "mean", 2, s)]),
        h.t
      );
      const winds = sources.map((s) => sourceWind(h, s));
      const preds = sources.map((s, i) => (winds[i].ws === null || winds[i].dir === null ? null : curves[i].predict(asSource(h, winds[i]))));
      const have = preds.map((p) => p !== null);
      const all = have.every(Boolean);
      const speeds = winds.filter((w) => w.ws !== null).map((w) => w.ws!);
      const spreadMs = speeds.length >= 2 ? Math.max(...speeds) - Math.min(...speeds) : null;
      if (!all && (!fallback || !have.some(Boolean))) return { mean: null, speed: null, weighted: null, sources: preds, spreadMs };
      const idx = preds.map((_, i) => i).filter((i) => have[i]);
      const mean = idx.reduce((s, i) => s + preds[i]!, 0) / idx.length;
      const wSum = idx.reduce((s, i) => s + weights[i], 0);
      const weighted = idx.reduce((s, i) => s + (weights[i] / wSum) * preds[i]!, 0);
      const mw = meanWind(idx.map((i) => winds[i]));
      const speed = mw.ws === null ? null : speedCurve.predict(asSource(h, mw));
      return { mean, speed, weighted, sources: preds, spreadMs };
    },
  };
}
