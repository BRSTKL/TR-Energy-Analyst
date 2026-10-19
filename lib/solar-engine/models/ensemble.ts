/**
 * TR-Energy Analyst - Üç hava modelli birleşim (Aşama 22.3): ECMWF IFS 0,25° + DWD ICON-EU + NOAA GFS
 *
 * Aynı sürüm 3 modeli (production-model-v2.ts, kalıcılıksız) her hava modelinin 2 gün önceki tahminiyle ayrı eğitilir;
 * üç birleşim:
 *   - `mean`: üç tahminin ortalaması;
 *   - `input`: üç modelin ışınım, sıcaklık ve bulut ortalamasıyla eğitilen tek model;
 *   - `weighted`: santral başına ağırlık ∝ 1 / hata². Hata: eğitimin `valFrom` öncesiyle kurulan modellerin `valFrom`
 *     sonrasındaki (eğitimin son ayı) ortalama mutlak hatası, ÜÇ modelin de verisi olan ortak saatlerde. Test / hedef
 *     gün görülmez.
 * Bir modelin verisi olmayan saatte birleşim yok (null). Geriye dönük test 19.10.2026 (scripts/solar-candidates-backtest.mts,
 * 54 santral, kayıp hariç TL/MWh): temel 104,8; ortalama 101,9; girdi ortalaması 101,3; ağırlıklı 101,1.
 * Bilgi anı: eğitim saatleri `d2` (ek modellerin kuralı lib/weather/nwp-models.ts), canlı saatler kesimden önce alınan en yeni
 * tahmin. BİLİNEN UYUMSUZLUK (ECMWF temelde de aynı): eğitim 48–51 saat önceki, canlı ≈ 21–47 saat önceki tahminle; ağırlıklar
 * d2 hatasından kurulur, modellerin kısa vadede ne kadar iyileştiği farklı olabilir. Canlı karne (gölge sürüm) bunu ölçer.
 * SAF: I/O yok.
 */

import { fitSolarModelV2, type SolarHourV2 } from "./production-model-v2";
import type { SolarSite } from "./production-model";
import { NWP_MODELS, nwpAt, type NwpModel, type NwpYear } from "../../weather/nwp-models";
import { weatherAvailableAt, weatherStampForHour, type WeatherSource } from "../../forecast/info-time";

export const ENSEMBLE_KINDS = ["mean", "input", "weighted"] as const;
export type EnsembleKind = (typeof ENSEMBLE_KINDS)[number];
/** Kaynak sırası: [ECMWF, ...NWP_MODELS] */
export const ENSEMBLE_SOURCES = ["ECMWF", "ICON-EU", "GFS"] as const;

/** Model → yıl → arşiv belgesi */
export type NwpArchive = Map<NwpModel, Map<number, NwpYear>>;

type Model = { predict: (h: SolarHourV2) => number | null; trainHours: number; mount: string; trainMaxMwh: number };
const v3 = (train: SolarHourV2[], site: SolarSite, exclude: (h: SolarHourV2) => boolean): Model => fitSolarModelV2(train, site, { exclude, noLag: true });

/** Kalıcılık girdileri kapalı kopya (canlıda 48 saat önceki üretim yok) */
export const noLag = (h: SolarHourV2): SolarHourV2 => ({ ...h, lag48: null, ghiLag48: null, directLag48: null, diffuseLag48: null });

/** Saatin hava girdilerini bir ek modelin arşivdeki değeriyle değiştirir (bilgi anı aynı: d2); verisi yoksa null */
export function withNwp(h: SolarHourV2, docs: Map<number, NwpYear> | undefined): SolarHourV2 | null {
  const doc = docs?.get(new Date(h.t).getUTCFullYear());
  if (!doc) return null;
  const v = { ghi: nwpAt(doc, "ghi", h.t), direct: nwpAt(doc, "direct", h.t), diffuse: nwpAt(doc, "diffuse", h.t), temp: nwpAt(doc, "temp", h.t), cloud: nwpAt(doc, "cloud", h.t) };
  if (Object.values(v).some((x) => x === null)) return null;
  // Arşiv yalnız 2 gün önceki tahmin: sürüm ECMWF saatinden değil belgeden
  return { ...noLag(h), ...v, weatherSource: doc.model, weatherLead: 2 };
}

/** Saat için en geç elde olan model (girdi ortalaması bu modelin kuralıyla denetlenir: kötümser) */
function latestSource(h: SolarHourV2, sources: WeatherSource[]): WeatherSource {
  const at = (s: WeatherSource) => Math.max(...(["mean", "instant"] as const).map((k) => weatherAvailableAt(weatherStampForHour(h.t, k), h.weatherLead ?? 2, s)));
  return sources.reduce((a, b) => (at(b) > at(a) ? b : a));
}

