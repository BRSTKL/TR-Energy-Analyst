/**
 * TR-Energy Analyst - Sektörde uyduyla kayıp üretim önbelleği (PLAN 20.4)
 *
 * Güneş: `scripts/sector-curtailment.mts` çıktısı `.cache/epias/sector-curtailment.json`. Rüzgâr (18.10.2026):
 * `scripts/sector-wind-curtailment.mts` çıktısı `.cache/epias/sector-curtailment-wind.json`. Hidro (18.10.2026):
 * `scripts/sector-hydro-curtailment.mts` çıktısı `.cache/epias/sector-curtailment-hydro.json` (bildirilen kullanılamayan
 * kapasite ve nehir tipinde ani düşüşler; lib/analysis/hydro-loss.ts). Dosya yoksa null.
 */

import fs from "node:fs";
import path from "node:path";
import type { SectorLossPlantRow, SectorLossYear } from "@/lib/analysis/sector-loss";

export interface SectorCurtailment {
  generatedAt: string;
  lastMonth: number;
  /** Güneş: licensedSolar, withoutSatellite; rüzgâr: licensed, withoutWind, unreliable (kalite eşiği altı), included */
  coverage: { licensedSolar?: number; licensed?: number; located: number; bySource: Record<string, number>; withoutSatellite?: number; withoutWind?: number; unreliable?: number; included?: number; withSnow?: number };
  /** Rüzgâr: kalite eşiğini geçmeyen santraller */
  unreliable?: Array<{ epiasPlantId: number; name: string; dailyR: number | null }>;
  years: SectorLossYear[];
  plants: SectorLossPlantRow[];
}

export function loadSectorCurtailment(tech: "GES" | "RES" = "GES"): SectorCurtailment | null {
  const f = path.join(process.cwd(), ".cache", "epias", tech === "RES" ? "sector-curtailment-wind.json" : "sector-curtailment.json");
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as SectorCurtailment) : null;
}

export type HydroKindKey = "RESERVOIR" | "RUN_OF_RIVER" | "unclassified";
type Causes = Record<"fault" | "maintenance" | "curtailment" | "economic" | "other", number>;
export interface HydroLossTotals {
  plants: number;
  plantsWithNotice: number;
  actualMwh: number;
  /** Bildirilen kullanılamayan kapasite (MWh) ve potansiyele oranı (%); en çok */
  reportedLossMwh: number;
  reportedPct: number;
  byCause: Causes;
  valueTl: number;
  unplannedEvents: number;
  unplannedMwh: number;
  unplannedWithNotice: number;
  plannedEvents: number;
  plannedMwh: number;
  /** Nehir tipi bildirimsiz uzun duruş (20.10.2026'dan; eski dosyada yok), MWh ve santral sayısı */
  longStopMwh?: number;
  longStopPlants?: number;
}
export interface SectorHydroLoss {
  generatedAt: string;
  lastMonth: number;
  coverage: { licensed: number; withData: number; noticeCoverage: { from: string; to: string }; byKind: Record<HydroKindKey, number> };
  years: Array<{ year: number; groups: Record<"all" | HydroKindKey, HydroLossTotals>; monthly: Array<{
      month: string;
      reportedPct: number;
      /** 18.10.2026'dan: barajlı arızadaki kapasite ve nehir tipi düşüşler (olayın başladığı ay) */
      reservoirPct?: number;
      reservoirLostMwh?: number;
      rorUnplannedMwh?: number;
      rorPlannedMwh?: number;
      rorLongStopMwh?: number;
    }>;
  }>;
  plants: Array<{
    epiasPlantId: number;
    name: string;
    organizationName: string | null;
    kind: HydroKindKey;
    capacityMw: number;
    years: Record<
      number,
      {
        actualMwh: number;
        reportedLossMwh: number;
        reportedPct: number;
        byCause: Causes;
        valueTl: number;
        noticeHours: number;
        drops: {
          unplannedEvents: number;
          unplannedMwh: number;
          unplannedWithNotice: number;
          plannedEvents: number;
          plannedMwh: number;
          longStopMwh?: number;
          longStopHours?: number;
        } | null;
      }
    >;
  }>;
}

export function loadSectorHydroLoss(): SectorHydroLoss | null {
  const f = path.join(process.cwd(), ".cache", "epias", "sector-curtailment-hydro.json");
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as SectorHydroLoss) : null;
}
