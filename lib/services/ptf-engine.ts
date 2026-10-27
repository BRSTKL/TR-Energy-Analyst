/**
 * TR-Energy Analyst - PTF motoru: yarının tahmini (hesap lib/ptf/*; veri lib/services/ptf-history.ts)
 *
 * Hedef gün T için: geçmiş günler havuzdan ve veri tabanından; kesimde bilinen ama havuzda henüz olmayanlar EPİAŞ'tan canlı
 * (T'nin yük planı ve rüzgâr tahmini, T-1'in PTF'si ve kaynak bazında KGÜP'ü). Modeller (LEAR, GBM) yalnız geçmişle eğitilir;
 * son 60 gün aynı modellerle yeniden oynatılır, birleşimin (ortalama) örneklem dışı hatasından saatlik aralık kurulur.
 * Kesimden sonra bilinen hiçbir veri kullanılmaz (lib/ptf/history.ts kuralı).
 */

import { buildFeatures } from "@/lib/ptf/features";
import {
  bandsFrom,
  cutoffMs,
  PTF_LOG_FORMAT,
  type PtfForecastLog,
} from "@/lib/ptf/forecast-log";
import {
  H,
  KGUP_SOURCES,
  PtfView,
  shiftDay,
  type KgupSource,
  type PtfDay,
} from "@/lib/ptf/history";
import { ENGINE_EXCLUDE, FeatureCache, gbmModel, learModel } from "@/lib/ptf/models";
import { replay } from "@/lib/ptf/replay";
import { DPP_FIELDS } from "@/lib/pool/system-codec";
import { epiasRequest } from "@/lib/services/epias-service";
import { liveDay } from "@/lib/services/pre-bid";
import { loadPtfHistory } from "@/lib/services/ptf-history";

export const ENGINE_MODEL_ID = "ptf-ens-v1";
const BAND_DAYS = 60;
const HISTORY_FLOOR = "2024-01-01";
/** Eğitim penceresi (728) + aralık günleri (60) + referans (28) + pay */
const LOOKBACK_DAYS = 830;

const full = (a: Array<number | null> | null | undefined): a is number[] =>
  !!a && a.length === 24 && a.every((v) => v !== null && Number.isFinite(v));

/** T-1'in kaynak bazında KGÜP'ü (havuzda yoksa) */
async function liveKgup(day: string): Promise<Partial<Record<KgupSource, number[]>>> {
  const r = await epiasRequest<{ items?: Array<Record<string, unknown>> }>(
    "/generation/data/dpp",
    {
      startDate: `${day}T00:00:00+03:00`,
      endDate: `${day}T23:00:00+03:00`,
      region: "TR1",
    }
  );
  const acc: Partial<Record<KgupSource, Array<number | null>>> = {};
  for (const it of r.items ?? []) {
    const h = typeof it.date === "string" ? Number(it.date.slice(11, 13)) : NaN;
    if (!(h >= 0 && h < 24)) continue;
    for (const [field, src] of Object.entries(DPP_FIELDS)) {
      if (!(KGUP_SOURCES as readonly string[]).includes(src)) continue;
      const v = it[field];
      if (typeof v !== "number") continue;
      const s = (acc[src as KgupSource] ??= Array(24).fill(null));
      s[h] = (s[h] ?? 0) + v;
    }
  }
  const out: Partial<Record<KgupSource, number[]>> = {};
  for (const [k, v] of Object.entries(acc)) if (full(v)) out[k as KgupSource] = v;
  return out;
}

export interface EngineForecast {
  log: PtfForecastLog;
  /** Uyarılar (canlı alınamayan girdiler vb.) */
  notes: string[];
}

export async function forecastPtf(
  target: string,
  now = new Date()
): Promise<EngineForecast> {
  const notes: string[] = [];
  const live: string[] = [];
  const from =
    shiftDay(target, -LOOKBACK_DAYS) < HISTORY_FLOOR
      ? HISTORY_FLOOR
      : shiftDay(target, -LOOKBACK_DAYS);
  const days = await loadPtfHistory(from, target);
  const t = days.get(target)!;
  const prev = shiftDay(target, -1);
  const p = days.get(prev)!;

  // Hedef günün yük planı ve rüzgâr tahmini; T-1'in PTF'si: havuzda / veri tabanında yoksa canlı
  if (!t.lep || !t.windF) {
    const l = await liveDay(target).catch(() => null);
    if (!t.lep && l && full(l.lep)) ((t.lep = l.lep), live.push("lep"));
    if (!t.windF && l && full(l.windF)) ((t.windF = l.windF), live.push("windF"));
  }
  if (!p.ptf) {
    const l = await liveDay(prev).catch(() => null);
    if (l && full(l.ptf)) ((p.ptf = l.ptf), live.push("ptfD1"));
  }
  if (!p.kgup.naturalGas) {
    const k = await liveKgup(prev).catch(
      (e) => (notes.push(`T-1 KGÜP alınamadı: ${e instanceof Error ? e.message : e}`), {})
    );
    if (Object.keys(k).length) ((p.kgup = { ...p.kgup, ...k }), live.push("kgupD1"));
  }
  if (!t.lep) notes.push("Hedef günün yük planı yok: tahmin kurulamaz.");
  if (!p.ptf) notes.push("T-1 PTF'si yok: tahmin kurulamaz.");

  const ctx = { days, exclude: new Set(ENGINE_EXCLUDE) };
  const cache = new FeatureCache(ctx);
  const lear = learModel(ctx, cache);
  const gbm = gbmModel(ctx, cache);
  // Son 60 gün: örneklem dışı hatalar (aralık için); modeller burada kendi takvimiyle yeniden kurulur
  const past = replay(
    [lear, gbm],
    days,
    shiftDay(target, -BAND_DAYS),
    shiftDay(target, -1)
  );
  const ens = (preds: Record<string, number[]>) =>
    preds["LEAR-ridge"].map((v, h) => (v + preds["GBM"][h]) / 2);
  const errors = past.map((r) => {
    const e = ens(r.preds);
    return r.actual.map((a, h) => a - e[h]);
  });
  const recentMae = errors.length
    ? errors.reduce((s, e) => s + e.reduce((x, v) => x + Math.abs(v), 0) / H, 0) /
      errors.length
    : null;

  const f = buildFeatures(new PtfView(days, target));
  const pl = lear.predict(target);
  const pg = gbm.predict(target);
  if (!f || !pl || !pg)
    throw new Error(
      `Tahmin kurulamadı (${target}): ${notes.join(" ") || "özellik ya da model eksik"}`
    );
  const p50 = pl.map((v, h) => (v + pg[h]) / 2);
  const bands = bandsFrom(errors, p50, f.cap);
  const cutoff = cutoffMs(target);
  return {
    log: {
      format: PTF_LOG_FORMAT,
      targetDate: target,
      issuedAt: now.toISOString(),
      cutoff: new Date(cutoff).toISOString(),
      onTime: now.getTime() <= cutoff,
      modelId: ENGINE_MODEL_ID,
      hours: p50.map((v, h) => ({
        hour: h,
        p50: Math.round(v * 100) / 100,
        q10: bands[h].q10,
        q90: bands[h].q90,
      })),
      members: { "LEAR-ridge": pl, GBM: pg },
      inputs: { windKind: f.rows[0][16], fallbacks: f.fallbacks, live },
      band: { days: errors.length, recentMae },
      cap: f.cap,
    },
    notes,
  };
}