/** Eğitim saatinin üç sürümü: [ECMWF, ICON-EU, GFS] */
export const archiveVariants = (h: SolarHourV2, nwp: NwpArchive): Array<SolarHourV2 | null> => [noLag(h), ...NWP_MODELS.map((m) => withNwp(h, nwp.get(m)))];

const complete = (h: SolarHourV2 | null): h is SolarHourV2 => h !== null && h.ghi !== null && h.direct !== null && h.diffuse !== null && h.temp !== null && h.cloud !== null;

/** Üç sürümün girdi ortalaması; biri eksikse null */
export function meanInput(hs: Array<SolarHourV2 | null>): SolarHourV2 | null {
  if (!hs.every(complete)) return null;
  const avg = (k: "ghi" | "direct" | "diffuse" | "temp" | "cloud") => hs.reduce((s, h) => s + h![k]!, 0) / hs.length;
  const weatherSource = latestSource(hs[0]!, hs.map((h) => h!.weatherSource ?? "ecmwf_ifs025"));
  return { ...hs[0]!, ghi: avg("ghi"), direct: avg("direct"), diffuse: avg("diffuse"), temp: avg("temp"), cloud: avg("cloud"), weatherSource };
}

export interface EnsembleModel {
  /** Saatin üç sürümünden (canlıda üç modelin canlı tahmini) üç birleşim */
  /** `fallback` (canlı): bir ek modelin saati yoksa o saatte ECMWF tahmini kullanılır; böylece birleşim temel sürümle aynı
   * saatlerde değer verir ve karnede eksik saatle ucuz görünmez (sizinti-denetcisi 19.10.2026). Geriye dönük testte kapalı
   * (ortak saat kümesi zaten zorunlu) */
  predict: (vs: Array<SolarHourV2 | null>, fallback?: boolean) => Record<EnsembleKind, number | null> & { sources: Array<number | null> };
  /** `weighted` ağırlıkları, kaynak sırasıyla (toplam 1) */
  weights: number[];
  /** ECMWF modelinin eğitim bilgisi (iz için) */
  trainHours: number;
  mount: string;
  trainMaxMwh: number;
}

/** Eğitim saatleri (ECMWF havasıyla, havuz düzeni) ve ek model arşivinden üç modeli ve birleşimleri kurar */
export function fitEnsemble(train: SolarHourV2[], nwp: NwpArchive, site: SolarSite, exclude: (h: SolarHourV2) => boolean, valFrom: number): EnsembleModel {
  const rows = train.map((h) => archiveVariants(h, nwp));
  const trainOf = (k: number) => rows.map((r) => r[k]).filter((h): h is SolarHourV2 => h !== null);
  const models = [0, 1, 2].map((k) => v3(trainOf(k), site, exclude));
  const meanModel = v3(rows.map(meanInput).filter((h): h is SolarHourV2 => h !== null), site, exclude);
  // Ağırlık: valFrom öncesiyle kurulan modellerin valFrom sonrasındaki hatası, üç modelin de dolu olduğu ortak saatlerde
  const inner = [0, 1, 2].map((k) => v3(trainOf(k).filter((h) => h.t < valFrom), site, exclude));
  const val = rows.filter((r): r is SolarHourV2[] => r.every(complete)).filter((r) => r[0].t >= valFrom && r[0].uevm !== null && !exclude(r[0]));
  const errs = [0, 1, 2].map((k) => Math.max(1e-6, val.reduce((s, r) => s + Math.abs((inner[k].predict(r[k]) ?? 0) - r[k].uevm!), 0) / Math.max(1, val.length)));
  const raw = errs.map((e) => 1 / (e * e));
  const sum = raw.reduce((a, b) => a + b, 0);
  const weights = raw.map((w) => w / sum);
  return {
    predict: (vs, fallback = false) => {
      const ps = vs.map((v, k) => (v ? models[k].predict(v) : null));
      const ok = ps.every((p) => p !== null);
      const mi = meanInput(vs);
      const fb = fallback ? ps[0] : null;
      return {
        sources: ps,
        mean: ok ? ps.reduce((s: number, p) => s + p!, 0) / ps.length : fb,
        input: mi ? meanModel.predict(mi) : fb,
        weighted: ok ? ps.reduce((s: number, p, k) => s + p! * weights[k], 0) : fb,
      };
    },
    weights,
    trainHours: models[0].trainHours,
    mount: models[0].mount,
    trainMaxMwh: models[0].trainMaxMwh,
  };
}
