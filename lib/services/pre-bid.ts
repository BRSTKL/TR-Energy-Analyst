/**
 * TR-Energy Analyst - Teklif öncesi görünüm: veri toplama (hesap lib/analysis/pre-bid.ts; ÖNİZLEME)
 *
 * Girdiler: veri tabanından doğrulanmış PTF (son ~150 gün), veri havuzundan yük tahmini, gerçek zamanlı rüzgâr ve KGÜP güneşi, EPİAŞ'tan
 * rüzgâr tahmini geçmişi (/renewables/data/res-generation-and-forecast, aylık parçalarla; yalnız 2026-06-01'den sonrası kullanılır) ve hedef
 * günün canlı girdileri (yük tahmini, rüzgâr tahmini; hedef yarınsa bugünün açıklanmış PTF'si dünkü artık için). Geçmiş günde deneme:
 * hedef gün geçmişse aynı hesap o günün girdileriyle yapılır ve gerçekleşen PTF ile karşılaştırılır. 5 dakika bellekte tutulur.
 */

import { daySlice } from "@/lib/analysis/daily-market";
import {
  buildPreBid,
  PREBID_FORECAST_FROM,
  type DayData,
  type PreBidView,
} from "@/lib/analysis/pre-bid";
import { hourly } from "@/lib/analysis/snapshot-report";
import type { PriceLimit } from "@/lib/analysis/price-limit";
import { prisma } from "@/lib/prisma";
import { readSystemYear } from "@/lib/pool/system-store";
import { epiasRequest } from "@/lib/services/epias-service";
import { loadPriceLimit } from "@/lib/services/daily-market";
import { trClock } from "@/lib/services/live-day";

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 150;
const TTL_MS = 5 * 60_000;
const FORECAST_TTL_MS = 6 * 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const shift = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS);
const full = (a: Array<number | null>): a is number[] =>
  a.length === 24 && a.every((v) => v !== null);

export interface PreBidMeta {
  updatedAt: string;
  earliest: string;
  latest: string;
  notes: string[];
}
export interface PreBidResult {
  view: PreBidView;
  limit: PriceLimit | null;
  meta: PreBidMeta;
}

const forecastMemo = new Map<string, { at: number; days: Map<string, number[]> }>();

/** Ay için EPİAŞ rüzgâr tahmini (gün → 24 saatlik ortalama; eksik saatli gün yok) */
async function forecastMonth(month: string): Promise<Map<string, number[]>> {
  const hit = forecastMemo.get(month);
  const ttl = month >= iso(Date.now()).slice(0, 7) ? 15 * 60_000 : FORECAST_TTL_MS;
  if (hit && Date.now() - hit.at < ttl) return hit.days;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const r = await epiasRequest<{ items?: unknown[] }>(
    "/renewables/data/res-generation-and-forecast",
    {
      startDate: `${month}-01T00:00:00+03:00`,
      endDate: `${month}-${String(last).padStart(2, "0")}T23:00:00+03:00`,
    }
  );
  const byDay = new Map<string, unknown[]>();
  for (const it of (r.items ?? []) as Array<Record<string, unknown>>) {
    const d = typeof it.time === "string" ? it.time.slice(0, 10) : null;
    if (!d) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(it);
  }
  const days = new Map<string, number[]>();
  for (const [d, list] of Array.from(byDay)) {
    const h = hourly(list, "forecast", "time");
    if (full(h)) days.set(d, h);
  }
  forecastMemo.set(month, { at: Date.now(), days });
  return days;
}

async function forecastDays(from: string, to: string): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  const first = from < PREBID_FORECAST_FROM ? PREBID_FORECAST_FROM : from;
  for (
    let m = first.slice(0, 7);
    m <= to.slice(0, 7);
    m = shift(`${m}-01`, 32).slice(0, 7)
  ) {
    for (const [d, v] of Array.from(await forecastMonth(m)))
      if (d >= first && d <= to) out.set(d, v);
  }
  return out;
}

/** Bir günün (EPİAŞ) PTF, yük tahmini ve rüzgâr tahmini: hedef yarın / bugün ise canlı */
async function liveDay(date: string) {
  const q = { startDate: `${date}T00:00:00+03:00`, endDate: `${date}T23:00:00+03:00` };
  const get = async (path: string) =>
    ((await epiasRequest<{ items?: Array<Record<string, unknown>> }>(path, q)).items ??
      []) as Array<Record<string, unknown>>;
  const [mcp, lep, wf] = await Promise.all([
    get("/markets/dam/data/mcp").catch(() => []),
    get("/consumption/data/load-estimation-plan").catch(() => []),
    get("/renewables/data/res-generation-and-forecast").catch(() => []),
  ]);
  const toSeries = (
    list: Array<Record<string, unknown>>,
    field: string,
    timeField: string
  ) => {
    const s = Array<number | null>(24).fill(null);
    for (const it of list) {
      const h =
        typeof it[timeField] === "string"
          ? Number((it[timeField] as string).slice(11, 13))
          : NaN;
      const v = it[field];
      if (h >= 0 && h < 24 && typeof v === "number" && s[h] === null) s[h] = v;
    }
    return s;
  };
  const w = hourly(wf, "forecast", "time");
  return {
    ptf: toSeries(mcp, "price", "date"),
    lep: toSeries(lep, "lep", "date"),
    windF: w,
  };
}

