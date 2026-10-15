/**
 * TR-Energy Analyst - Üretim tahmini için saatlik veri (PLAN 15.4)
 *
 * Bir santralin havuzdaki üretimi ve KGÜP'leri (data/pool), hava verisi havuzundaki 2 gün önceki ECMWF tahmini
 * (data/pool/weather, üretim saatine hizalı) ve PTF'yi (MarketData) saat saat birleştirir. Konum havuz tanımından.
 * Zaman duvar saatidir (havuz kuralı).
 */

import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { readWeatherYear } from "@/lib/weather/weather-store";
import type { SolarHour, SolarSite } from "@/lib/forecast/production-model";

const HOUR = 3_600_000;

export interface SolarPlantData {
  epiasPlantId: number;
  name: string;
  site: SolarSite;
  hours: SolarHour[];
}

/** [from, to) aralığı (duvar saati ms; ay başları önerilir). Konum ya da hava verisi yoksa null */
export async function loadSolarHours(epiasPlantId: number, from: number, to: number): Promise<SolarPlantData | null> {
  const info = await readPoolPlantInfo(epiasPlantId);
  if (!info?.location) return null;
  const firstYear = new Date(from).getUTCFullYear();
  const lastYear = new Date(to - 1).getUTCFullYear();
  const ptfRows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(from - 2 * 24 * HOUR), lt: new Date(to) } }, select: { timestamp: true, ptf: true } });
  const ptf = new Map(ptfRows.map((r) => [r.timestamp.getTime(), r.ptf]));

  // Üretim saat → değer (48 saat önceki için bir önceki yıl da gerekebilir)
  const uevm = new Map<number, number | null>();
  const hours: SolarHour[] = [];
  let anyWeather = false;
  for (let y = firstYear - 1; y <= lastYear; y++) {
    const p = await readPoolYear(epiasPlantId, y);
    if (!p) continue;
    const start = Date.parse(p.start);
    p.uevm.forEach((v, i) => uevm.set(start + i * HOUR, v));
  }
  // Yıl başındaki ilk 48 saat için önceki yılın son GHI değerleri
  const prevGhi = new Map<number, number | null>();
  const prevW = await readWeatherYear(epiasPlantId, firstYear - 1);
  if (prevW) {
    const s0 = Date.parse(prevW.start);
    const g = prevW.series.d2.shortwave_radiation;
    for (let i = Math.max(0, g.length - 48); i < g.length; i++) prevGhi.set(s0 + i * HOUR, g[i]);
  }
  for (let y = firstYear; y <= lastYear; y++) {
    const [p, w] = await Promise.all([readPoolYear(epiasPlantId, y), readWeatherYear(epiasPlantId, y)]);
    if (!w) continue;
    anyWeather = true;
    const start = Date.parse(w.start);
    const d2 = w.series.d2;
    for (let i = 0; i < d2.shortwave_radiation.length; i++) {
      const t = start + i * HOUR;
      if (t < from || t >= to) continue;
      const pi = p ? (t - Date.parse(p.start)) / HOUR : -1;
      hours.push({
        t,
        uevm: uevm.get(t) ?? null,
        kgupFirst: p ? p.kgupFirst[pi] ?? null : null,
        kgupFinal: p ? p.kgupFinal[pi] ?? null : null,
        ptf: ptf.get(t) ?? null,
        ghi: d2.shortwave_radiation[i],
        direct: d2.direct_radiation[i],
        diffuse: d2.diffuse_radiation[i],
        temp: d2.temperature_2m[i],
        cloud: d2.cloud_cover[i],
        lag48: uevm.get(t - 48 * HOUR) ?? null,
        ghiLag48: i >= 48 ? d2.shortwave_radiation[i - 48] : (prevGhi.get(t - 48 * HOUR) ?? null),
      });
    }
  }
  if (!anyWeather) return null;
  return { epiasPlantId, name: info.name ?? String(epiasPlantId), site: { latitude: info.location.latitude, longitude: info.location.longitude }, hours };
}
