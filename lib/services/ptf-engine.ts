/**
 * TR-Energy Analyst - PTF motoru: yarının tahmini (hesap lib/ptf/*; veri lib/services/ptf-history.ts)
 *
 * Hedef gün T için: geçmiş günler havuzdan ve veri tabanından; kesimde bilinen ama havuzda henüz olmayanlar EPİAŞ'tan canlı
 * (T'nin yük planı ve rüzgâr tahmini, T-1'in PTF'si ve kaynak bazında KGÜP'ü). Modeller (LEAR, GBM) yalnız geçmişle eğitilir;
 * son 60 gün aynı modellerle yeniden oynatılır, birleşimin (ortalama) örneklem dışı hatasından saatlik aralık kurulur.
 * Kesimden sonra bilinen hiçbir veri kullanılmaz (lib/ptf/history.ts kuralı).
 */

import {
  championAt,
  EMPTY_REGISTRY,
  PTF_BASE_MODEL,
  PTF_SHADOW_AVG_WIND,
  PTF_SHADOW_HYDRO,
} from "@/lib/ptf/champion";
import { readPtfChampion } from "@/lib/ptf/champion-store";
import { buildFeatures, FEATURE_NAMES, type DayFeatures } from "@/lib/ptf/features";
import {
  bandsFrom,
  cutoffMs,
  PTF_LOG_FORMAT,
  rawFromLog,
  type PtfForecastLog,
  type PtfLevelInfo,
} from "@/lib/ptf/forecast-log";
import {
  H,
  KGUP_SOURCES,
  PtfView,
  shiftDay,
  type KgupSource,
  type PtfDay,
} from "@/lib/ptf/history";
import {
  ENGINE_EXCLUDE,
  FeatureCache,
  gbmModel,
  HYDRO_FEATURES,
  learModel,
} from "@/lib/ptf/models";
import { applyLevel, correctLevel, LEVEL_GAMMA, levelAdjustment } from "@/lib/ptf/level";
import { replay } from "@/lib/ptf/replay";
import { readPtfLog } from "@/lib/ptf/forecast-log-store";
import { DPP_FIELDS } from "@/lib/pool/system-codec";
import { epiasRequest } from "@/lib/services/epias-service";
import { liveDay } from "@/lib/services/pre-bid";
import { loadPtfHistory } from "@/lib/services/ptf-history";
import { forecastSolar, irradianceIndex, SOLAR_SCALE_DAYS } from "@/lib/ptf/solar";
import { liveRegionWeather } from "@/lib/services/ptf-solar";
import { forecastWind, WIND_SCALE_DAYS, windIndex } from "@/lib/ptf/wind";
import { liveRegionWind, loadRegionWind } from "@/lib/services/ptf-wind";

/** Sürüm kimlikleri lib/ptf/champion.ts'te (karar kuralıyla aynı yer); burada eski adlarıyla da dışa verilir */
export const ENGINE_MODEL_ID = PTF_BASE_MODEL;
/** Gölge sürüm: rüzgârda EPİAŞ ve kendi tahminin ortalaması */
export const SHADOW_AVG_WIND_ID = PTF_SHADOW_AVG_WIND;
/** Gölge sürüm: hidro özellikleri (dünkü baraj + akarsu planı, net yük − hidro, son 28 güne göre sapma) */
export const SHADOW_HYDRO_ID = PTF_SHADOW_HYDRO;
const BAND_DAYS = 60;
const HISTORY_FLOOR = "2024-01-01";
/** Eğitim penceresi (728) + aralık günleri (60) + referans (28) + pay */
const LOOKBACK_DAYS = 830;

const full = (a: Array<number | null> | null | undefined): a is number[] =>
  !!a && a.length === 24 && a.every((v) => v !== null && Number.isFinite(v));
const sum = (...series: number[][]) =>
  series[0].map((_, h) => series.reduce((s, x) => s + x[h], 0));

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

/** Ekranda gösterilen girdi durumu: alındı, yedeğe düştü ya da yok */
export interface PtfInputStatus {
  key: "lep" | "wind" | "sun" | "ptfD1" | "kgupD1";
  state: "ok" | "fallback" | "missing";
  /** Kaynak ya da yedek (düz Türkçe) */
  detail: string;
}

