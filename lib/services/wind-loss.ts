/**
 * TR-Energy Analyst - Rüzgâr santrali kayıp üretimi (proje "Kayıp üretim" sayfası; kullanıcı kararı 17.10.2026)
 *
 * Geçmiş rüzgârla (lib/weather/reanalysis-wind.ts) santralin üretebileceği ile ürettiği arasındaki fark,
 * lib/forecast/wind-loss.ts `detectWindLoss` iki kaynakla ayrı ayrı. Güneşten temkinli (8 santrallik pilot: plansız kayıp
 * saatleri iki kaynakta yalnız %30–60 örtüşüyor, planlı saatler %53–84):
 *   - Ana kaynak ECMWF IFS 9 km (pilotta üretimle daha iyi uyuşan); beklenen üretim ve PLANLI kayıp (şirketin ilk KGÜP'ü
 *     beklenenin %10'unun altında) bundan.
 *   - PLANSIZ kayıp yalnız iki kaynağın (IFS ve ERA5) birlikte bulduğu, en az WIND_MIN_EVENT_HOURS saat kesintisiz süren
 *     olaylarda: alt sınır ("olası arıza"); her olay EPİAŞ arıza / bakım bildirimleriyle karşılaştırılır.
 *   - Kayıpsız günlerde günlük beklenen ↔ gerçekleşen korelasyonu WIND_MIN_DAILY_R'nin altındaysa santral gösterilmez.
 * Kurulu güç santral kaydından (CLAUDE.md "Kurulu güç"); devreye alma: günlük tepe üretim ilk kez dönemin en yüksek
 * saatlik üretiminin %60'ına ulaştığı güne kadar kayıp sayılmaz. Sonuç bellekte 10 dakika (dosyalar değişirse de).
 */

import { monthlyLoss, type LossKind, type MonthlyLoss } from "@/lib/forecast/curtailment";
import { detectWindLoss, hourMeanWind, LOSS_EXPECTED_MIN, WIND_MIN_DAILY_R, type WindLossInput } from "@/lib/forecast/wind-loss";
import type { NoticeCause } from "@/lib/analysis/outage-validation";
import { formatLocation } from "@/lib/epias-plant/location";
import { prisma } from "@/lib/prisma";
import { readPoolYear } from "@/lib/pool/pool-store";
import { loadOutageNotices } from "@/lib/services/outage-notices";
import { plantLocation } from "@/lib/services/weather-preview";
import { WIND_FIRST_YEAR, WIND_MODEL_LABEL, type WindModel } from "@/lib/weather/reanalysis-wind";
import { readWindYear } from "@/lib/weather/weather-store";
import type { HourLossState } from "@/lib/services/production-loss";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TTL_MS = 10 * 60_000;
export const WIND_MIN_EVENT_HOURS = 6;
export const WIND_PRIMARY: WindModel = "ecmwf_ifs";
export const WIND_SECONDARY: WindModel = "era5";
const COMMISSIONING_SHARE = 0.6;

export interface ProjectWindPlant {
  epiasPlantId: number | null;
  name: string;
  organizationName: string | null;
  capacityMw: number;
  capacitySource: string | null;
  locationText: string;
  locationSource: string | null;
  /** İki kaynakta da rüzgâr verisi olan yıllar */
  windYears: number[];
}

export interface WindEvent {
  /** Olayın ilk saati ve saat sayısı (duvar saati ISO) */
  start: string;
  hours: number;
  lostMwh: number;
  /** Olayla çakışan EPİAŞ bildiriminin nedeni; bildirim yoksa null; bildirim verisi o dönemi kapsamıyorsa "uncovered" */
  notice: NoticeCause | null | "uncovered";
}

