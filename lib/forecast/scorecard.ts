/**
 * TR-Energy Analyst - Tahmin karnesi (PLAN 21.4): günlük tahmin kaydı gerçekleşen üretimle
 *
 * Yalnız GÖP kesiminden önce yazılmış (`onTime`) kayıtlar sayılır. Her santral ve model sürümü için kayıtlı tahmin ile
 * şirketin ilk KGÜP'ü AYNI saatlerde (ikisinin de değeri, gerçekleşen üretim ve piyasa fiyatı olan saatler) karşılaştırılır.
 * Hata: WAPE = Σ|tahmin − gerçekleşen| ÷ Σ gerçekleşen. Maliyet: dengesizlik + KÜPST, dönemin kuralıyla
 * (lib/forecast/production-backtest.ts `evaluateForecasts`; geriye dönük testle aynı fiyatlama, plan gün içinde
 * düzeltilmemiş sayılır). Gerçekleşen: UEVM (kesin) ya da UEVM gelmemişse EPİAŞ gerçek zamanlı üretimi (geçici, GZÜ);
 * geçici saat sayısı her satırda taşınır, UEVM gelince aynı hesap kesin değeri verir.
 * Ayrımlar: gök durumu (günlük açıklık oranı: uydu GHI ÷ açık gök GHI) ve konum kaynağı (koordinatlı kayıt / ~ ilçe
 * merkezi). Ölçüm maskesi: uyduyla kayıp saatler (kısıntı, arıza; curtailment.ts) iki taraftan da çıkarılmış ayrı küme.
 * Eksik kayıt günleri ve santral boşlukları listelenir.
 * SAF: I/O yok (veri lib/services/forecast-scorecard.ts).
 */

