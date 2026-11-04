/**
 * TR-Energy Analyst - Santral kartı (Santral rehberi): bir santralin kayıtlı bilgisi ve gerçekleşen satış fiyatı
 *
 * Veri havuzundaki herhangi bir santral için (projede olması gerekmez):
 *   - Kimlik: ad, tür, sahip şirket, hidro alt türü (sektör karnesi / GEM / ad eki).
 *   - Kurulu güç: kaynağıyla (CLAUDE.md "Kurulu güç": YEKDEM → EPDK lisansı → en yüksek saatlik üretim). Tahmin `recorded: false`.
 *   - Konum: kaynağıyla; ilçe merkezi tahmindir.
 *   - YEKDEM durumu (lib/services/yekdem-exit.ts).
 *   - Seçilen yıl: üretim, saat kapsamı, ağırlıklı ortalama fiyat (capture), ay ay tablo, günün saatine göre dağılım,
 *     sektördeki yeri. Üretim = UEVM (gerçekleşen), fiyat = PTF; dengesizlik ve KÜPST dahil değil.
 * Hesap `lib/analysis/capture-rate.ts` ve `plant-profile.ts`'te (aynı tanım, rapordaki PPA kutusuyla). EPİAŞ'a yazmaz.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { captureStat, monthlyCapture, percentileOf, type CaptureHour, type CaptureStat } from "@/lib/analysis/capture-rate";
import { coveragePct, hourOfDayProfile, type HourOfDayRow } from "@/lib/analysis/plant-profile";
import type { YekdemExit } from "@/lib/analysis/yekdem-exit";
import { CAPACITY_SOURCE_LABEL, isRecordedCapacity } from "@/lib/epias-plant/installed-capacity";
import { formatLocation, isLocationEstimate, LOCATION_SOURCE_LABEL, type LocationSource } from "@/lib/epias-plant/location";
import { poolPlantRows } from "@/lib/pool/pool-hours";
import { poolDir, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { resolveInstalledCapacities } from "@/lib/services/installed-capacity";
import { sectorFacts } from "@/lib/services/plant-directory";
import { CAPTURE_GROUP_LABEL, loadSectorCapture } from "@/lib/services/sector-capture";
import { loadYekdemExitIndex } from "@/lib/services/yekdem-exit";

export interface PlantCard {
  id: number;
  name: string;
  type: "RES" | "HES" | "GES";
  owner: string | null;
  organizationId: number | null;
  hydroKind: "RESERVOIR" | "RUN_OF_RIVER" | null;
  hydroKindSource: "GEM" | "NAME" | "EPDK" | null;
  capacity: { mw: number; source: string; sourceLabel: string; recorded: boolean; ref: string; warning: string | null };
  location: { text: string; estimate: boolean; sourceLabel: string; ref: string } | null;
  yekdem: { exit: YekdemExit | null; inListThisYear: boolean | null; error: string | null };
  years: number[];
  year: number;
  /** Seçilen yılda veri yoksa null */
  data: {
    /** Üretim ve PTF'nin birlikte olduğu saat sayısı ve PTF'nin o yıldaki saat sayısı */
    hours: number;
    expectedHours: number;
    coveragePct: number;
    mwh: number;
    /** Kayıtlı kurulu güç varsa üretim / (MW × saat), %; tahmin kurulu güçle hesaplanmaz */
    capacityFactorPct: number | null;
    capture: CaptureStat;
    monthly: Array<{ month: string } & CaptureStat>;
    hourly: HourOfDayRow[];
    sector: { groupLabel: string; ratePct: number; percentile: number; medianPct: number; plants: number } | null;
    /** Son veri saati (duvar saati, ISO) */
    lastHour: string | null;
  } | null;
}

