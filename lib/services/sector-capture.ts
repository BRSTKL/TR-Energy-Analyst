/**
 * TR-Energy Analyst - Sektör capture rate önbelleği (PLAN 19.3)
 *
 * scripts/sector-capture.mts çıktısını okur (.cache/epias/sector-capture.json) ve bir projenin santrallerinin ve teknoloji
 * toplamlarının sektördeki yerini (yüzdelik; yüksek capture rate = iyi) verir. Dosya yoksa null.
 *
 * Kümeler: yılın `groups` / `plantRates` alanları karnenin lisanslı santralleri (ana kıyas); lisanssız toplamlar (K3_, LÜM_,
 * LÜY) `unlicensed` alanında ayrı. Yıllar arası değişim yalnız `common` ile (iki yılda da aynı gruptaki lisanslı santraller):
 * iki yılın `groups` alanları farklı kümelerdir (yeni santraller), doğrudan kıyaslanmaz.
 */

import fs from "node:fs";
import path from "node:path";
import { percentileOf, type GroupCapture } from "@/lib/analysis/capture-rate";
import type { ComparisonRow } from "@/lib/analysis/plant-comparison";

export interface SectorCaptureYear {
  year: number;
  months: number;
  plants: number;
  missing: number;
  groups: GroupCapture[];
  /** Grup → [EPİAŞ santral kimliği, capture rate %, üretim MWh] */
  plantRates: Record<string, Array<[number, number, number]>>;
  /** Lisanssız toplamlar, ayrı grup (yoksa null; ana kıyasa ve plantRates'e girmez) */
  unlicensed?: { plants: number; missing: number; groups: GroupCapture[] } | null;
}

/** Yıllar arası kıyas: iki yılda da aynı gruptaki lisanslı santraller, aynı aylar (Ocak–months) */
export interface SectorCaptureCommon {
  fromYear: number;
  toYear: number;
  months: number;
  byYear: Array<{ year: number; groups: GroupCapture[] }>;
}

export interface SectorCapture {
  generatedAt: string;
  lastMonth: number;
  years: SectorCaptureYear[];
  common?: SectorCaptureCommon | null;
  fullYear: SectorCaptureYear | null;
}

export const CAPTURE_GROUP_LABEL: Record<string, string> = {
  GES: "Güneş",
  RES: "Rüzgâr",
  HES: "Hidro",
  "HES:RESERVOIR": "Hidro · barajlı",
  "HES:RUN_OF_RIVER": "Hidro · nehir tipi",
};

export const MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** "2026 Ocak–Ağustos" */
export const capturePeriodLabel = (year: number, months: number) => `${year} Ocak–${MONTH_NAMES[months - 1]}`;

export function loadSectorCapture(): SectorCapture | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "epias", "sector-capture.json"), "utf8"));
  } catch {
    return null;
  }
}

export interface CapturePosition {
  /** Karşılaştırılan sektör grubu ("HES:RUN_OF_RIVER" …) */
  group: string;
  groupLabel: string;
  /** Satırın capture rate'i (%) */
  ratePct: number;
  /** Sektördeki yüzdelik (0–100; yüksek = iyi) */
  percentile: number;
  sectorMedianPct: number;
  sectorPlants: number;
}

/**
 * Karşılaştırma satırlarının sektördeki yeri. Santral, karnede bir hidro alt grubundaysa o alt grupla (barajlı / nehir
 * tipi), değilse teknolojisiyle kıyaslanır; teknoloji toplamı teknolojinin bütün santralleriyle. Sektör yılı verinin
 * yılıyla eşleşmezse null.
 */
export function capturePositions(
  rows: ComparisonRow[],
  plants: Array<{ plantId: string; epiasPlantId: number | null }>,
  year: number,
  sector: SectorCapture | null = loadSectorCapture()
): Record<string, CapturePosition> | null {
  const y = sector?.years.find((x) => x.year === year);
  if (!y) return null;
  const sorted = Object.fromEntries(Object.entries(y.plantRates).map(([g, list]) => [g, list.map((r) => r[1]).sort((a, b) => a - b)]));
  const subgroupOf = new Map<number, string>();
  for (const g of ["HES:RESERVOIR", "HES:RUN_OF_RIVER"]) for (const [id] of y.plantRates[g] ?? []) subgroupOf.set(id, g);
  const epiasOf = new Map(plants.map((p) => [p.plantId, p.epiasPlantId]));
  const out: Record<string, CapturePosition> = {};
  for (const r of rows) {
    if (r.level === "portfolio" || !r.plantType || !(r.captureRate > 0)) continue;
    const id = r.level === "plant" ? epiasOf.get(r.key) ?? null : null;
    const group = (id !== null && subgroupOf.get(id)) || r.plantType;
    const values = sorted[group];
    if (!values?.length) continue;
    const ratePct = r.captureRate * 100;
    const median = y.groups.find((g) => g.key === group)?.distribution?.p50 ?? values[Math.floor(values.length / 2)];
    out[r.key] = { group, groupLabel: CAPTURE_GROUP_LABEL[group] ?? group, ratePct, percentile: percentileOf(ratePct, values)!, sectorMedianPct: median, sectorPlants: values.length };
  }
  return out;
}
