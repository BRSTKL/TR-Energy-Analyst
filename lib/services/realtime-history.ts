/**
 * TR-Energy Analyst - Geçmiş aylar için EPİAŞ gerçek zamanlı üretimi (GZÜ), yalnız geriye dönük test girdisi
 * (scripts/realtime-history.mts çeker, scripts/forecast-backtest-gzu.mts okur). Havuzdaki geçici üretimden (rt-<yıl>,
 * canlı eğitim ve karne) ayrıdır.
 */

import fs from "node:fs";
import path from "node:path";

export interface RealtimeHistory {
  epiasPlantId: number;
  rtPlantId: number;
  eic: string;
  /** "YYYY-MM" → [duvar saati ms, MWh] (EPİAŞ'ın döndürdüğü saatler) */
  months: Record<string, Array<[number, number]>>;
}

export const realtimeHistoryPath = (epiasPlantId: number) => path.join(process.cwd(), ".cache", "epias", "realtime-history", `${epiasPlantId}.json`);

/** Saat → GZÜ (MWh) ve çekilmiş aylar; dosya yoksa null */
export function readRealtimeHistory(epiasPlantId: number): (Map<number, number> & { months?: string[] }) | null {
  const file = realtimeHistoryPath(epiasPlantId);
  if (!fs.existsSync(file)) return null;
  const doc = JSON.parse(fs.readFileSync(file, "utf8")) as RealtimeHistory;
  return Object.assign(new Map(Object.values(doc.months).flat()), { months: Object.keys(doc.months).sort() });
}