async function poolYears(id: number): Promise<number[]> {
  try {
    return (await fs.readdir(path.join(poolDir(), String(id))))
      .map((f) => /^(\d{4})\.json\.gz$/.exec(f)?.[1])
      .filter((y): y is string => !!y)
      .map(Number)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function sectorPosition(id: number, type: string, year: number): NonNullable<PlantCard["data"]>["sector"] {
  const y = loadSectorCapture()?.years.find((x) => x.year === year);
  if (!y) return null;
  const group = ["HES:RESERVOIR", "HES:RUN_OF_RIVER"].find((g) => y.plantRates[g]?.some((r) => r[0] === id)) ?? type;
  const list = y.plantRates[group];
  const me = list?.find((r) => r[0] === id);
  if (!list || !me) return null;
  const sorted = list.map((r) => r[1]).sort((a, b) => a - b);
  const median = y.groups.find((g) => g.key === group)?.distribution?.p50 ?? sorted[Math.floor(sorted.length / 2)];
  return { groupLabel: CAPTURE_GROUP_LABEL[group] ?? group, ratePct: me[1], percentile: percentileOf(me[1], sorted)!, medianPct: median, plants: sorted.length };
}

export async function loadPlantCard(id: number, yearParam?: number | null): Promise<PlantCard | null> {
  const info = await readPoolPlantInfo(id);
  if (!info?.name || !info.type || info.kind) return null;
  const facts = (await sectorFacts()).get(id) ?? null;
  const years = await poolYears(id);
  const year = yearParam && years.includes(yearParam) ? yearParam : years[years.length - 1] ?? new Date().getUTCFullYear();
  const period = { start: `${year}-01-01`, end: `${year}-12-31` };
  const ref = { name: info.name, type: info.type, organizationName: facts?.owner ?? null, epiasPlantId: id, kgupVersion: null };

  const rows = years.includes(year) ? await poolPlantRows({ epiasPlantId: id, kgupVersion: "FIRST" }, period.start, period.end) : [];
  const ptfRows = rows.length
    ? await prisma.marketData.findMany({
        where: { source: { in: ["EPIAS", "FILE"] }, timestamp: { gte: new Date(Date.parse(`${period.start}T00:00:00Z`)), lte: new Date(Date.parse(`${period.end}T23:00:00Z`)) } },
        select: { timestamp: true, ptf: true },
      })
    : [];
  const ptf = new Map(ptfRows.map((r) => [r.timestamp.getTime(), r.ptf]));
  const hours: CaptureHour[] = [];
  for (const r of rows) {
    const p = ptf.get(r.timestamp.getTime());
    if (p !== undefined && Number.isFinite(p) && Number.isFinite(r.actualMwh)) hours.push({ t: r.timestamp.getTime(), mwh: r.actualMwh, ptf: p });
  }

  const [cap] = (await resolveInstalledCapacities([ref], rows.length ? period : null)).matches;
  let yekdem: PlantCard["yekdem"] = { exit: null, inListThisYear: null, error: null };
  try {
    const idx = await loadYekdemExitIndex();
    const exit = idx.of({ epiasPlantId: id, name: info.name, type: info.type, organizationName: facts?.owner ?? null });
    yekdem = { exit, inListThisYear: facts?.yekdem ?? null, error: null };
  } catch (e) {
    yekdem = { exit: null, inListThisYear: facts?.yekdem ?? null, error: e instanceof Error ? e.message : "YEKDEM listesi alınamadı" };
  }

  const loc = info.location;
  const mwh = hours.reduce((s, h) => s + h.mwh, 0);
  const recorded = isRecordedCapacity(cap.source);
  const lastT = hours.length ? Math.max(...hours.map((h) => h.t)) : null;
  return {
    id,
    name: info.name,
    type: info.type,
    owner: facts?.owner ?? null,
    organizationId: facts?.organizationId ?? null,
    hydroKind: facts?.hydroKind ?? null,
    hydroKindSource: facts?.hydroKindSource ?? null,
    capacity: {
      mw: cap.mw,
      source: cap.source,
      sourceLabel: CAPACITY_SOURCE_LABEL[cap.source],
      recorded,
      ref: cap.ref,
      warning: cap.warning ?? null,
    },
    location: loc
      ? {
          text: formatLocation(loc),
          estimate: isLocationEstimate(loc.locationSource),
          sourceLabel: LOCATION_SOURCE_LABEL[loc.locationSource as LocationSource] ?? loc.locationSource,
          ref: loc.locationRef,
        }
      : null,
    yekdem,
    years,
    year,
    data: hours.length
      ? {
          hours: hours.length,
          expectedHours: ptf.size,
          coveragePct: coveragePct(hours.length, ptf.size),
          mwh,
          capacityFactorPct: recorded && cap.mw > 0 ? (mwh / (cap.mw * hours.length)) * 100 : null,
          capture: captureStat(hours),
          monthly: monthlyCapture(hours),
          hourly: hourOfDayProfile(hours),
          sector: sectorPosition(id, info.type, year),
          lastHour: lastT === null ? null : new Date(lastT).toISOString().slice(0, 13) + ":00",
        }
      : null,
  };
}
