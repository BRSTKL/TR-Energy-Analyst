/**
 * TR-Energy Analyst - Sistem yönünü ne belirledi? Veri toplama (hesap lib/analysis/system-drivers.ts'te)
 *
 * Havuzdaki sistem geneli serileri (data/pool/system/<yıl>.json.gz; scripts/system-sync.mts) ile MarketData'daki
 * doğrulanmış sistem yönü saat saat birleştirilir. Yalnız bütün kaynakların KGÜP'ü ve UEVM'si, yük tahmini, tüketim ve
 * yönün birlikte olduğu saatler kullanılır (UEVM ay bitince yayımlandığı için genellikle son tam aya kadar).
 *
 * Tüketim sapması: lib/analysis/system-drivers.ts systemYearHours (gerçek zamanlı tüketim, ayın ortanca farkı çıkarılmış;
 * UEÇM ve ham seviye denendi, gerekçe orada).
 */

import { prisma } from "@/lib/prisma";
import {
  hourOfDayDrivers,
  monthlyDrivers,
  planGapDays,
  summarizeDrivers,
  systemYearHours,
  type DriverHour,
  type DriverSummary,
  type HourOfDayDrivers,
  type MonthDrivers,
} from "@/lib/analysis/system-drivers";
import type { SystemYear } from "@/lib/pool/system-codec";
import { readSystemYear } from "@/lib/pool/system-store";
import { loadSectorCurtailment } from "@/lib/services/sector-curtailment";
import type { HourlyLossFile } from "@/lib/analysis/hourly-loss";
import fs from "node:fs";
import path from "node:path";

export type CurtailmentVariant = "none" | "long" | "long+short";

/** Karnedeki lisanslı santrallerin saatlik plansız kaybı (kayıp betikleri yazar); dosya yoksa null */
function readHourlyLoss(tech: "RES" | "GES" | "HES"): HourlyLossFile | null {
  const f = path.join(process.cwd(), ".cache", "epias", `sector-loss-hourly-${tech}.json`);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as HourlyLossFile) : null;
}

/** Fazla saatlerde teslim edilen YAT bu kat olağan ayı (bütün ayların ortancası) aşarsa ay kısıntı uyarısı alır */
export const CURTAILMENT_FLAG_RATIO = 2;

export interface SystemDriversYear {
  year: number;
  months: MonthDrivers[];
  total: DriverSummary;
  hourOfDay: HourOfDayDrivers[];
  /**
   * Bir önceki yılla kıyas: iki yılda da verisi olan aylar ("01".."12"), bu yılın ve önceki yılın o aylardaki özeti.
   * Önceki yılda ortak ay yoksa null.
   */
  comparison: { months: string[]; current: DriverSummary; previous: DriverSummary } | null;
  /** Planı eksik kayıtlı olduğu için dışarıda bırakılan günler (lib/analysis/system-drivers.ts: planGapDays) */
  excludedDays: Array<{ day: string; sources: string[] }>;
  /**
   * Yüksek kısıntılı aylar: fazla saatlerde teslim edilen YAT olağanın CURTAILMENT_FLAG_RATIO katını aşan aylar. Rüzgâr ve
   * güneş sapmasına karnedeki lisanslı santrallerin ölçülen plansız kaybı geri eklenir (`curtailedMw`, fazla saatlerde
   * ortalama); planlı kayıp (ilk KGÜP'te önceden düşürülen) zaten plandadır, sapma yaratmaz (`*PlannedPct`: kaybın planlı
   * payı). Kaynak türüne göre talimat açık veride yok.
   */
  curtailmentFlags: Array<{
    month: string;
    yatMw: number;
    curtailedMw: number;
    windLossPct: number | null;
    solarLossPct: number | null;
    windPlannedPct: number | null;
    solarPlannedPct: number | null;
  }>;
}

export interface SystemDrivers {
  years: SystemDriversYear[];
  /** Kullanılan son saat (duvar saati, "YYYY-AA-GG SS:00") */
  dataThrough: string | null;
}

const monthOf = (t: number) => new Date(t).toISOString().slice(5, 7);

