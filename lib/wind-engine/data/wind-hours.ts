/**
 * TR-Energy Analyst - Rüzgâr motoru eğitim ve sınama verisi (Aşama 23): havuzdaki üretim + hava arşivleri → saatler
 *
 * Kaynaklar (git dışı, Mac'te): `data/pool/<id>/<yıl>` (UEVM, ilk / son KGÜP), `data/pool/weather/<id>/windfc-<yıl>`
 * (ECMWF IFS 0,25° d1 / d2: 100 m rüzgâr, sıcaklık, basınç, 10 m; wind-forecast-archive.ts), isteğe bağlı
 * `windnwp-<model>-<yıl>` (ICON-EU, GFS d2; wind-nwp-archive.ts) ve gerçekleşen rüzgâr (reanalysis-wind.ts, IFS 9 km;
 * yalnız ETİKET: kısıntıda beklenen üretim, tahmin girdisi olamaz). Hava değerleri anlık; üretim saati [i, i+1) için
 * i ve i+1 ortalaması (yön vektör ortalaması). PTF çağırandan.
 */

import { hourMeanWind } from "@/lib/forecast/wind-loss";
import { readPoolYear } from "@/lib/pool/pool-store";
import { readWindForecastYear, readWindNwpYear, readWindYear } from "@/lib/weather/weather-store";
import { hubWind, WIND_NWP_MODELS, type WindNwpYear } from "@/lib/weather/wind-nwp-archive";
import type { WindEnsembleHour } from "../models/ensemble";

const HOUR = 3_600_000;
type Lead = "d1" | "d2";

export interface WindDataHour extends WindEnsembleHour {
  kgupFinal: number | null;
  /** Gerçekleşen 100 m rüzgâr (yalnız etiket) */
  realized: { ws: number | null; dir: number | null };
}

export interface WindPlantData {
  hours: WindDataHour[];
  /** Open-Meteo nokta rakımı (m) */
  elevation: number | null;
  /** ICON-EU ve GFS arşivi var mı */
  hasModels: boolean;
}

/** `from`–`to` (duvar saati ms) arası saatler; ECMWF tahmin arşivi yoksa null */
export async function loadWindPlantData(epiasPlantId: number, from: number, to: number, ptf: Map<number, number>, realizedModel: "ecmwf_ifs" | "era5" = "ecmwf_ifs"): Promise<WindPlantData | null> {
  const y0 = new Date(from).getUTCFullYear();
  const y1 = new Date(to - 1).getUTCFullYear() + 1;
  const stamps = { d1: new Map<number, number[]>(), d2: new Map<number, number[]>() };
  const realized = new Map<number, [number | null, number | null]>();
  const nwp = new Map<string, Map<number, WindNwpYear>>();
  let elevation: number | null = null;
  for (let y = y0; y <= y1; y++) {
    const fc = await readWindForecastYear(epiasPlantId, y);
    if (fc) {
      const s0 = Date.parse(fc.start);
      for (const l of ["d1", "d2"] as const)
        fc.ws[l].forEach((w, i) =>
          stamps[l].set(s0 + i * HOUR, [w ?? NaN, fc.dir[l][i] ?? NaN, fc.temp?.[l][i] ?? NaN, fc.sp?.[l][i] ?? NaN, fc.msl?.[l][i] ?? NaN, fc.ws10?.[l][i] ?? NaN])
        );
      if (typeof fc.elevation === "number") elevation = fc.elevation;
    }
    const re = await readWindYear(epiasPlantId, realizedModel, y);
    if (re) {
      const s0 = Date.parse(re.start);
      re.ws.forEach((w, i) => realized.set(s0 + i * HOUR, [w, re.dir[i]]));
    }
    for (const m of WIND_NWP_MODELS) {
      const d = await readWindNwpYear(epiasPlantId, m, y);
      if (!d) continue;
      if (!nwp.has(m)) nwp.set(m, new Map());
      nwp.get(m)!.set(y, d);
    }
  }
  if (!stamps.d2.size) return null;
  const num = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? null : v);
  const avg = (a: number | null, b: number | null) => (a === null || b === null ? (a ?? b) : (a + b) / 2);
  const at = (l: Lead, t: number, k: number) => num(stamps[l].get(t)?.[k]);
  const wind = (l: Lead, t: number) => hourMeanWind(at(l, t, 0), at(l, t + HOUR, 0), at(l, t, 1), at(l, t + HOUR, 1));
  const both = (k: number, t: number) => ({ d1: avg(at("d1", t, k), at("d1", t + HOUR, k)), d2: avg(at("d2", t, k), at("d2", t + HOUR, k)) });
  const nwpWind = (m: string, t: number) => {
    const y = new Date(t).getUTCFullYear();
    const d = nwp.get(m)?.get(y);
    return d ? hubWind(d, t, nwp.get(m)?.get(y + 1)) : { ws: null, dir: null };
  };
  const hasModels = WIND_NWP_MODELS.every((m) => (nwp.get(m)?.size ?? 0) > 0);
  const hours: WindDataHour[] = [];
  for (let y = y0; y < y1; y++) {
    const p = await readPoolYear(epiasPlantId, y);
    if (!p) continue;
    const s0 = Date.parse(p.start);
    for (let i = 0; i < p.uevm.length; i++) {
      const t = s0 + i * HOUR;
      if (t < from || t >= to) continue;
      const w1 = wind("d1", t);
      const w2 = wind("d2", t);
      const a = realized.get(t);
      const b = realized.get(t + HOUR);
      const re = hourMeanWind(a?.[0] ?? null, b?.[0] ?? null, a?.[1] ?? null, b?.[1] ?? null);
      hours.push({
        t,
        uevm: p.uevm[i] === null ? null : Math.max(0, p.uevm[i]!),
        kgupFirst: p.kgupFirst[i],
        kgupFinal: p.kgupFinal?.[i] ?? null,
        ptf: ptf.get(t) ?? null,
        ws: { d1: w1.ws, d2: w2.ws },
        dir: { d1: w1.dir, d2: w2.dir },
        temp: both(2, t),
        pressure: both(3, t),
        msl: both(4, t),
        ws10: both(5, t),
        src: hasModels ? { ecmwf_ifs025: w2, icon_eu: nwpWind("icon_eu", t), gfs_global: nwpWind("gfs_global", t) } : {},
        realized: re,
      });
    }
  }
  return { hours, elevation, hasModels };
}
