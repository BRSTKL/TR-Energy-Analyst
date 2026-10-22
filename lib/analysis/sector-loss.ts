/**
 * TR-Energy Analyst - Sektörde uyduyla kayıp üretim özeti (PLAN 20.4)
 *
 * Santral × ay kayıp (lib/forecast/curtailment.ts `monthlyLoss`, devreye alma ayları hariç) gruplanır: bütün santraller,
 * YEKA (adı yarışma koduyla başlar, "G4-…", ya da "YEKA" içerir) ve diğerleri. Yıllar aynı aylarla karşılaştırılır
 * (Ocak – `lastMonth`). Grup oranı birleştirilmiş: Σ kayıp ÷ Σ (gerçekleşen + kayıp). SAF.
 */

import type { MonthlyLoss } from "@/lib/forecast/curtailment";

export interface SectorLossPlant {
  epiasPlantId: number;
  name: string;
  organizationName: string | null;
  locationSource: string;
  months: MonthlyLoss[];
}

export type LossGroupKey = "all" | "yeka" | "other";
export const LOSS_GROUP_LABEL: Record<LossGroupKey, string> = { all: "Bütün santraller", yeka: "YEKA", other: "YEKA dışı" };

export const isYeka = (name: string) => /^G\d+[-_ ]/i.test(name.trim()) || /YEKA/i.test(name);

export interface LossTotals {
  plants: number;
  actualMwh: number;
  plannedLossMwh: number;
  unplannedLossMwh: number;
  lossPct: number;
  /** Planlı kısıntının kayıp içindeki payı (MWh, %) */
  plannedSharePct: number;
  plannedValueTl: number;
  unplannedValueTl: number;
  /** Plansız kaybın yerde kar olan saatlere düşen kısmı (güneş, kar verisi varsa), MWh */
  snowLossMwh: number;
}

export interface SectorLossYear {
  year: number;
  groups: Record<LossGroupKey, LossTotals>;
  /** Grup → ay ("YYYY-MM") → oran ve planlı / plansız MWh */
  monthly: Record<LossGroupKey, Array<{ month: string; lossPct: number; plannedLossMwh: number; unplannedLossMwh: number; snowLossMwh?: number }>>;
}

export interface SectorLossPlantRow {
  epiasPlantId: number;
  name: string;
  organizationName: string | null;
  yeka: boolean;
  locationSource: string;
  /** Yıl → toplamlar (aynı aylar) */
  years: Record<number, Omit<LossTotals, "plants">>;
}

function totals(ms: MonthlyLoss[], plants: number): LossTotals {
  const actual = ms.reduce((a, m) => a + m.actualMwh, 0);
  const planned = ms.reduce((a, m) => a + m.plannedLossMwh, 0);
  const unplanned = ms.reduce((a, m) => a + m.unplannedLossMwh, 0);
  const lost = planned + unplanned;
  return {
    plants,
    actualMwh: actual,
    plannedLossMwh: planned,
    unplannedLossMwh: unplanned,
    lossPct: actual + lost > 0 ? (lost / (actual + lost)) * 100 : 0,
    plannedSharePct: lost > 0 ? (planned / lost) * 100 : 0,
    plannedValueTl: ms.reduce((a, m) => a + m.plannedValueTl, 0),
    unplannedValueTl: ms.reduce((a, m) => a + m.unplannedValueTl, 0),
    snowLossMwh: ms.reduce((a, m) => a + (m.snowLossMwh ?? 0), 0),
  };
}

/** Yıl özetleri (aynı aylar) ve santral satırları; devreye alma ayları ve üretimsiz aylar dışarıda */
export function sectorLoss(plants: SectorLossPlant[], years: number[], lastMonth: number): { years: SectorLossYear[]; plants: SectorLossPlantRow[] } {
  const inWindow = (m: MonthlyLoss, y: number) => m.month.startsWith(`${y}-`) && Number(m.month.slice(5, 7)) <= lastMonth && !m.commissioning && m.actualMwh > 0;
  const groupOf = (p: SectorLossPlant): LossGroupKey[] => ["all", isYeka(p.name) ? "yeka" : "other"];
  const out: SectorLossYear[] = [];
  for (const y of years) {
    const groups = {} as Record<LossGroupKey, LossTotals>;
    const monthly = {} as SectorLossYear["monthly"];
    for (const g of ["all", "yeka", "other"] as const) {
      const members = plants.filter((p) => groupOf(p).includes(g));
      const ms = members.flatMap((p) => p.months.filter((m) => inWindow(m, y)));
      const count = members.filter((p) => p.months.some((m) => inWindow(m, y))).length;
      groups[g] = totals(ms, count);
      const byMonth = new Map<string, MonthlyLoss[]>();
      for (const m of ms) byMonth.set(m.month, [...(byMonth.get(m.month) ?? []), m]);
      monthly[g] = Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, xs]) => {
          const t = totals(xs, 0);
          return { month, lossPct: t.lossPct, plannedLossMwh: t.plannedLossMwh, unplannedLossMwh: t.unplannedLossMwh, snowLossMwh: t.snowLossMwh };
        });
    }
    out.push({ year: y, groups, monthly });
  }
  const rows: SectorLossPlantRow[] = plants.map((p) => {
    const ys: SectorLossPlantRow["years"] = {};
    for (const y of years) {
      const ms = p.months.filter((m) => inWindow(m, y));
      if (ms.length) {
        const { plants: _n, ...rest } = totals(ms, 1);
        ys[y] = rest;
      }
    }
    return { epiasPlantId: p.epiasPlantId, name: p.name, organizationName: p.organizationName, yeka: isYeka(p.name), locationSource: p.locationSource, years: ys };
  });
  return { years: out, plants: rows };
}