/** Tahminin dayandığı saatlik seriler (ekran için; kayıtta yok) */
export interface PtfDisplaySeries {
  base: number[];
  ptfD1: number[];
  lep: number[];
  /** Aynı sınıf günlerin yük tahmini ortancası */
  lepRef: number[];
  wind: number[];
  sun: number[];
  net: number[];
  /** T-1 KGÜP: gaz + ithal kömür + linyit; baraj + akarsu */
  kgupThermal: number[];
  kgupHydro: number[];
  /** Hedef günün gerçekleşen PTF'si (yalnız geçmiş gün denemesinde) */
  actual: number[] | null;
  /** Seviye düzeltmesi: uygulanan miktar (TL/MWh) ve dayandığı dünkü kayıt (yoksa null, düzeltme 0); eski önbellekte yok */
  level?: { gamma: number; adj: number; basis: string | null };
}

export interface EngineForecast {
  log: PtfForecastLog;
  /** Uyarılar (canlı alınamayan girdiler vb.) */
  notes: string[];
  inputs: PtfInputStatus[];
  display: PtfDisplaySeries;
}

/** Tahmin kurulamadı; ekran hangi girdinin eksik olduğunu gösterebilsin diye durum taşır */
export class PtfForecastError extends Error {
  constructor(
    message: string,
    readonly inputs: PtfInputStatus[],
    readonly notes: string[]
  ) {
    super(message);
    this.name = "PtfForecastError";
  }
}

const WIND_SOURCE: Record<number, string> = {
  1: "EPİAŞ rüzgâr tahmini",
  3: "kendi rüzgâr tahminimiz (EPİAŞ tahmini yok)",
  4: "EPİAŞ ve kendi tahminin ortalaması",
  0: "son 3 günün gerçekleşen rüzgârı (tahmin yok)",
};

function inputStatus(
  t: PtfDay,
  p: PtfDay,
  windKind: number | null,
  sunKind: number | null
): PtfInputStatus[] {
  const kgupOk = KGUP_SOURCES.filter((s) => s !== "sun" && full(p.kgup[s])).length;
  return [
    t.lep
      ? { key: "lep", state: "ok", detail: "EPİAŞ yük tahmin planı" }
      : {
          key: "lep",
          state: "missing",
          detail:
            "EPİAŞ hedef günün yük tahminini henüz yayımlamadı (genelde 12:00 civarı çıkıyor); tahmin kurulamaz",
        },
    windKind === null
      ? {
          key: "wind",
          state: t.windF || t.windOwn ? "ok" : "missing",
          detail: t.windF
            ? WIND_SOURCE[1]
            : t.windOwn
              ? WIND_SOURCE[3]
              : "EPİAŞ rüzgâr tahmini ve kendi tahminimiz yok",
        }
      : {
          key: "wind",
          state: windKind === 1 || windKind === 4 ? "ok" : windKind < 0 ? "missing" : "fallback",
          detail: WIND_SOURCE[windKind] ?? "rüzgâr girdisi yok (0 kabul edildi)",
        },
    sunKind === 1 || (sunKind === null && t.sunF)
      ? { key: "sun", state: "ok", detail: "kendi ülke güneş tahminimiz (30 bölge, ECMWF ışınım)" }
      : {
          key: "sun",
          state: sunKind === 0 ? "fallback" : "missing",
          detail:
            sunKind === 0
              ? "hava tahmini alınamadı; son 7 günün KGÜP güneş ortancası kullanıldı"
              : "güneş girdisi yok",
        },
    p.ptf
      ? { key: "ptfD1", state: "ok", detail: "EPİAŞ gün öncesi piyasası" }
      : { key: "ptfD1", state: "missing", detail: "önceki günün PTF'si alınamadı; tahmin kurulamaz" },
    kgupOk === 6
      ? { key: "kgupD1", state: "ok", detail: "EPİAŞ KGÜP, kaynak bazında" }
      : {
          key: "kgupD1",
          state: kgupOk ? "fallback" : "missing",
          detail: `${6 - kgupOk} kaynakta önceki günün KGÜP'ü yok (0 kabul edildi)`,
        },
  ];
}

/** Sürüm tanımı: aynı hat (LEAR + GBM, seviye düzeltmesi), farklı girdi seçimi */
interface VariantSpec {
  id: string;
  windPolicy?: "average";
  exclude: ReadonlySet<string>;
}
/** Temel sürüm: motorun varsayılan girdi seçimi */
const BASE_VARIANT: VariantSpec = { id: ENGINE_MODEL_ID, exclude: new Set(ENGINE_EXCLUDE) };
/** Gölge sürümler: her gün temel sürümle birlikte tahmin yapar; canlı kayda ancak kanıtla (lib/ptf/champion.ts) geçer */
const SHADOWS: VariantSpec[] = [
  { id: SHADOW_AVG_WIND_ID, windPolicy: "average", exclude: new Set(ENGINE_EXCLUDE) },
  {
    id: SHADOW_HYDRO_ID,
    exclude: new Set(ENGINE_EXCLUDE.filter((n) => !HYDRO_FEATURES.includes(n))),
  },
];