export async function loadSystemDrivers(
  years: number[] = [2025, 2026],
  { curtailment = "long" }: { curtailment?: CurtailmentVariant } = {}
): Promise<SystemDrivers> {
  const lossFiles = curtailment === "none" ? null : { wind: readHourlyLoss("RES"), sun: readHourlyLoss("GES"), river: readHourlyLoss("HES") };
  const lossOf = (f: HourlyLossFile | null | undefined, year: number) => {
    const y = f?.years[String(year)];
    if (!y) return undefined;
    return curtailment === "long+short" ? y.long.map((v, i) => v + (y.short[i] ?? 0)) : y.long;
  };
  const docs = (await Promise.all(years.map(readSystemYear))).filter((d): d is SystemYear => d !== null);
  if (!docs.length) return { years: [], dataThrough: null };
  const rows = await prisma.marketData.findMany({
    where: {
      source: "EPIAS",
      timestamp: { gte: new Date(Date.UTC(Math.min(...docs.map((d) => d.year)), 0, 1)), lt: new Date(Date.UTC(Math.max(...docs.map((d) => d.year)) + 1, 0, 1)) },
    },
    select: { timestamp: true, systemDirection: true },
  });
  const directions = new Map<number, "DEFICIT" | "SURPLUS">();
  for (const r of rows) if (r.systemDirection === "DEFICIT" || r.systemDirection === "SURPLUS") directions.set(r.timestamp.getTime(), r.systemDirection);

  const perYear = new Map<number, DriverHour[]>();
  const gapsByYear = new Map<number, Array<{ day: string; sources: string[] }>>();
  let last = 0;
  for (const doc of docs) {
    const gaps = planGapDays(doc);
    const hours = systemYearHours(
      doc,
      directions,
      gaps,
      lossFiles ? { wind: lossOf(lossFiles.wind, doc.year), sun: lossOf(lossFiles.sun, doc.year), river: lossOf(lossFiles.river, doc.year) } : undefined
    );
    if (!hours.length) continue;
    perYear.set(doc.year, hours);
    gapsByYear.set(
      doc.year,
      Array.from(gaps.entries())
        .sort()
        .map(([day, sources]) => ({ day, sources }))
    );
    last = Math.max(last, hours[hours.length - 1].t);
  }

  // Kısıntı uyarısı eşiği: bütün yılların aylarında fazla saatlerdeki ortalama YAT'ın ortancası
  const allMonths = Array.from(perYear.values()).flatMap((hours) => monthlyDrivers(hours));
  const yats = allMonths.map((m) => m.surplus.instructed?.down).filter((v): v is number => v != null).sort((a, b) => a - b);
  const medianYat = yats.length ? (yats[(yats.length - 1) >> 1] + yats[yats.length >> 1]) / 2 : null;
  const lossPct = (tech: "RES" | "GES") => {
    const map = new Map<string, { pct: number; plannedPct: number | null }>();
    for (const y of loadSectorCurtailment(tech)?.years ?? [])
      for (const m of y.monthly.all) {
        const lost = m.plannedLossMwh + m.unplannedLossMwh;
        map.set(m.month, { pct: m.lossPct, plannedPct: lost > 0 ? (m.plannedLossMwh / lost) * 100 : null });
      }
    return map;
  };
  const windLoss = lossPct("RES");
  const solarLoss = lossPct("GES");

  const out: SystemDriversYear[] = [];
  for (const [year, hours] of Array.from(perYear.entries()).sort((a, b) => b[0] - a[0])) {
    const months = monthlyDrivers(hours);
    const prev = perYear.get(year - 1);
    const prevMonths = new Set(prev?.map((h) => monthOf(h.t)));
    const common = months.map((m) => m.month.slice(5)).filter((m) => prevMonths.has(m));
    const inCommon = (h: DriverHour) => common.includes(monthOf(h.t));
    out.push({
      year,
      months,
      total: summarizeDrivers(hours),
      hourOfDay: hourOfDayDrivers(hours),
      comparison: prev && common.length ? { months: common, current: summarizeDrivers(hours.filter(inCommon)), previous: summarizeDrivers(prev.filter(inCommon)) } : null,
      excludedDays: gapsByYear.get(year) ?? [],
      curtailmentFlags:
        medianYat === null
          ? []
          : months
              .filter((m) => (m.surplus.instructed?.down ?? 0) > CURTAILMENT_FLAG_RATIO * medianYat)
              .map((m) => ({
                month: m.month,
                yatMw: m.surplus.instructed!.down,
                curtailedMw: m.surplus.curtailed.wind + m.surplus.curtailed.sun + m.surplus.curtailed.river,
                windLossPct: windLoss.get(m.month)?.pct ?? null,
                solarLossPct: solarLoss.get(m.month)?.pct ?? null,
                windPlannedPct: windLoss.get(m.month)?.plannedPct ?? null,
                solarPlannedPct: solarLoss.get(m.month)?.plannedPct ?? null,
              })),
    });
  }
  return { years: out, dataThrough: last ? new Date(last).toISOString().slice(0, 13).replace("T", " ") + ":00" : null };
}