const memo = new Map<string, { at: number; value: Promise<PreBidResult> }>();

export function loadPreBid(date: string): Promise<PreBidResult> {
  const hit = memo.get(date);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = compute(date);
  memo.set(date, { at: Date.now(), value });
  value.catch(() => memo.delete(date));
  return value;
}

/** Hedef günden önceki günlerin girdileri (PTF veri tabanından; yük tahmini, rüzgâr, KGÜP güneşi havuzdan; rüzgâr tahmini EPİAŞ'tan) */
export async function loadDays(from: string, date: string) {
  const dayStart = Date.parse(`${date}T00:00:00Z`);
  // PTF (doğrulanmış) geçmişi
  const rows = await prisma.marketData.findMany({
    where: {
      source: { in: ["EPIAS", "FILE"] },
      timestamp: {
        gte: new Date(Date.parse(`${from}T00:00:00Z`)),
        lt: new Date(dayStart + DAY_MS),
      },
    },
    select: { timestamp: true, ptf: true },
  });
  const ptfByDay = new Map<string, Array<number | null>>();
  for (const r of rows) {
    const d = iso(r.timestamp.getTime());
    if (!ptfByDay.has(d)) ptfByDay.set(d, Array(24).fill(null));
    ptfByDay.get(d)![r.timestamp.getUTCHours()] = r.ptf;
  }

  // Havuz: yük tahmini, gerçek zamanlı rüzgâr, KGÜP güneşi
  const docs = new Map<number, Awaited<ReturnType<typeof readSystemYear>>>();
  for (let y = Number(from.slice(0, 4)); y <= Number(date.slice(0, 4)); y++)
    docs.set(y, await readSystemYear(y));
  const slice = (
    series: ReadonlyArray<number | null> | undefined,
    doc: { start: string },
    d: string
  ) =>
    series
      ? daySlice(
          series,
          (Date.parse(`${d}T00:00:00Z`) - Date.parse(doc.start)) / 3_600_000
        )
      : null;

  const forecasts = await forecastDays(from, shift(date, -1));
  const days = new Map<string, DayData>();
  for (let d = from; d < date; d = shift(d, 1)) {
    const doc = docs.get(Number(d.slice(0, 4)));
    const p = ptfByDay.get(d);
    const lep = doc ? slice(doc.lep, doc, d) : null;
    const wind = doc ? slice(doc.rt?.wind, doc, d) : null;
    const sunK = doc ? slice(doc.kgup?.sun, doc, d) : null;
    days.set(d, {
      ptf: p && full(p) ? p : null,
      lep: lep && full(lep) ? lep : null,
      wind: wind && full(wind) ? wind : null,
      sunK: sunK && full(sunK) ? sunK : null,
      windF: forecasts.get(d) ?? null,
    });
  }
  return { days, docs, ptfByDay, slice };
}

async function compute(date: string): Promise<PreBidResult> {
  const { today, tomorrow } = trClock();
  const earliest = shift(PREBID_FORECAST_FROM, 14);
  const notes: string[] = [];
  const from = shift(date, -HISTORY_DAYS);

  const { days, docs, ptfByDay, slice } = await loadDays(from, date);

  // Hedef günün girdileri
  let targetLep: number[] | null = null;
  let targetWindF: number[] | null = null;
  let actual: number[] | null = null;
  let prevPtf: number[] | null = days.get(shift(date, -1))?.ptf ?? null;
  if (date >= today) {
    const live = await liveDay(date);
    targetLep = full(live.lep) ? live.lep : null;
    targetWindF = full(live.windF) ? live.windF : null;
    if (!prevPtf && shift(date, -1) === today) {
      const t = await liveDay(today);
      prevPtf = full(t.ptf) ? t.ptf : null;
      if (!prevPtf) notes.push("Bugünün PTF'si alınamadı; dünkü artık hesaplanamaz.");
    }
  } else {
    const doc = docs.get(Number(date.slice(0, 4)));
    const lep = doc ? slice(doc.lep, doc, date) : null;
    targetLep = lep && full(lep) ? lep : null;
    targetWindF = (await forecastDays(date, date)).get(date) ?? null;
    const a = ptfByDay.get(date);
    actual = a && full(a) ? a : null;
  }

  const limit = await loadPriceLimit();
  const view = buildPreBid({
    date,
    days,
    target: { lep: targetLep, windF: targetWindF },
    prevPtf,
    limit,
    actual,
  });
  return {
    view,
    limit,
    meta: { updatedAt: new Date().toISOString(), earliest, latest: tomorrow, notes },
  };
}

export const isPreBidDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
  iso(Date.parse(`${date}T00:00:00Z`)) === date;