/** Bir sürümün sonucu: saatlik tahmin (seviye düzeltmeli), son 60 günün düzeltilmiş hataları ve girdi özellikleri */
interface VariantResult {
  id: string;
  f: DayFeatures;
  pl: number[];
  pg: number[];
  p50: number[];
  errors: number[][];
  recentMae: number | null;
  meanPrice: number | null;
  baselineMae: number | null;
}

/**
 * `opts.champion`: ana kayda yazılacak sürüm (günlük iş şampiyon kararını verdikten sonra geçirir); verilmezse defterdeki
 * sürüm (hedef gün için geçerli olan: geçmiş gün denemesi o gün canlı olan sürümü kullanır).
 */
export async function forecastPtf(
  target: string,
  now = new Date(),
  opts: { prevLog?: PtfForecastLog | null; champion?: string } = {}
): Promise<EngineForecast> {
  const notes: string[] = [];
  const live: string[] = [];
  const from =
    shiftDay(target, -LOOKBACK_DAYS) < HISTORY_FLOOR
      ? HISTORY_FLOOR
      : shiftDay(target, -LOOKBACK_DAYS);
  const days = await loadPtfHistory(from, target, { sunFix: true });
  const t = days.get(target)!;
  const prev = shiftDay(target, -1);
  const p = days.get(prev)!;

  // Hedef günün yük planı ve rüzgâr tahmini; T-1'in PTF'si: havuzda / veri tabanında yoksa canlı
  // Hedef günün gerçekleşen PTF'si yalnız ekranda karşılaştırma için tutulur; modele gitmez (PtfView zaten okutmaz)
  let actual: number[] | null = full(t.ptf) ? t.ptf : null;
  if (!t.lep || !t.windF) {
    const l = await liveDay(target).catch(() => null);
    if (!t.lep && l && full(l.lep)) ((t.lep = l.lep), live.push("lep"));
    if (!t.windF && l && full(l.windF)) ((t.windF = l.windF), live.push("windF"));
    if (!actual && l && full(l.ptf)) actual = l.ptf;
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
  // Kendi ülke güneş tahmini: arşiv düne kadar; hedef gün ve ölçek günleri için d2 ışınımı canlı
  if (!t.sunF) {
    try {
      const regions = await liveRegionWeather(
        shiftDay(target, -(SOLAR_SCALE_DAYS + 3)),
        target
      );
      if (regions.length) {
        const index = (d: string) => irradianceIndex(regions, d);
        t.sunF = forecastSolar(
          target,
          (d) => (d < target ? (days.get(d)?.kgup.sun ?? null) : null),
          index
        );
        if (t.sunF) live.push("sunF");
      }
    } catch (e) {
      notes.push(
        `Güneş için hava tahmini alınamadı (vekile düşüldü): ${e instanceof Error ? e.message : e}`
      );
    }
  }
  // Kendi ülke rüzgâr tahmini: arşiv düne kadar (ölçek günleri), hedef gün için d2 100 m rüzgâr canlı
  if (!t.windOwn) {
    try {
      const regions = await loadRegionWind(
        Number(shiftDay(target, -(WIND_SCALE_DAYS + 5)).slice(0, 4)),
        Number(target.slice(0, 4))
      );
      const fresh = await liveRegionWind(shiftDay(target, -3), target);
      fresh.forEach((r, i) => {
        if (!regions[i]) return;
        for (const [d, v] of Array.from(r.ws)) regions[i].ws.set(d, v);
      });
      if (regions.length) {
        const index = (d: string) => windIndex(regions, d);
        t.windOwn = forecastWind(
          target,
          (d) => (d <= shiftDay(target, -2) ? (days.get(d)?.windRt ?? null) : null),
          index
        );
        if (t.windOwn) live.push("windOwn");
      }
    } catch (e) {
      notes.push(
        `Rüzgâr için hava tahmini alınamadı: ${e instanceof Error ? e.message : e}`
      );
    }
  }
  if (!t.lep) notes.push("Hedef günün yük planı yok: tahmin kurulamaz.");
  if (!p.ptf) notes.push("T-1 PTF'si yok: tahmin kurulamaz.");
  // Zorunlu girdi yoksa modelleri boşuna eğitme (yaklaşık bir dakika)
  if (!t.lep || !p.ptf)
    throw new PtfForecastError(
      `Tahmin kurulamadı (${target}): ${notes.join(" ")}`,
      inputStatus(t, p, null, null),
      notes.filter((n) => !n.endsWith("tahmin kurulamaz.")) // girdi durumunda zaten var
    );

  const ens = (preds: Record<string, number[]>) =>
    preds["LEAR-ridge"].map((v, h) => (v + preds["GBM"][h]) / 2);
  const col = (f: DayFeatures | null, name: (typeof FEATURE_NAMES)[number]) => {
    const j = FEATURE_NAMES.indexOf(name);
    return f ? f.rows.map((r) => r[j]) : [];
  };

  // Seviye düzeltmesi: dünkü kayıttaki düzeltilmemiş tahmin ile gerçekleşenin farkı (kayıt yoksa 0). Her sürüm kendi dünkü
  // düzeltilmemiş tahminini kullanır (kayıtta hepsi var: `level.raw`)
  const prevLog =
    opts.prevLog !== undefined ? opts.prevLog : await readPtfLog(prev).catch(() => null);
  const level: PtfLevelInfo = { gamma: LEVEL_GAMMA, applied: {}, raw: {} };
  const levelFor = (id: string, rawToday: number[], cap: number | null) => {
    const rawPrev = rawFromLog(prevLog, id);
    const adj = levelAdjustment(p.ptf, rawPrev);
    level.applied[id] = {
      adj: Math.round(adj * 100) / 100,
      basis: rawPrev ? prev : null,
    };
    level.raw[id] = rawToday.map((v) => Math.round(v * 100) / 100);
    return applyLevel(rawToday, adj, cap);
  };

  /**
   * Bir sürümü kurar: modeller yalnız geçmişle eğitilir; son 61 gün (60 hata günü + düzeltmenin dayandığı önceki gün) aynı
   * modellerle yeniden oynatılır (örneklem dışı tahminler, modeller kendi takvimiyle yeniden kurulur) ve aralık bu sürümün
   * DÜZELTİLMİŞ hatalarından kurulur (düzeltme geçmişte de aynı kuralla uygulanmış gibi). Kurulamazsa `f` ile birlikte null döner.
   */
  const buildVariant = (spec: VariantSpec): { result: VariantResult | null; f: DayFeatures | null } => {
    const sctx = { days, exclude: spec.exclude, windPolicy: spec.windPolicy };
    const scache = new FeatureCache(sctx);
    const lear = learModel(sctx, scache);
    const gbm = gbmModel(sctx, scache);
    const past = replay(
      [lear, gbm],
      days,
      shiftDay(target, -(BAND_DAYS + 1)),
      shiftDay(target, -1)
    );
    const f = buildFeatures(new PtfView(days, target), { windPolicy: spec.windPolicy });
    const pl = lear.predict(target);
    const pg = gbm.predict(target);
    if (!f || !pl || !pg) return { result: null, f };
    const p50 = levelFor(
      spec.id,
      pl.map((v, h) => (v + pg[h]) / 2),
      f.cap
    );
    const pastCorrected = correctLevel(
      past.map((r) => ({ day: r.day, actual: r.actual, preds: { ENS: ens(r.preds) } })),
      "ENS",
      "COR",
      LEVEL_GAMMA,
      null,
      f.cap
    ).slice(-BAND_DAYS);
    const errors = pastCorrected.map((r) => r.actual.map((a, h) => a - r.preds.COR[h]));
    const recentMae = errors.length
      ? errors.reduce((s, e) => s + e.reduce((x, v) => x + Math.abs(v), 0) / H, 0) /
        errors.length
      : null;
    // Sade başarı özeti için: aynı günlerin ortalama gerçek fiyatı ve basit yöntemin (benzer günlerin ortancası) sapması
    const meanPrice = pastCorrected.length
      ? pastCorrected.reduce((s, r) => s + r.actual.reduce((x, v) => x + v, 0) / H, 0) /
        pastCorrected.length
      : null;
    let baseSum = 0;
    let baseDays = 0;
    for (const r of pastCorrected) {
      const b = scache.get(r.day)?.base;
      if (!b) continue;
      baseSum += r.actual.reduce((x, a, h) => x + Math.abs(a - b[h]), 0) / H;
      baseDays++;
    }
    const baselineMae =
      baseDays === pastCorrected.length && baseDays > 0 ? baseSum / baseDays : null;
    return { result: { id: spec.id, f, pl, pg, p50, errors, recentMae, meanPrice, baselineMae }, f };
  };

  // Temel sürüm zorunlu: kurulamazsa tahmin yok (ekran hangi girdinin eksik olduğunu gösterir)
  const base = buildVariant(BASE_VARIANT);
  if (!base.result)
    throw new PtfForecastError(
      `Tahmin kurulamadı (${target}): ${notes.join(" ") || "özellik ya da model eksik"}`,
      inputStatus(
        t,
        p,
        base.f ? col(base.f, "windKind")[0] : null,
        base.f ? col(base.f, "sunKind")[0] : null
      ),
      notes
    );
  const variants = new Map<string, VariantResult>([[ENGINE_MODEL_ID, base.result]]);
  // Gölge sürümler: ana sürümle aynı hat ve aynı düzeltme, farklı girdi. Rüzgârda EPİAŞ ve kendi tahminin ortalaması
  // (sınama döneminde %2,9 daha iyi göründü, seçimde ölçülemedi); hidro özellikleri (sınamada %3,6, hipotez sınama
  // dönemine bakılarak kuruldu). Her gün kaydedilir; canlı kayda ancak kanıtla geçer (lib/ptf/champion.ts).
  for (const sp of SHADOWS) {
    try {
      const v = buildVariant(sp).result;
      if (v) variants.set(sp.id, v);
    } catch (e) {
      notes.push(`Gölge sürüm (${sp.id}) kurulamadı: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Canlı kayda yazılacak sürüm: istenen sürüm; kurulamadıysa temel sürüm (kayıttaki `modelId` gerçekte kullanılanı söyler)
  const wanted =
    opts.champion ??
    championAt(await readPtfChampion().catch(() => EMPTY_REGISTRY), target);
  let chosen = variants.get(wanted);
  if (!chosen) {
    notes.push(`Canlı sürüm (${wanted}) kurulamadı: temel sürüm kullanıldı.`);
    chosen = base.result;
  }
  const f = chosen.f;
  const inputs = inputStatus(t, p, col(f, "windKind")[0], col(f, "sunKind")[0]);
  const shadow: Record<string, number[]> = {};
  for (const [id, v] of Array.from(variants))
    if (id !== chosen.id) shadow[id] = v.p50.map((x) => Math.round(x * 100) / 100);

  const bands = bandsFrom(chosen.errors, chosen.p50, f.cap);
  const cutoff = cutoffMs(target);
  return {
    log: {
      format: PTF_LOG_FORMAT,
      targetDate: target,
      issuedAt: now.toISOString(),
      cutoff: new Date(cutoff).toISOString(),
      onTime: now.getTime() <= cutoff,
      modelId: chosen.id,
      hours: chosen.p50.map((v, h) => ({
        hour: h,
        p50: Math.round(v * 100) / 100,
        q10: bands[h].q10,
        q90: bands[h].q90,
      })),
      members: { "LEAR-ridge": chosen.pl, GBM: chosen.pg },
      shadow,
      level,
      inputs: {
        windKind: f.rows[0][FEATURE_NAMES.indexOf("windKind")],
        sunKind: f.rows[0][FEATURE_NAMES.indexOf("sunKind")],
        fallbacks: f.fallbacks,
        live,
      },
      band: {
        days: chosen.errors.length,
        recentMae: chosen.recentMae,
        meanPrice: chosen.meanPrice,
        baselineMae: chosen.baselineMae,
      },
      cap: f.cap,
    },
    notes,
    inputs,
    display: {
      base: f.base,
      ptfD1: col(f, "ptfD1"),
      lep: col(f, "lep"),
      lepRef: sum(col(f, "lep"), col(f, "lepDev").map((v) => -v)),
      wind: col(f, "wind"),
      sun: col(f, "sun"),
      net: col(f, "net"),
      kgupThermal: sum(col(f, "kgupGas"), col(f, "kgupImpCoal"), col(f, "kgupLignite")),
      kgupHydro: sum(col(f, "kgupDam"), col(f, "kgupRiver")),
      actual,
      level: {
        gamma: LEVEL_GAMMA,
        adj: level.applied[chosen.id].adj,
        basis: level.applied[chosen.id].basis,
      },
    },
  };
}
