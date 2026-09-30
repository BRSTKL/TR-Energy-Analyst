/**
 * TR-Energy Analyst - Proje santralinin saatleri veri havuzundan (PLAN 7.7)
 *
 * Havuzdan okunan (poolBacked) santral için saatlik plan ve gerçekleşen, projenin dönemi içinde, santralin KGÜP
 * sürümüyle alınır. Yalnızca plan ve gerçekleşenin birlikte olduğu saatler döner: veritabanındaki kayıtlarla aynı
 * kural (EPİAŞ proje ekranı yalnız bu saatleri kaydediyordu).
 */

import { monthsInRange, readRange, type PoolYear } from "./pool-codec";
import { readPoolYearCached } from "./pool-store";

export interface PoolHourRow {
  timestamp: Date;
  forecastMwh: number;
  actualMwh: number;
  /** Son KGÜP (havuzda o ay çekildiyse); ilk plan sürümünde KÜPST için */
  forecastFinalMwh: number | null;
}

export interface PoolPlantRef {
  epiasPlantId: number | null;
  kgupVersion?: string | null;
}

export async function poolPlantRows(plant: PoolPlantRef, periodStart: string, periodEnd: string): Promise<PoolHourRow[]> {
  if (plant.epiasPlantId === null) return [];
  const years = Array.from(new Set(monthsInRange(periodStart, periodEnd).map((m) => m.year)));
  const docs = (await Promise.all(years.map((y) => readPoolYearCached(plant.epiasPlantId!, y)))).filter(
    (d): d is PoolYear => d !== null
  );
  const series = plant.kgupVersion === "FINAL" ? "kgupFinal" : "kgupFirst";
  const out: PoolHourRow[] = [];
  for (const r of readRange(docs, periodStart, periodEnd)) {
    const f = r[series];
    if (f === null || r.uevm === null) continue;
    out.push({ timestamp: r.timestamp, forecastMwh: f, actualMwh: r.uevm, forecastFinalMwh: r.kgupFinal });
  }
  return out;
}