export interface WindPlantLoss {
  epiasPlantId: number;
  capacityMw: number;
  steadyFrom: string | null;
  /** Kalite: kayıpsız tam günlerde günlük korelasyon (ana / ikinci kaynak) ve gün sayısı */
  dailyR: number | null;
  dailyRSecondary: number | null;
  days: number;
  /** Kalite eşiğini geçti mi (geçmezse ekranda rakam gösterilmez) */
  reliable: boolean;
  months: MonthlyLoss[];
  last12: { from: string; to: string; actualMwh: number; plannedLossMwh: number; unplannedLossMwh: number; lossPct: number; plannedValueTl: number; unplannedValueTl: number } | null;
  events: WindEvent[];
  /** Bildirim verisinin kapsamı ("2024-01 – 2026-09") ya da null */
  noticeCoverage: string | null;
  /** Ana kaynağın plansız bulduğu ama sayılmayan (ikinci kaynak bulmadı ya da 6 saatten kısa) kayıp, MWh (bilgi için) */
  excludedUnplannedMwh: number;
  /**
   * İki kaynağın anlaşması (ana kaynağın saatlerinden, ikinci kaynakta da aynı türde olanların payı): planlı saatler,
   * plansız saatler, ana kaynağın en az 6 saatlik plansız olaylarının saatleri. Saat yoksa null.
   */
  agreement: { planned: number | null; unplannedHours: number | null; longEventHours: number | null };
  /** Kurulu gücün kaynağı (CLAUDE.md "Kurulu güç"; PEAK_ESTIMATE alt sınır) */
  capacitySource: string | null;
}

export interface WindDayHour {
  hour: number;
  uevmMwh: number | null;
  kgupFirstMwh: number | null;
  expectedMwh: number | null;
  wsPrimary: number | null;
  wsSecondary: number | null;
  lossState: HourLossState;
}

export interface WindDay {
  plant: { epiasPlantId: number; name: string };
  location: { text: string; source: string; ref: string };
  date: string;
  firstDate: string;
  lastDate: string;
  hours: WindDayHour[];
  totals: { uevmMwh: number; kgupFirstMwh: number };
}

interface Cached {
  at: number;
  loss: WindPlantLoss;
  hours: Map<number, { uevm: number | null; kgup: number | null; expected: number | null; ws1: number | null; ws2: number | null; state: HourLossState }>;
  firstDate: string;
  lastDate: string;
}
const cache = new Map<number, Cached>();

/** Projenin rüzgâr santralleri (ada göre), konum ve rüzgâr verisi durumuyla */
export async function projectWindPlants(projectId: string): Promise<ProjectWindPlant[] | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      plants: {
        where: { type: "RES" },
        select: { epiasPlantId: true, name: true, organizationName: true, capacityMw: true, capacitySource: true, latitude: true, longitude: true, locationSource: true, locationRef: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!project) return null;
  const out: ProjectWindPlant[] = [];
  for (const p of project.plants) {
    const loc = await plantLocation(p);
    const years: number[] = [];
    if (loc && p.epiasPlantId !== null)
      for (let y = WIND_FIRST_YEAR; y <= new Date().getUTCFullYear(); y++) {
        const [a, b] = await Promise.all([readWindYear(p.epiasPlantId, WIND_PRIMARY, y), readWindYear(p.epiasPlantId, WIND_SECONDARY, y)]);
        if (a && b) years.push(y);
      }
    out.push({
      epiasPlantId: p.epiasPlantId,
      name: p.name,
      organizationName: p.organizationName,
      capacityMw: p.capacityMw,
      capacitySource: p.capacitySource,
      locationText: loc ? formatLocation(loc) : "konum yok",
      locationSource: loc?.locationSource ?? null,
      windYears: years,
    });
  }
  return out;
}

