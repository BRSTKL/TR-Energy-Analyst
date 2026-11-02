/**
 * TR-Energy Analyst - portföy üretim tahmini (Teklif masası, Bugün kokpiti): sunucunun sabah yazdığı değişmeyen kayıtlardan
 *
 * Hesap yok: yarının (ya da verilen günün) güneş ve rüzgâr günlük kayıtları (`readForecastLog`) okunur, projelerin santrallerinin
 * EPİAŞ kimlikleriyle eşlenip saat saat toplanır. HES ve konumu / verisi olmayan santraller tahmin dışıdır; sayıları ayrıca verilir
 * (sessizce atlanmaz). Aynı santral birden çok projede olabilir: portföy toplamı santral başına bir kez sayılır.
 */

import { prisma } from "@/lib/prisma";
import { readForecastLog } from "@/lib/solar-engine/learning/forecast-log-store";
import type { ForecastLog } from "@/lib/solar-engine/learning/forecast-log";

const H = 24;

export interface TechProduction {
  /** Tahmini kayıtta bulunan ve kurulabilen santral sayısı / projedeki bu teknolojideki santral sayısı */
  ok: number;
  total: number;
  /** Günlük toplam, MWh */
  mwh: number;
  /** Saat saat toplam, MWh */
  hours: number[];
  issuedAt: string;
  /** Kayıt GÖP kesiminden önce mi yazıldı */
  onTime: boolean;
}

export interface ProjectProduction {
  projectId: string;
  name: string;
  solar: TechProduction | null;
  wind: TechProduction | null;
  /** Güneş + rüzgâr, saat saat; ikisi de yoksa null */
  hours: number[] | null;
  mwh: number;
  /** Tahmin kapsamı dışında kalan santral (HES, konumsuz, veri yok, kayıtta olmayan) */
  uncovered: number;
  plantCount: number;
}

export interface PortfolioProduction {
  date: string;
  projects: ProjectProduction[];
  total: { hours: number[] | null; mwh: number };
  /** Hangi kayıtlar vardı */
  logs: { solar: { issuedAt: string; onTime: boolean } | null; wind: { issuedAt: string; onTime: boolean } | null };
}

export interface PlantRef {
  epiasPlantId: number | null;
  type: string;
}

/** Bir kaydın verilen santraller için saat saat toplamı; kayıt ya da eşleşen santral yoksa null */
export function sumLog(
  log: ForecastLog | null,
  ids: ReadonlySet<number>,
  total: number
): TechProduction | null {
  if (!log || total === 0) return null;
  const hours = Array<number>(H).fill(0);
  let ok = 0;
  for (const p of log.plants) {
    if (!ids.has(p.epiasPlantId) || p.status !== "ok" || !p.hours || p.hours.length !== H) continue;
    ok++;
    for (let h = 0; h < H; h++) hours[h] += p.hours[h] ?? 0;
  }
  if (ok === 0) return null;
  return {
    ok,
    total,
    mwh: hours.reduce((s, v) => s + v, 0),
    hours,
    issuedAt: log.issuedAt,
    onTime: log.onTime,
  };
}

const addHours = (a: number[] | null, b: number[] | null) =>
  a && b ? a.map((v, h) => v + b[h]) : (a ?? b);

/** Bir projenin santralleri için saf özet (testli) */
export function summarizeProject(
  projectId: string,
  name: string,
  plants: PlantRef[],
  solarLog: ForecastLog | null,
  windLog: ForecastLog | null
): ProjectProduction {
  const idsOf = (type: string) =>
    new Set(plants.filter((p) => p.type === type && p.epiasPlantId !== null).map((p) => p.epiasPlantId as number));
  const gesIds = idsOf("GES");
  const resIds = idsOf("RES");
  const gesTotal = plants.filter((p) => p.type === "GES").length;
  const resTotal = plants.filter((p) => p.type === "RES").length;
  const solar = sumLog(solarLog, gesIds, gesTotal);
  const wind = sumLog(windLog, resIds, resTotal);
  const hours = addHours(solar?.hours ?? null, wind?.hours ?? null);
  const covered = (solar?.ok ?? 0) + (wind?.ok ?? 0);
  return {
    projectId,
    name,
    solar,
    wind,
    hours,
    mwh: hours ? hours.reduce((s, v) => s + v, 0) : 0,
    uncovered: plants.length - covered,
    plantCount: plants.length,
  };
}

/** Portföy toplamı: aynı santral birden çok projedeyse bir kez sayılır */
export function sumPortfolio(
  allPlants: PlantRef[],
  solarLog: ForecastLog | null,
  windLog: ForecastLog | null
): { hours: number[] | null; mwh: number } {
  const uniq = (type: string) => {
    const ids = new Set(allPlants.filter((p) => p.type === type && p.epiasPlantId !== null).map((p) => p.epiasPlantId as number));
    return ids;
  };
  const g = uniq("GES");
  const r = uniq("RES");
  const hours = addHours(sumLog(solarLog, g, g.size)?.hours ?? null, sumLog(windLog, r, r.size)?.hours ?? null);
  return { hours, mwh: hours ? hours.reduce((s, v) => s + v, 0) : 0 };
}

export async function loadPortfolioForecast(date: string): Promise<PortfolioProduction> {
  const [projects, solarLog, windLog] = await Promise.all([
    prisma.project.findMany({
      select: { id: true, name: true, plants: { select: { epiasPlantId: true, type: true } } },
      orderBy: { createdAt: "desc" },
    }),
    readForecastLog(date, "solar").catch(() => null),
    readForecastLog(date, "wind").catch(() => null),
  ]);
  const list = projects.map((p) => summarizeProject(p.id, p.name, p.plants, solarLog, windLog));
  return {
    date,
    projects: list,
    total: sumPortfolio(projects.flatMap((p) => p.plants), solarLog, windLog),
    logs: {
      solar: solarLog ? { issuedAt: solarLog.issuedAt, onTime: solarLog.onTime } : null,
      wind: windLog ? { issuedAt: windLog.issuedAt, onTime: windLog.onTime } : null,
    },
  };
}
