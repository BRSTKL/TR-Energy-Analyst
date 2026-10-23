/**
 * TR-Energy Analyst - Rüzgâr üretim tahmini (geriye dönük test; kullanıcı 18.10.2026)
 *
 * Güç eğrisi (lib/forecast/wind-loss.ts `fitPowerCurve`: 100 m hız × yön hücresinde üretimin medyanı) bu kez GEÇMİŞ
 * TAHMİN rüzgârıyla kurulur (lib/weather/wind-forecast-archive.ts, ECMWF IFS 0,25°): hava modelinin sistematik sapması ve
 * arazi etkisi eğriye girer. Medyan, mutlak hatayı (dengesizlik maliyetinin ana sürücüsü) en aza indiren noktadır.
 *
 * BİLGİ ZAMANI (lib/forecast/info-time.ts; güneşle aynı kural):
 *   - Hava: `d2` sürümü (2 gün önceki çalışma) GÖP kesiminden (D-1 12:30) önce elde; her tahmin saatinde
 *     `assertAvailable` (üretim saati i için damga i ve i+1). `d1` kesimden sonra: yalnız `leak: true` ile, iyimser üst
 *     sınır olarak.
 *   - Üretim: eğitim saatleri `trainingEnd`'den önce olmalı (çağıran ay başından 1 gün önceyi verir: D-2'nin üretimi D-1
 *     12:00'da elde); sonra olan saat hata verir.
 *   - Eğitim temizliği yalnız eğitim saatleriyle: ilk eğriyle beklenen kurulu gücün %30'unun üstündeyken üretim
 *     beklenenin %20'sinin altında ya da ilk KGÜP beklenenin %10'unun altında olan saatler (kısıntı, arıza) çıkarılır,
 *     eğri yeniden kurulur. Sıfır ve eksi fiyatlı saatler eğitime girmez (kısıntı).
 * SAF: I/O yok.
 */

import { assertAvailable, LeakageError, productionFeature, weatherFeature, type FeatureInfo } from "./info-time";
import { fitPowerCurve, LOSS_EXPECTED_MIN, LOSS_SHARE, PLANNED_SHARE } from "./wind-loss";

export const MIN_TRAIN_HOURS = 500;

export interface WindFcHour {
  live?: boolean;
  t: number;
  uevm: number | null;
  kgupFirst: number | null;
  ptf?: number | null;
  /** Üretim saati ortalaması (damga i ve i+1) 100 m hız / yön, sürüm başına */
  ws: { d1: number | null; d2: number | null };
  dir: { d1: number | null; d2: number | null };
}

/** Tahminin kullandığı hava özellikleri: anlık değer damga i ve i+1 (ikincisi "ortalama" damgasıyla aynı an) */
export function windForecastFeatures(t: number, lead: "d1" | "d2"): FeatureInfo[] {
  const L = lead === "d2" ? 2 : 1;
  return [weatherFeature(`ws100_${lead}@i`, t, "instant", L), weatherFeature(`ws100_${lead}@i+1`, t, "mean", L)];
}

export interface WindForecastModel {
  trainHours: number;
  excludedHours: number;
  /** Tahmin (MWh); rüzgâr ya da eğri hücresi yoksa null */
  predict: (h: WindFcHour) => number | null;
  /** Yalnız o anda alınan ileri tarihli Forecast API girdisi; geçmiş sınamasında kullanılmaz. */
  predictLive: (h: WindFcHour, now: number) => number | null;
}

export function fitWindForecast(
  train: WindFcHour[],
  capacityMw: number,
  opts: { lead: "d1" | "d2"; trainingEnd: number; leak?: boolean }
): WindForecastModel {
  if (train.some(h => h.live)) throw new Error("Canlı tahmin saati eğitime giremez");
  const { lead } = opts;
  const late = train.find((h) => h.t >= opts.trainingEnd);
  if (late) throw new LeakageError(`Eğitimde kesimden sonraki üretim: ${new Date(late.t).toISOString()}`, [{ name: "uevm", source: "production", availableAt: late.t }]);
  if (lead === "d1" && !opts.leak) throw new LeakageError("d1 rüzgâr tahmini kesimden sonra elde; yalnız leak: true ile (üst sınır)", []);
  const valid = train
    .filter((h) => h.uevm !== null && h.ws[lead] !== null && h.dir[lead] !== null && (h.ptf ?? 1) > 0)
    .map((h) => ({ t: h.t, uevm: h.uevm as number, ws: h.ws[lead] as number, dir: h.dir[lead] as number, kgup: h.kgupFirst }));
  if (valid.length < MIN_TRAIN_HOURS) throw new Error(`Eğitim verisi yetersiz (${valid.length} saat)`);
  const first = fitPowerCurve(valid);
  const keep = valid.filter((h) => {
    const e = first(h.ws, h.dir);
    if (e === null) return true;
    const exp = Math.min(Math.max(0, e), capacityMw);
    if (exp < LOSS_EXPECTED_MIN * capacityMw) return true;
    return !(h.uevm < LOSS_SHARE * exp || (h.kgup !== null && h.kgup < PLANNED_SHARE * exp));
  });
  const curve = fitPowerCurve(keep.length >= MIN_TRAIN_HOURS ? keep : valid);
  return {
    trainHours: keep.length,
    excludedHours: valid.length - keep.length,
    predictLive: (h, now) => {
      const wallNow = now + 3 * 3_600_000;
      if (!Number.isFinite(now) || !Number.isFinite(h.t) || h.t <= wallNow || h.uevm !== null) throw new Error("Canlı tahmin yalnız gelecekte ve gerçekleşensiz kullanılabilir");
      assertAvailable([productionFeature("son eğitim üretimi", opts.trainingEnd - 3_600_000)], h.t);
      const ws = h.ws[lead], dir = h.dir[lead];
      if (ws === null || dir === null || !Number.isFinite(ws) || !Number.isFinite(dir)) return null;
      const e = curve(ws, dir);
      return e === null ? null : Math.min(Math.max(0, e), capacityMw);
    },
    predict: (h) => {
      // Hava (d2) ve eğitimdeki en son üretim saati, bu tahmin saatinin kesiminden önce elde olmalı
      if (!opts.leak) assertAvailable([...windForecastFeatures(h.t, lead), productionFeature("son eğitim üretimi", opts.trainingEnd - 3_600_000)], h.t);
      const ws = h.ws[lead];
      const dir = h.dir[lead];
      if (ws === null || dir === null) return null;
      const e = curve(ws, dir);
      return e === null ? null : Math.min(Math.max(0, e), capacityMw);
    },
  };
}