/** Santralin saatleri: üretim, ilk KGÜP, PTF ve iki kaynağın saat ortalaması rüzgârı */
async function windInputs(epiasPlantId: number): Promise<{ hours: Array<WindLossInput & { ws2: number | null; dir2: number | null }>; } | null> {
  const thisYear = new Date().getUTCFullYear();
  const stamps: Record<WindModel, Map<number, [number | null, number | null]>> = { era5: new Map(), ecmwf_ifs: new Map() };
  let any = false;
  for (let y = WIND_FIRST_YEAR; y <= thisYear; y++)
    for (const m of [WIND_PRIMARY, WIND_SECONDARY]) {
      const d = await readWindYear(epiasPlantId, m, y);
      if (!d) continue;
      any = true;
      const s0 = Date.parse(d.start);
      d.ws.forEach((w, i) => stamps[m].set(s0 + i * HOUR, [w, d.dir[i]]));
    }
  if (!any) return null;
  const from = Date.UTC(WIND_FIRST_YEAR, 0, 1);
  const to = Date.UTC(thisYear + 1, 0, 1);
  const ptf = new Map((await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(from), lt: new Date(to) } }, select: { timestamp: true, ptf: true } })).map((r) => [r.timestamp.getTime(), r.ptf]));
  const mean = (m: WindModel, t: number) => {
    const a = stamps[m].get(t);
    const b = stamps[m].get(t + HOUR);
    return hourMeanWind(a?.[0] ?? null, b?.[0] ?? null, a?.[1] ?? null, b?.[1] ?? null);
  };
  const hours: Array<WindLossInput & { ws2: number | null; dir2: number | null }> = [];
  for (let y = WIND_FIRST_YEAR; y <= thisYear; y++) {
    const p = await readPoolYear(epiasPlantId, y);
    if (!p) continue;
    const s0 = Date.parse(p.start);
    for (let i = 0; i < p.uevm.length; i++) {
      const t = s0 + i * HOUR;
      const w1 = mean(WIND_PRIMARY, t);
      const w2 = mean(WIND_SECONDARY, t);
      const u = p.uevm[i];
      hours.push({ t, uevm: u === null ? null : Math.max(0, u), kgupFirst: p.kgupFirst[i], ptf: ptf.get(t) ?? null, ws: w1.ws, dir: w1.dir, ws2: w2.ws, dir2: w2.dir });
    }
  }
  return { hours };
}

/**
 * Devreye alma bitişi: yalnız dönemin ilk 30 günü üretimsizse (santral henüz yok; ortalama saatlik üretim dönem
 * ortalamasının %2'sinin altında) ve sonra üretim ilk kez dönemin en yüksek saatlik üretiminin %60'ına ulaştığı gün.
 * Dönem başında çalışan santralde null (rüzgârsız ilk günler devreye alma sayılmaz).
 */
function steadyStart(hours: Array<{ t: number; uevm: number | null }>): number | null {
  const valid = hours.filter((h) => h.uevm !== null);
  if (!valid.length) return null;
  const peak = Math.max(0, ...valid.map((h) => h.uevm!));
  const meanAll = valid.reduce((a, h) => a + h.uevm!, 0) / valid.length;
  const head = valid.filter((h) => h.t < valid[0].t + 30 * DAY);
  const meanHead = head.reduce((a, h) => a + h.uevm!, 0) / Math.max(1, head.length);
  if (peak <= 0 || meanHead >= 0.02 * meanAll) return null;
  const first = valid.find((h) => h.uevm! >= COMMISSIONING_SHARE * peak);
  return first ? Math.floor(first.t / DAY) * DAY : null;
}

/** Ardışık saat grupları */
function runs(ts: number[]): number[][] {
  const s = [...ts].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const t of s) {
    const last = out[out.length - 1];
    if (last && t - last[last.length - 1] <= HOUR) last.push(t);
    else out.push([t]);
  }
  return out;
}

