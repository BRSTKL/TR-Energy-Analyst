/**
 * TR-Energy Analyst - Santral kayıp üretimi (PLAN 20.3; proje "Üretim tahmini" sayfası)
 *
 * Uydu ışınımıyla (gerçekleşen, SARAH3) santralin üretebileceği ile ürettiği arasındaki fark: lib/forecast/curtailment.ts
 * (`detectLostHours` devreye alma süzgeciyle, `monthlyLoss`). Santralin bütün dönemi bir kez hesaplanır ve bellekte
 * tutulur (havuz dosyaları değişince ya da 10 dakika sonra yeniden). Açık referans sıralaması Aşama 15 geriye dönük
 * testinin çıktısından (`.cache/forecast/solar-backtest.json`; iyileştirme iddiası değildir).
 */

import fs from "node:fs";
import path from "node:path";
import { detectLostHours, monthlyLoss, type LossInput, type LossKind, type MonthlyLoss } from "@/lib/forecast/curtailment";
import type { SolarSite } from "@/lib/forecast/production-model";
import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { readSatelliteYear } from "@/lib/weather/weather-store";
import type { WeatherDay } from "@/lib/services/weather-preview";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TTL_MS = 10 * 60_000;

export type HourLossState = LossKind | "normal" | "none";

export interface PlantLoss {
  epiasPlantId: number;
  mount: string;
  /** Devreye alma bitişi (öncesi kayıp sayılmaz; duvar saati gün başı ISO) */
  steadyFrom: string | null;
  months: MonthlyLoss[];
  /** Devreye alma dışındaki son 12 ay */
  last12: { from: string; to: string; actualMwh: number; plannedLossMwh: number; unplannedLossMwh: number; lossPct: number; plannedValueTl: number; unplannedValueTl: number } | null;
}

interface Cached {
  at: number;
  loss: PlantLoss;
  /** Saat → uydu GHI, beklenen üretim, durum */
  hours: Map<number, { sat: number | null; expected: number | null; state: HourLossState }>;
}

const cache = new Map<number, Cached>();

/**
 * Kayıp hesabının girdisi (hava tahmini gerekmez): havuzdaki UEVM ve ilk KGÜP, uydu ışınımı, PTF; [from, to) duvar
 * saati. Konum ya da uydu verisi yoksa null. `ptf` verilirse veritabanına gidilmez (sektör taramasında tek okuma).
 */
export async function lossInputs(epiasPlantId: number, from: number, to: number, ptf?: Map<number, number>): Promise<{ site: SolarSite; hours: LossInput[] } | null> {
  const loc = (await readPoolPlantInfo(epiasPlantId))?.location;
  if (!loc) return null;
  const prices =
    ptf ??
    new Map((await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(from), lt: new Date(to) } }, select: { timestamp: true, ptf: true } })).map((r) => [r.timestamp.getTime(), r.ptf]));
  const hours: LossInput[] = [];
  let anySat = false;
  for (let y = new Date(from).getUTCFullYear(); y <= new Date(to - 1).getUTCFullYear(); y++) {
    const [p, sat] = await Promise.all([readPoolYear(epiasPlantId, y), readSatelliteYear(epiasPlantId, y)]);
    if (!p || !sat) continue;
    anySat = true;
    const start = Date.parse(p.start);
    const s0 = Date.parse(sat.start);
    for (let i = 0; i < p.uevm.length; i++) {
      const t = start + i * HOUR;
      if (t < from || t >= to) continue;
      const k = (t - s0) / HOUR;
      hours.push({ t, uevm: p.uevm[i], kgupFirst: p.kgupFirst[i], ptf: prices.get(t) ?? null, satGhi: sat.ghi[k] ?? null, satDirect: sat.direct[k] ?? null, satDiffuse: sat.diffuse[k] ?? null });
    }
  }
  return anySat ? { site: { latitude: loc.latitude, longitude: loc.longitude }, hours } : null;
}