import type { MarketPriceRecord } from "@/lib/calculations/types";
import type { ProductionSource } from "@/lib/pool/provisional";
import { evaluateForecasts, type CandidateResult } from "./production-backtest";
import { detectLostHours } from "./curtailment";
import { clearSkyGhiHour } from "./solar-geometry";
import type { SolarSite } from "./production-model";
import type { ForecastLog } from "./forecast-log";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Günlük açıklık oranı eşikleri (uydu GHI ÷ Haurwitz açık gök GHI; Eylül 2026'da bulutsuz günler 0,94–1,04) */
export const SKY_CLEAR_MIN = 0.85;
export const SKY_OVERCAST_MAX = 0.5;
/** Gündüz saatlerinin bu kadarında uydu değeri yoksa gök durumu bilinmiyor */
const SKY_MIN_COVERAGE = 0.8;

export type SkyClass = "açık" | "parçalı" | "kapalı" | "bilinmiyor";
export const SKY_CLASSES: readonly SkyClass[] = ["açık", "parçalı", "kapalı", "bilinmiyor"];
export type LocationClass = "kayıt" | "~ ilçe merkezi";

export function skyClass(kt: number | null): SkyClass {
  if (kt === null || !Number.isFinite(kt)) return "bilinmiyor";
  return kt >= SKY_CLEAR_MIN ? "açık" : kt < SKY_OVERCAST_MAX ? "kapalı" : "parçalı";
}

/** Gün başı (duvar saati ms) için açıklık oranı; uydu yeterince yoksa null */
export function dailyClearness(dayStart: number, site: SolarSite, satGhi: (t: number) => number | null): number | null {
  let cs = 0;
  let sat = 0;
  let daylight = 0;
  let covered = 0;
  for (let h = 0; h < 24; h++) {
    const t = dayStart + h * HOUR;
    const c = clearSkyGhiHour(site.latitude, site.longitude, t);
    if (c <= 0) continue;
    daylight++;
    const v = satGhi(t);
    if (v === null) continue;
    covered++;
    cs += c;
    sat += v;
  }
  if (!daylight || covered / daylight < SKY_MIN_COVERAGE || cs <= 0) return null;
  return sat / cs;
}

export const locationClass = (locationSource: string | null | undefined): LocationClass => (locationSource === "DISTRICT_CENTER" ? "~ ilçe merkezi" : "kayıt");

export interface ScorecardPlantData {
  name: string;
  site: SolarSite;
  /** Saat → gerçekleşen üretim ve kaynağı */
  realized: Map<number, { mwh: number; source: ProductionSource }>;
  kgupFirst: Map<number, number | null>;
  /** Saat → uydu ışınımı (W/m²) */
  sat: Map<number, { ghi: number | null; direct: number | null; diffuse: number | null }>;
}

/** Bir kümede model ve ilk KGÜP, aynı saatlerde */
export interface ScorePair {
  model: CandidateResult;
  kgup: CandidateResult;
  /** Kümedeki saatlerden geçici üretimle (GZÜ) ölçülenler */
  provisionalHours: number;
}

export interface ScorecardRow {
  epiasPlantId: number;
  name: string;
  modelId: string;
  location: LocationClass;
  /** Kaydı (onTime, durum ok) olan gün */
  days: number;
  /** Gerçekleşen üretimi olan gün */
  scoredDays: number;
  all: ScorePair;
  /** Uyduyla kayıp saatler (planlı kısıntı, arıza) iki taraftan da çıkarılmış */
  exLoss: ScorePair;
  /** Gök durumuna göre, kayıp saatler hariç */
  bySky: Record<SkyClass, ScorePair>;
}

export interface ScorecardGroup {
  modelId: string;
  plants: number;
  all: ScorePair;
  exLoss: ScorePair;
  bySky: Record<SkyClass, ScorePair>;
  byLocation: Record<LocationClass, ScorePair & { plants: number }>;
}

export interface MissingDay {
  date: string;
  reason: "kayıt yok" | "geç kayıt";
  /** Kayıt yoksa zamanlayıcı günlüğünden ipucu (servis doldurur) */
  note?: string;
}

export interface PlantGap {
  date: string;
  epiasPlantId: number;
  name: string;
  reason: string;
}

export interface Scorecard {
  from: string;
  to: string;
  rows: ScorecardRow[];
  groups: ScorecardGroup[];
  missingDays: MissingDay[];
  plantGaps: PlantGap[];
  /** Kaydı olan ama gerçekleşen üretimi henüz gelmemiş günler (GZÜ ≈ 2 gün gecikir) */
  pendingDays: string[];
  /** Sayılan saatlerin geçici (GZÜ) olanı: 0 ise karne kesin */
  provisionalHours: number;
}

interface Hour {
  t: number;
  uevm: number;
  ptf: null;
  f: number;
  kgup: number | null;
  source: ProductionSource;
  sky: SkyClass;
  lost: boolean;
}

const MODEL = "model";
const KGUP = "ilk KGÜP";

function pair(hours: Hour[], market: Map<number, MarketPriceRecord>, filter: (h: Hour) => boolean = () => true): ScorePair {
  const r = evaluateForecasts(hours, { [MODEL]: (h: Hour) => h.f, [KGUP]: (h: Hour) => h.kgup }, market, "GES", filter);
  // evaluateForecasts'in saat koşuluyla aynı: ikisinin de değeri ve piyasa fiyatı olan saatler
  const provisionalHours = hours.filter((h) => filter(h) && h.kgup !== null && market.has(h.t) && h.source === "GZÜ").length;
  return { model: r[MODEL], kgup: r[KGUP], provisionalHours };
}

const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= Date.parse(`${to}T00:00:00Z`); d += DAY) out.push(new Date(d).toISOString().slice(0, 10));
  return out;
};

/**
 * `logs`: [from, to] hedef günlerinin kayıtları (geç olanlar dahil: eksik listesi için). `plants`: karnedeki santraller
 * (ör. projenin güneş santralleri; kayıtta olup burada olmayan santral sayılmaz; burada olup kayıtta olmayan boşluktur).
 */