async function compute(epiasPlantId: number, capacityMw: number, capacitySource: string | null): Promise<Cached | null> {
  const data = await windInputs(epiasPlantId);
  if (!data || capacityMw <= 0) return null;
  const all = data.hours;
  const steady = steadyStart(all);
  const primary = detectWindLoss(all, capacityMw, { steadyFrom: steady });
  const secondary = detectWindLoss(
    all.map((h) => ({ ...h, ws: h.ws2, dir: h.dir2 })),
    capacityMw,
    { steadyFrom: steady }
  );
  const lost = new Map<number, LossKind>();
  for (const [t, k] of primary.lost) if (k === "planned") lost.set(t, "planned");
  const both = Array.from(primary.lost).filter(([t, k]) => k === "unplanned" && secondary.lost.get(t) === "unplanned").map(([t]) => t);
  const byT = new Map(all.map((h) => [h.t, h]));
  const lostMwhAt = (t: number) => Math.max(0, (primary.expected.get(t) ?? 0) - (byT.get(t)?.uevm ?? 0));
  const notices = await loadOutageNotices([epiasPlantId]).catch(() => null);
  const plantNotices = notices?.byPlant.get(epiasPlantId) ?? null;
  const events: WindEvent[] = [];
  for (const run of runs(both)) {
    if (run.length < WIND_MIN_EVENT_HOURS) continue;
    for (const t of run) lost.set(t, "unplanned");
    const a = run[0];
    const b = run[run.length - 1] + HOUR;
    let notice: WindEvent["notice"] = "uncovered";
    if (notices && plantNotices && a >= notices.coveredFrom && b <= notices.coveredTo) notice = plantNotices.find((n) => n.start < b && n.end > a)?.cause ?? null;
    events.push({ start: new Date(a).toISOString().slice(0, 13), hours: run.length, lostMwh: run.reduce((s, t) => s + lostMwhAt(t), 0), notice });
  }
  const excludedUnplannedMwh = Array.from(primary.lost)
    .filter(([t, k]) => k === "unplanned" && !lost.has(t))
    .reduce((s, [t]) => s + lostMwhAt(t), 0);
  const share = (ts: number[], kind: LossKind) => (ts.length ? ts.filter((t) => secondary.lost.get(t) === kind).length / ts.length : null);
  const primaryOf = (kind: LossKind) => Array.from(primary.lost).filter(([, k]) => k === kind).map(([t]) => t);
  const agreement = {
    planned: share(primaryOf("planned"), "planned"),
    unplannedHours: share(primaryOf("unplanned"), "unplanned"),
    longEventHours: share(runs(primaryOf("unplanned")).filter((r) => r.length >= WIND_MIN_EVENT_HOURS).flat(), "unplanned"),
  };
  const months = monthlyLoss(all, { lost, expected: primary.expected, steadyFrom: steady });
  const steadyMonths = months.filter((m) => !m.commissioning && m.actualMwh > 0);
  const tail = steadyMonths.slice(-12);
  const sum = (f: (m: MonthlyLoss) => number) => tail.reduce((a, m) => a + f(m), 0);
  const actual = sum((m) => m.actualMwh);
  const planned = sum((m) => m.plannedLossMwh);
  const unplanned = sum((m) => m.unplannedLossMwh);

  const hours: Cached["hours"] = new Map();
  let firstDate = "";
  let lastDate = "";
  for (const h of all) {
    const exp = primary.expected.get(h.t) ?? null;
    const state: HourLossState = lost.get(h.t) ?? (exp !== null && exp >= LOSS_EXPECTED_MIN * capacityMw ? "normal" : "none");
    hours.set(h.t, { uevm: h.uevm, kgup: h.kgupFirst, expected: exp, ws1: h.ws, ws2: h.ws2, state });
    if (h.uevm !== null && h.ws !== null) {
      const d = new Date(h.t).toISOString().slice(0, 10);
      if (!firstDate) firstDate = d;
      lastDate = d;
    }
  }
  return {
    at: Date.now(),
    hours,
    firstDate,
    lastDate,
    loss: {
      epiasPlantId,
      capacityMw,
      steadyFrom: steady !== null && steady > Date.UTC(WIND_FIRST_YEAR, 0, 1) ? new Date(steady).toISOString().slice(0, 10) : null,
      dailyR: primary.dailyR,
      dailyRSecondary: secondary.dailyR,
      days: primary.days,
      reliable: primary.dailyR !== null && primary.dailyR >= WIND_MIN_DAILY_R,
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
      events,
      noticeCoverage: notices ? `${notices.coverage.from} – ${notices.coverage.to}` : null,
      excludedUnplannedMwh,
      agreement,
      capacitySource,
    },
  };
}