async function compute(epiasPlantId: number): Promise<Cached | null> {
  const now = new Date();
  const data = await lossInputs(epiasPlantId, Date.UTC(2024, 2, 8), Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  if (!data) return null;
  const inputs = data.hours;
  if (!inputs.some((h) => h.satGhi !== null)) return null;
  const r = detectLostHours(inputs, data.site, { commissioning: true });
  const months = monthlyLoss(inputs, r);
  const steady = months.filter((m) => !m.commissioning && m.actualMwh > 0);
  const tail = steady.slice(-12);
  const sum = (f: (m: MonthlyLoss) => number) => tail.reduce((a, m) => a + f(m), 0);
  const actual = sum((m) => m.actualMwh);
  const planned = sum((m) => m.plannedLossMwh);
  const unplanned = sum((m) => m.unplannedLossMwh);
  const hours = new Map<number, { sat: number | null; expected: number | null; state: HourLossState }>();
  for (const h of inputs) {
    const kind = r.lost.get(h.t);
    const exp = r.expected.get(h.t) ?? null;
    const state: HourLossState = kind ?? (exp !== null ? "normal" : "none");
    hours.set(h.t, { sat: h.satGhi, expected: exp, state });
  }
  return {
    at: Date.now(),
    hours,
    loss: {
      epiasPlantId,
      mount: r.mount,
      steadyFrom: r.steadyFrom !== null ? new Date(r.steadyFrom).toISOString().slice(0, 10) : null,
      months,
      last12: tail.length
        ? {
            from: tail[0].month,
            to: tail[tail.length - 1].month,
            actualMwh: actual,
            plannedLossMwh: planned,
            unplannedLossMwh: unplanned,
            lossPct: actual + planned + unplanned > 0 ? ((planned + unplanned) / (actual + planned + unplanned)) * 100 : 0,
            plannedValueTl: sum((m) => m.plannedValueTl),
            unplannedValueTl: sum((m) => m.unplannedValueTl),
          }
        : null,
    },
  };
}

async function cached(epiasPlantId: number): Promise<Cached | null> {
  const c = cache.get(epiasPlantId);
  if (c && Date.now() - c.at < TTL_MS) return c;
  const fresh = await compute(epiasPlantId);
  if (fresh) cache.set(epiasPlantId, fresh);
  return fresh;
}

export async function plantLoss(epiasPlantId: number): Promise<PlantLoss | null> {
  return (await cached(epiasPlantId))?.loss ?? null;
}

/** Ayın takvimi: gün × saat durumu (yalnız 05–20 arası saatler gösterilir; kalan "none") */
export async function lossCalendar(epiasPlantId: number, month: string): Promise<Array<{ date: string; hours: HourLossState[] }>> {
  const c = await cached(epiasPlantId);
  if (!c) return [];
  const [y, m] = month.split("-").map(Number);
  const out: Array<{ date: string; hours: HourLossState[] }> = [];
  for (let d = Date.UTC(y, m - 1, 1); d < Date.UTC(y, m, 1); d += DAY) {
    const hours = Array.from({ length: 24 }, (_, h) => c.hours.get(d + h * HOUR)?.state ?? "none");
    out.push({ date: new Date(d).toISOString().slice(0, 10), hours });
  }
  return out;
}

/** Günün saatlerine uydu ışınımı, uyduya göre beklenen üretim ve kayıp durumu ekler */
export async function withLoss(day: WeatherDay): Promise<WeatherDay> {
  const c = await cached(day.plant.epiasPlantId);
  if (!c) return day;
  const d0 = Date.parse(`${day.date}T00:00:00Z`);
  return {
    ...day,
    hours: day.hours.map((h) => {
      const x = c.hours.get(d0 + h.hour * HOUR);
      return { ...h, satGhi: x?.sat ?? null, expectedMwh: x?.expected ?? null, lossState: x?.state ?? "none" };
    }),
  };
}

export interface ReferenceRow {
  epiasPlantId: number;
  name: string;
  hours: number;
  /** Kayıp saatler hariç (adil küme), TL/MWh */
  modelTlPerMwh: number;
  kgupTlPerMwh: number;
  /** Tüm saatler, TL/MWh */
  modelAllTlPerMwh: number;
  kgupAllTlPerMwh: number;
}

/** Aşama 15 geriye dönük testinden açık referans sıralaması (sürüm 3 ile ilk KGÜP); dosya yoksa null */
export function forecastReference(epiasPlantIds: number[]): { period: { from: string; to: string }; generatedAt: string; rows: ReferenceRow[] } | null {
  const f = path.join(process.cwd(), ".cache", "forecast", "solar-backtest.json");
  if (!fs.existsSync(f)) return null;
  const doc = JSON.parse(fs.readFileSync(f, "utf8"));
  const unit = (x: { totalTl: number; uevmMwh: number } | undefined) => (x && x.uevmMwh > 0 ? x.totalTl / x.uevmMwh : NaN);
  const rows: ReferenceRow[] = (doc.plants ?? [])
    .filter((p: any) => epiasPlantIds.includes(p.id) && p.sets?.exLoss?.["sürüm 3"])
    .map((p: any) => ({
      epiasPlantId: p.id,
      name: p.name,
      hours: p.sets.exLoss["ilk KGÜP"].hours,
      modelTlPerMwh: unit(p.sets.exLoss["sürüm 3"]),
      kgupTlPerMwh: unit(p.sets.exLoss["ilk KGÜP"]),
      modelAllTlPerMwh: unit(p.sets.all["sürüm 3"]),
      kgupAllTlPerMwh: unit(p.sets.all["ilk KGÜP"]),
    }));
  return { period: doc.period, generatedAt: doc.generatedAt, rows };
}
