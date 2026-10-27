/**
 * TR-Energy Analyst - Teklif öncesi görünüm: yeni verilerin etkisi, veri toplama (hesap lib/analysis/pre-bid-effects.ts; ÖNİZLEME)
 *
 * Gün girdileri pre-bid.ts ile aynı (loadDays). Ek: doğal gaz GRF günlük serisi (natural-gas-service), lisanssız güneş
 * (/renewables/data/unlicensed-generation-amount; yaklaşık 4 hafta gecikmeli, son günler boş) ile gerçek zamanlı güneşin toplamı.
 * Hesap ağır olmadığı için sonuç 6 saat bellekte tutulur.
 */

import { measureEffects, type EffectRow } from "@/lib/analysis/pre-bid-effects";
import { PREBID_FORECAST_FROM, PREBID_TRAIN_DAYS } from "@/lib/analysis/pre-bid";
import { energyOccupancyByDay } from "@/lib/analysis/dsi-dam";
import { hourly } from "@/lib/analysis/snapshot-report";
import { neighborFeatures } from "@/lib/analysis/neighbors";
import { readDsiDam } from "@/lib/pool/dsi-dam-store";
import { readEntsoe } from "@/lib/pool/entsoe-store";
import { epiasRequest, GAS_API_BASE } from "@/lib/services/epias-service";
import { loadDays } from "@/lib/services/pre-bid";
import { trClock } from "@/lib/services/live-day";

const DAY_MS = 86_400_000;
const TTL_MS = 6 * 3_600_000;
const shift = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const full = (a: Array<number | null>): a is number[] =>
  a.length === 24 && a.every((v) => v !== null);

export interface PreBidEffects {
  rows: EffectRow[];
  updatedAt: string;
  /** Lisanssız güneşin son dolu günü (üst sınır ölçümü buraya kadar) */
  unlicensedUntil: string | null;
  notes: string[];
}

async function gasSeries(from: string, to: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let a = from; a <= to; a = shift(a, 60)) {
    const b = shift(a, 59) < to ? shift(a, 59) : to;
    const r = await epiasRequest<{ items?: Array<Record<string, unknown>> }>(
      "/markets/sgp/data/daily-reference-price",
      { startDate: `${a}T00:00:00+03:00`, endDate: `${b}T00:00:00+03:00` },
      GAS_API_BASE
    );
    for (const it of r.items ?? [])
      if (typeof it.grfTl === "number") out.set(String(it.date).slice(0, 10), it.grfTl);
  }
  return out;
}

async function unlicensedSun(from: string, to: string): Promise<Map<string, number[]>> {
  const byDay = new Map<string, unknown[]>();
  for (let a = from; a <= to; a = shift(a, 30)) {
    const b = shift(a, 29) < to ? shift(a, 29) : to;
    const r = await epiasRequest<{ items?: unknown[] }>(
      "/renewables/data/unlicensed-generation-amount",
      { startDate: `${a}T00:00:00+03:00`, endDate: `${b}T23:00:00+03:00` }
    );
    for (const it of (r.items ?? []) as Array<Record<string, unknown>>) {
      const d = typeof it.time === "string" ? it.time.slice(0, 10) : null;
      if (!d) continue;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(it);
    }
  }
  const out = new Map<string, number[]>();
  for (const [d, list] of Array.from(byDay)) {
    const h = hourly(list, "gunes", "time");
    if (full(h)) out.set(d, h);
  }
  return out;
}

let memo: { at: number; value: Promise<PreBidEffects> } | null = null;

export function loadPreBidEffects(): Promise<PreBidEffects> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;
  const value = compute();
  memo = { at: Date.now(), value };
  value.catch(() => (memo = null));
  return value;
}

async function compute(): Promise<PreBidEffects> {
  const { today } = trClock();
  const from = shift(PREBID_FORECAST_FROM, -PREBID_TRAIN_DAYS - 28);
  const last = shift(today, -1);
  const notes: string[] = [];
  const [{ days, docs, slice }, gas, unl] = await Promise.all([
    loadDays(from, today),
    gasSeries(from, last).catch((e) => {
      notes.push(`Doğal gaz GRF alınamadı: ${e instanceof Error ? e.message : e}`);
      return new Map<string, number>();
    }),
    unlicensedSun(from, last).catch((e) => {
      notes.push(`Lisanssız güneş alınamadı: ${e instanceof Error ? e.message : e}`);
      return new Map<string, number[]>();
    }),
  ]);

  // Gerçekleşen güneş = gerçek zamanlı (lisanslı) + lisanssız; ikisi de tam olan günler
  const sunReal = new Map<string, number[]>();
  for (const [d, u] of Array.from(unl)) {
    const doc = docs.get(Number(d.slice(0, 4)));
    const rt = doc ? slice(doc.rt?.sun, doc, d) : null;
    if (rt && full(rt))
      sunReal.set(
        d,
        rt.map((v, h) => v + u[h])
      );
  }
  const unlicensedUntil = Array.from(sunReal.keys()).sort().pop() ?? null;
  const ptf = new Map<string, number[]>();
  for (const [d, x] of Array.from(days)) if (x.ptf) ptf.set(d, x.ptf);
  const nb = neighborFeatures(await readEntsoe().catch(() => null), ptf);
  return {
    rows: measureEffects({
      days,
      gas,
      sunReal,
      hydro: energyOccupancyByDay(await readDsiDam().catch(() => null), from, last),
      neighbor: nb.spread,
      flows: nb.netExport,
      last,
    }),
    updatedAt: new Date().toISOString(),
    unlicensedUntil,
    notes,
  };
}