async function cached(epiasPlantId: number, capacityMw: number, capacitySource: string | null = null): Promise<Cached | null> {
  const c = cache.get(epiasPlantId);
  if (c && Date.now() - c.at < TTL_MS && c.loss.capacityMw === capacityMw) return c;
  const fresh = await compute(epiasPlantId, capacityMw, capacitySource);
  if (fresh) cache.set(epiasPlantId, fresh);
  return fresh;
}

export async function windPlantLoss(epiasPlantId: number, capacityMw: number, capacitySource: string | null = null): Promise<WindPlantLoss | null> {
  return (await cached(epiasPlantId, capacityMw, capacitySource))?.loss ?? null;
}

/** Saat → kayıp durumu (geriye dönük testte değerlendirme maskesi; bütün adaylara aynı uygulanır) */
export async function windLossStates(epiasPlantId: number, capacityMw: number, capacitySource: string | null = null): Promise<Map<number, HourLossState> | null> {
  const c = await cached(epiasPlantId, capacityMw, capacitySource);
  return c ? new Map(Array.from(c.hours, ([t, x]) => [t, x.state])) : null;
}

/** Ayın takvimi: gün × saat durumu (24 saat) */
export async function windLossCalendar(epiasPlantId: number, capacityMw: number, month: string): Promise<Array<{ date: string; hours: HourLossState[] }>> {
  const c = await cached(epiasPlantId, capacityMw);
  if (!c) return [];
  const [y, m] = month.split("-").map(Number);
  const out: Array<{ date: string; hours: HourLossState[] }> = [];
  for (let d = Date.UTC(y, m - 1, 1); d < Date.UTC(y, m, 1); d += DAY) {
    out.push({ date: new Date(d).toISOString().slice(0, 10), hours: Array.from({ length: 24 }, (_, h) => c.hours.get(d + h * HOUR)?.state ?? "none") });
  }
  return out;
}

/** Günün saatleri (gün verilmezse son gün) */
export async function windDay(plant: { epiasPlantId: number; name: string; capacityMw: number }, date?: string | null): Promise<WindDay | null> {
  const c = await cached(plant.epiasPlantId, plant.capacityMw);
  if (!c || !c.lastDate) return null;
  const day = date && date >= c.firstDate && date <= c.lastDate ? date : c.lastDate;
  const d0 = Date.parse(`${day}T00:00:00Z`);
  const hours: WindDayHour[] = Array.from({ length: 24 }, (_, h) => {
    const x = c.hours.get(d0 + h * HOUR);
    return { hour: h, uevmMwh: x?.uevm ?? null, kgupFirstMwh: x?.kgup ?? null, expectedMwh: x?.expected ?? null, wsPrimary: x?.ws1 ?? null, wsSecondary: x?.ws2 ?? null, lossState: x?.state ?? "none" };
  });
  const loc = await plantLocation({ epiasPlantId: plant.epiasPlantId, latitude: null, longitude: null, locationSource: null, locationRef: null });
  return {
    plant: { epiasPlantId: plant.epiasPlantId, name: plant.name },
    location: { text: loc ? formatLocation(loc) : "konum yok", source: loc?.locationSource ?? "", ref: loc?.locationRef ?? "" },
    date: day,
    firstDate: c.firstDate,
    lastDate: c.lastDate,
    hours,
    totals: { uevmMwh: hours.reduce((a, h) => a + (h.uevmMwh ?? 0), 0), kgupFirstMwh: hours.reduce((a, h) => a + (h.kgupFirstMwh ?? 0), 0) },
  };
}

export const WIND_SOURCE_TEXT = `${WIND_MODEL_LABEL[WIND_PRIMARY]} ana, ${WIND_MODEL_LABEL[WIND_SECONDARY]} denetim`;
