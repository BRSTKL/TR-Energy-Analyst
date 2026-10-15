/**
 * TR-Energy Analyst - Üretim tahmini için saatlik veri (PLAN 15.4)
 *
 * Bir santralin havuzdaki üretimi ve KGÜP'leri (data/pool), hava verisi havuzundaki 2 gün önceki ECMWF tahmini (ya da
 * `weatherLead` ile 1 / 0 gün önceki: yalnız sızıntı üst sınırı; saat bu sürümle etiketlenir, model bilgi zamanını ona göre denetler)
 * (data/pool/weather, üretim saatine hizalı) ve PTF'yi (MarketData) saat saat birleştirir. Konum havuz tanımından.
 * Zaman duvar saatidir (havuz kuralı).
 */

import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { readSatelliteYear, readWeatherYear } from "@/lib/weather/weather-store";
import type { WeatherLead } from "@/lib/weather/weather-codec";
import type { WeatherLeadDays } from "@/lib/forecast/info-time";
import type { SolarSite } from "@/lib/forecast/production-model";
import type { SolarHourV2 } from "@/lib/forecast/production-model-v2";

const HOUR = 3_600_000;

export interface SolarPlantData {
  epiasPlantId: number;
  name: string;
  site: SolarSite;
  /** Sürüm 1 bu alanların alt kümesini kullanır (SolarHourV2, SolarHour'u genişletir) */
  hours: SolarHourV2[];
}

/** [from, to) aralığı (duvar saati ms; ay başları önerilir). Konum ya da hava verisi yoksa null. `notAfter` verilirse
 * bu andan sonraki saat istenince hata (tasarım verisini kilitlemek için) */
export async function loadSolarHours(
  epiasPlantId: number,
  from: number,
  to: number,
  opts: { notAfter?: number; weatherLead?: WeatherLeadDays } = {}
): Promise<SolarPlantData | null> {
  const lead = opts.weatherLead ?? 2;
  const key = (`d${lead}` as const) satisfies WeatherLead;
  if (opts.notAfter !== undefined && to > opts.notAfter) throw new Error(`Kilitli dönem: ${new Date(opts.notAfter).toISOString().slice(0, 10)} sonrası istenemez`);
  const info = await readPoolPlantInfo(epiasPlantId);
  if (!info?.location) return null;
  const firstYear = new Date(from).getUTCFullYear();
  const lastYear = new Date(to - 1).getUTCFullYear();
  const ptfRows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(from - 2 * 24 * HOUR), lt: new Date(to) } }, select: { timestamp: true, ptf: true } });
  const ptf = new Map(ptfRows.map((r) => [r.timestamp.getTime(), r.ptf]));

  // Üretim saat → değer (48 saat önceki için bir önceki yıl da gerekebilir)
  const uevm = new Map<number, number | null>();
  const hours: SolarHourV2[] = [];
  let anyWeather = false;
  for (let y = firstYear - 1; y <= lastYear; y++) {
    const p = await readPoolYear(epiasPlantId, y);
    if (!p) continue;
    const start = Date.parse(p.start);
    p.uevm.forEach((v, i) => uevm.set(start + i * HOUR, v));
  }
  // Yıl başındaki ilk 48 saat için önceki yılın son GHI değerleri
  const prev = new Map<number, [number | null, number | null, number | null]>();
  const prevW = await readWeatherYear(epiasPlantId, firstYear - 1);
  if (prevW) {
    const s0 = Date.parse(prevW.start);
    const d = prevW.series[key];
    for (let i = Math.max(0, d.shortwave_radiation.length - 48); i < d.shortwave_radiation.length; i++)
      prev.set(s0 + i * HOUR, [d.shortwave_radiation[i], d.direct_radiation[i], d.diffuse_radiation[i]]);
  }
  for (let y = firstYear; y <= lastYear; y++) {
    const [p, w, sat] = await Promise.all([readPoolYear(epiasPlantId, y), readWeatherYear(epiasPlantId, y), readSatelliteYear(epiasPlantId, y)]);
    const si = (t: number) => (sat ? (t - Date.parse(sat.start)) / HOUR : -1);
    if (!w) continue;
    anyWeather = true;
    const start = Date.parse(w.start);
    const d2 = w.series[key];
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
        weatherLead: lead,
        lag48: uevm.get(t - 48 * HOUR) ?? null,
        ghiLag48: i >= 48 ? d2.shortwave_radiation[i - 48] : (prev.get(t - 48 * HOUR)?.[0] ?? null),
        directLag48: i >= 48 ? d2.direct_radiation[i - 48] : (prev.get(t - 48 * HOUR)?.[1] ?? null),
        diffuseLag48: i >= 48 ? d2.diffuse_radiation[i - 48] : (prev.get(t - 48 * HOUR)?.[2] ?? null),
        satGhi: sat ? sat.ghi[si(t)] ?? null : null,
        satDirect: sat ? sat.direct[si(t)] ?? null : null,
        satDiffuse: sat ? sat.diffuse[si(t)] ?? null : null,
      });
    }
  }
  if (!anyWeather) return null;
  return { epiasPlantId, name: info.name ?? String(epiasPlantId), site: { latitude: info.location.latitude, longitude: info.location.longitude }, hours };
}
