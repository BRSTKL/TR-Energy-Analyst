/**
 * TR-Energy Analyst - PTF motoru: ülke rüzgâr tahmini (saf, I/O yok)
 *
 * Hedef: hedef gün T'nin saatlik gerçek zamanlı rüzgâr üretimi (MW). Girdi: bölge noktalarında ECMWF "2 gün önceki" 100 m
 * rüzgâr hızı (kesimde elde; lib/forecast/info-time.ts d2), üretim saati [i, i+1) için iki damganın ortalaması.
 * Model: her noktada genel bir güç eğrisi (kapasite oranı), güç ağırlıklı toplam → indeks I(T,h). Ölçek kurulu gücü ve eğri
 * hatasını taşır: son `scaleDays` bilinen günde (gerçek zamanlı rüzgâr T-2'ye kadar) Σ üretim / Σ I. Tahmin = ölçek × I.
 * Rakipler: kalıcılık (son 3 bilinen günün aynı saat ortalaması; bugünkü yedek) ve EPİAŞ rüzgâr tahmini (2026-06'dan).
 */

import { H, shiftDay } from "./history";

export interface RegionWind {
  weight: number;
  /** Gün → 24 saatlik 100 m hız (m/s, üretim saatine hizalı); eksik saat null */
  ws: Map<string, Array<number | null>>;
}

/** Genel güç eğrisi: 3 m/s'de başlar, 12 m/s'de anma gücü, 25 m/s'de durur (kapasite oranı 0–1) */
export function powerCurve(ws: number): number {
  if (ws < 3 || ws >= 25) return 0;
  if (ws >= 12) return 1;
  return (ws ** 3 - 27) / (12 ** 3 - 27);
}

export function windIndex(regions: RegionWind[], day: string): number[] | null {
  const out: number[] = [];
  for (let h = 0; h < H; h++) {
    let s = 0;
    let w = 0;
    for (const r of regions) {
      const v = r.ws.get(day)?.[h];
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      s += r.weight * powerCurve(v);
      w += r.weight;
    }
    if (w < 0.7) return null;
    out.push(s / w);
  }
  return out;
}

/** Ölçek penceresi (seçim dönemi 2024-05 – 2026-03'te seçildi: saatlik MAE 7 gün 1.948, 14 gün 1.886, 28 gün 1.837, 56 gün 1.788 MW) */
export const WIND_SCALE_DAYS = 56;

/** T için rüzgâr tahmini. `windRt(d)` yalnız d ≤ T-2 için sorulur (gerçek zamanlı üretim kesimde T-2'ye kadar bilinir) */
export function forecastWind(
  target: string,
  windRt: (d: string) => number[] | null,
  index: (d: string) => number[] | null,
  scaleDays: number = WIND_SCALE_DAYS,
  minDays = 5
): number[] | null {
  const it = index(target);
  if (!it) return null;
  let num = 0;
  let den = 0;
  let n = 0;
  for (let i = 2; i < 2 + scaleDays; i++) {
    const d = shiftDay(target, -i);
    const y = windRt(d);
    const x = index(d);
    if (!y || !x) continue;
    n++;
    for (let h = 0; h < H; h++) ((num += y[h]), (den += x[h]));
  }
  if (n < Math.min(minDays, scaleDays) || den <= 0) return null;
  return it.map((x) => (num / den) * x);
}

/** Kalıcılık: son 3 bilinen günün (T-2 … T-4) aynı saat ortalaması */
export function persistenceWind(
  target: string,
  windRt: (d: string) => number[] | null
): number[] | null {
  const prev = [2, 3, 4]
    .map((i) => windRt(shiftDay(target, -i)))
    .filter((x): x is number[] => !!x);
  return prev.length
    ? Array.from(
        { length: H },
        (_, h) => prev.reduce((s, x) => s + x[h], 0) / prev.length
      )
    : null;
}