export function buildScorecard(input: {
  from: string;
  to: string;
  logs: ForecastLog[];
  plants: Map<number, ScorecardPlantData>;
  market: Map<number, MarketPriceRecord>;
}): Scorecard {
  const { from, to, plants, market } = input;
  const byDate = new Map(input.logs.map((l) => [l.targetDate, l]));
  const missingDays: MissingDay[] = [];
  const plantGaps: PlantGap[] = [];
  const pending = new Set<string>();
  // (santral, model) → saatler; gün sayıları
  const series = new Map<string, { id: number; modelId: string; location: LocationClass; hours: Hour[]; days: number; scoredDays: number }>();
  const skyCache = new Map<string, SkyClass>();

  for (const date of days(from, to)) {
    const log = byDate.get(date);
    if (!log) {
      missingDays.push({ date, reason: "kayıt yok" });
      continue;
    }
    if (!log.onTime) {
      missingDays.push({ date, reason: "geç kayıt" });
      continue;
    }
    const d0 = Date.parse(`${date}T00:00:00Z`);
    const inLog = new Map(log.plants.map((p) => [p.epiasPlantId, p]));
    for (const [id, data] of plants) {
      const p = inLog.get(id);
      if (!p || p.status !== "ok" || !p.hours) {
        plantGaps.push({ date, epiasPlantId: id, name: data.name, reason: !p ? "kayıtta yok" : `${p.status}${p.message ? `: ${p.message}` : ""}` });
        continue;
      }
      const key = `${id}|${log.model.id}`;
      const s = series.get(key) ?? { id, modelId: log.model.id, location: locationClass(p.location?.locationSource), hours: [], days: 0, scoredDays: 0 };
      series.set(key, s);
      s.days++;
      const skyKey = `${id}|${date}`;
      if (!skyCache.has(skyKey)) skyCache.set(skyKey, skyClass(dailyClearness(d0, data.site, (t) => data.sat.get(t)?.ghi ?? null)));
      const sky = skyCache.get(skyKey)!;
      let any = false;
      p.hours.forEach((f, i) => {
        const t = d0 + i * HOUR;
        const r = data.realized.get(t);
        if (f === null || !r) return;
        any = true;
        s.hours.push({ t, uevm: r.mwh, ptf: null, f, kgup: data.kgupFirst.get(t) ?? null, source: r.source, sky, lost: false });
      });
      if (any) s.scoredDays++;
      else pending.add(date);
    }
  }

  // Ölçüm maskesi: kayıp saatler santralin karne dönemindeki bütün saatleriyle (bütün modellere aynı)
  const lostByPlant = new Map<number, Set<number>>();
  for (const [id, data] of plants) {
    const ts = Array.from(new Set(Array.from(series.values()).filter((s) => s.id === id).flatMap((s) => s.hours.map((h) => h.t)))).sort((a, b) => a - b);
    if (!ts.length) continue;
    const loss = detectLostHours(
      ts.map((t) => ({ t, uevm: data.realized.get(t)?.mwh ?? null, kgupFirst: data.kgupFirst.get(t) ?? null, satGhi: data.sat.get(t)?.ghi ?? null, satDirect: data.sat.get(t)?.direct ?? null, satDiffuse: data.sat.get(t)?.diffuse ?? null })),
      data.site
    );
    lostByPlant.set(id, new Set(loss.lost.keys()));
  }
  for (const s of series.values()) {
    const lost = lostByPlant.get(s.id);
    if (lost) for (const h of s.hours) h.lost = lost.has(h.t);
  }

  const bySky = (hours: Hour[]) => Object.fromEntries(SKY_CLASSES.map((c) => [c, pair(hours, market, (h) => !h.lost && h.sky === c)])) as Record<SkyClass, ScorePair>;
  const rows: ScorecardRow[] = Array.from(series.values())
    .map((s) => ({
      epiasPlantId: s.id,
      name: plants.get(s.id)!.name,
      modelId: s.modelId,
      location: s.location,
      days: s.days,
      scoredDays: s.scoredDays,
      all: pair(s.hours, market),
      exLoss: pair(s.hours, market, (h) => !h.lost),
      bySky: bySky(s.hours),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr") || a.modelId.localeCompare(b.modelId));

  // Model sürümü başına toplam: saatler birleştirilir (maliyet saat başına toplanır; santraller aynı kuralla)
  const groups: ScorecardGroup[] = [];
  for (const modelId of Array.from(new Set(rows.map((r) => r.modelId))).sort()) {
    const ss = Array.from(series.values()).filter((s) => s.modelId === modelId);
    const hours = ss.flatMap((s) => s.hours);
    const byLocation = Object.fromEntries(
      (["kayıt", "~ ilçe merkezi"] as LocationClass[]).map((c) => {
        const sub = ss.filter((s) => s.location === c);
        return [c, { ...pair(sub.flatMap((s) => s.hours), market, (h) => !h.lost), plants: sub.length }];
      })
    ) as ScorecardGroup["byLocation"];
    groups.push({ modelId, plants: ss.length, all: pair(hours, market), exLoss: pair(hours, market, (h) => !h.lost), bySky: bySky(hours), byLocation });
  }

  return {
    from,
    to,
    rows,
    groups,
    missingDays,
    plantGaps,
    pendingDays: Array.from(pending).sort(),
    provisionalHours: rows.reduce((s, r) => s + r.all.provisionalHours, 0),
  };
}

/** MWh başına maliyet (TL); saat yoksa NaN */
export const tlPerMwh = (r: CandidateResult) => (r.uevmMwh > 0 ? r.totalTl / r.uevmMwh : NaN);
