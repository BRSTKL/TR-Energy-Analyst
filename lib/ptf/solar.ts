/**
 * TR-Energy Analyst - PTF motoru: ülke güneş tahmini (saf, I/O yok)
 *
 * Hedef: hedef gün T'nin saatlik KGÜP güneşi (lisanssız dahil, MW). KGÜP güneşi şirketlerin T-1 öğleden sonra bildirdiği
 * plandır (bir tahmin); hata bütçesindeki "güneşi tam bilseydik" deneyinin kullandığı değer de odur.
 * Model: ışınım indeksi I(T,h) = Σ bölge ağırlığı × ECMWF "2 gün önceki" küresel ışınım tahmini (W/m²; sürüm kesimde
 * elde: lib/forecast/info-time.ts, d2). Ölçek kurulu güç büyümesini ve saat profilini taşır: saat h için son 7 bilinen
 * günde (KGÜP güneşi T-1'e kadar) Σ KGÜP / Σ I. Tahmin = ölçek(h) × I(T,h). Eğitilen başka parametre yok.
 * Rakip (bugünkü vekil): son 7 bilinen günün aynı saat KGÜP güneşi ortancası.
 */

import { H, median, shiftDay } from "./history";

export interface RegionDayWeather {
  weight: number;
  /** Gün → 24 saatlik d2 küresel ışınım (W/m²; üretim saatine hizalı); eksik saat null */
  ghi: Map<string, Array<number | null>>;
}

/** Bölgelerin ağırlıklı ışınım indeksi; bir bölgede eksik saat varsa o saat diğerlerinin ağırlığıyla yeniden ölçeklenir */
export function irradianceIndex(
  regions: RegionDayWeather[],
  day: string
): number[] | null {
  const out: number[] = [];
  for (let h = 0; h < H; h++) {
    let s = 0;
    let w = 0;
    for (const r of regions) {
      const v = r.ghi.get(day)?.[h];
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      s += r.weight * v;
      w += r.weight;
    }
    if (w < 0.7) return null; // bölgelerin çoğunda veri yoksa gün kurulmaz
    out.push(s / w);
  }
  return out;
}

/** Ölçek penceresi (seçim dönemi 2024-05 – 2026-03'te seçildi: gündüz MAE 7 gün 268, 14 gün 303, 28 gün 365 MW) */
export const SOLAR_SCALE_DAYS = 7;

/**
 * T için güneş tahmini. `kgupSun(d)`: d gününün KGÜP güneşi (yalnız d ≤ T-1 sorulur); `index(d)`: ışınım indeksi.
 * Ölçek için en az 5 gün gerekir.
 */
export function forecastSolar(
  target: string,
  kgupSun: (d: string) => number[] | null,
  index: (d: string) => number[] | null,
  scaleDays: number = SOLAR_SCALE_DAYS,
  minDays = 5
): number[] | null {
  const it = index(target);
  if (!it) return null;
  const num = Array<number>(H).fill(0);
  const den = Array<number>(H).fill(0);
  let n = 0;
  for (let i = 1; i <= scaleDays; i++) {
    const d = shiftDay(target, -i);
    const k = kgupSun(d);
    const x = index(d);
    if (!k || !x) continue;
    n++;
    for (let h = 0; h < H; h++) ((num[h] += k[h]), (den[h] += x[h]));
  }
  if (n < Math.min(minDays, scaleDays)) return null;
  return it.map((x, h) => (den[h] > 1 ? Math.max(0, (num[h] / den[h]) * x) : 0));
}

/** Bugünkü vekil: son 7 bilinen günün aynı saat ortancası */
export function proxySolar(
  target: string,
  kgupSun: (d: string) => number[] | null
): number[] | null {
  const prev = Array.from({ length: 7 }, (_, i) =>
    kgupSun(shiftDay(target, -(i + 1)))
  ).filter((x): x is number[] => !!x);
  return prev.length >= 4
    ? Array.from({ length: H }, (_, h) => median(prev.map((x) => x[h])))
    : null;
}
