/**
 * TR-Energy Analyst - PTF motoru: ülke güneşi için bölge noktaları (saf, I/O yok)
 *
 * İşletmedeki GES'ler (Global Energy Monitor Global Solar Power Tracker, koordinat + MW) 1°×1° hücrelere toplanır; hücre
 * noktası kapasite ağırlıklı merkez. En büyük `n` hücre seçilir, kalan hücrelerin gücü en yakın seçilmiş noktaya eklenir.
 * Ağırlık = noktanın MW payı. GEM listesi lisanssız küçük tesislerin hepsini kapsamaz ve kurulu gücün zaman içindeki
 * büyümesini göstermez: ağırlıklar yalnız coğrafi dağılım içindir, ölçek güneş modelinde son günlerden öğrenilir.
 */

export interface SolarPlantPoint {
  lat: number;
  lon: number;
  mw: number;
}

export interface SolarRegion {
  id: string;
  lat: number;
  lon: number;
  /** Temsil ettiği kurulu güç (MW, GEM) ve payı */
  mw: number;
  weight: number;
}

export function pickSolarRegions(plants: SolarPlantPoint[], n = 30): SolarRegion[] {
  const cells = new Map<string, { mw: number; lat: number; lon: number }>();
  for (const p of plants) {
    if (!(p.mw > 0) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const key = `${Math.floor(p.lat)}:${Math.floor(p.lon)}`;
    const c = cells.get(key) ?? { mw: 0, lat: 0, lon: 0 };
    c.mw += p.mw;
    c.lat += p.lat * p.mw;
    c.lon += p.lon * p.mw;
    cells.set(key, c);
  }
  const all = Array.from(cells.values())
    .map((c) => ({ mw: c.mw, lat: c.lat / c.mw, lon: c.lon / c.mw }))
    .sort((a, b) => b.mw - a.mw);
  const chosen = all.slice(0, n).map((c) => ({ ...c }));
  for (const c of all.slice(n)) {
    let best = 0;
    let bestD = Infinity;
    chosen.forEach((k, i) => {
      const d =
        (k.lat - c.lat) ** 2 + ((k.lon - c.lon) * Math.cos((c.lat * Math.PI) / 180)) ** 2;
      if (d < bestD) ((bestD = d), (best = i));
    });
    chosen[best].mw += c.mw;
  }
  const total = chosen.reduce((s, c) => s + c.mw, 0);
  return chosen.map((c, i) => ({
    id: `r${String(i + 1).padStart(2, "0")}`,
    lat: Math.round(c.lat * 1e4) / 1e4,
    lon: Math.round(c.lon * 1e4) / 1e4,
    mw: Math.round(c.mw),
    weight: c.mw / total,
  }));
}

/** Aynı seçim rüzgârda da kullanılır (RES noktaları, GEM Global Wind Power Tracker) */
export const pickRegions = pickSolarRegions;
