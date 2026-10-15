/**
 * TR-Energy Analyst - Sektörde uyduyla kayıp üretim önbelleği (PLAN 20.4)
 *
 * `scripts/sector-curtailment.mts` çıktısı `.cache/epias/sector-curtailment.json`; yoksa null.
 */

import fs from "node:fs";
import path from "node:path";
import type { SectorLossPlantRow, SectorLossYear } from "@/lib/analysis/sector-loss";

export interface SectorCurtailment {
  generatedAt: string;
  lastMonth: number;
  coverage: { licensedSolar: number; located: number; bySource: Record<string, number>; withoutSatellite: number };
  years: SectorLossYear[];
  plants: SectorLossPlantRow[];
}

export function loadSectorCurtailment(): SectorCurtailment | null {
  const f = path.join(process.cwd(), ".cache", "epias", "sector-curtailment.json");
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as SectorCurtailment) : null;
}
