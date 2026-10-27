/**
 * TR-Energy Analyst - Günlük piyasa panosu (Aşama 24): bir günün fiyatları, net yükü ve akşam rampası
 *
 * Bir ticaret masasının sabah rutini: "dün ne oldu?" PTF / SMF / sistem yönü (EPİAŞ, doğrulanmış), sistemin net yükü ve
 * akşam rampası, kaynak karması, aynı tür günlerin geçmiş ortancasıyla kıyas. Tahmin değil, betimleme: kıyas bandı son 28
 * günün gerçekleşmiş fiyatlarıdır (PTF seviye tahmini kapsam dışı, ai/context/decisions.md).
 * SAF: I/O yok (veri toplama lib/services/daily-market.ts).
 *
 * Net yük = gerçek zamanlı tüketim − gerçek zamanlı rüzgâr − KGÜP güneşi. Gerekçe (26.10.2026 sunucu ölçümü): gerçek zamanlı
 * tüketim lisanssız güneşi içerir (gece tüketim − gerçek zamanlı üretim ≈ 40 MW, öğlen ≈ 15 GW); gerçek zamanlı güneş yalnız
 * lisanslıdır (öğlen ≈ 3,3 GW, KGÜP güneşi ≈ 16,9 GW). Lisanssız güneşin gerçeği haftalarca (UEVM ile) görünmediği için güneşte
 * KGÜP planı kullanılır; yani net yük "güneş planıyla" hesaplanır, seviyesi yaklaşık, saatten saate değişimi (rampa) daha sağlam.
 * Güneşi gerçek zamanlıdan alsaydık akşam rampası yaklaşık 13,6 GW yerine 5,6 GW çıkardı.
 *
 * İkinci tanım, arz tarafı: gerçek zamanlı üretimin termik, hidro ve diğer kaynakları + net ithalat (tüketime ve güneş planına
 * bakmaz; lisanssız güneş zaten gerçek zamanlı üretimde yok, tüketimden de çıkarıldığı için iki taraf aynı şeyi ölçer). Temmuz–Eylül
 * 2026'da resmî sayaç üretimiyle (UEVM + net ithalat) karşılaştırınca tüketim taraflı tanım akşam rampasını ortalamada 220–390 MW
 * düşük, arz taraflı 470–490 MW yüksek gösterdi; gerçek rampa günlerin %67–84'ünde ikisinin arasında kaldı, ortalamaları tipik gün
 * hatasını 320–510 MW'tan 140–250 MW'a indirdi (lib/analysis/daily-market-accuracy.ts, scripts/analysis/daily-market-accuracy.mts).
 * Panoda rampa bu yüzden iki tanımın ortalaması ve aralığıyla gösterilir. Aralık güven aralığı değildir: Ocak 2025 – Eylül 2026'da
 * (21 ay, 631 gün) gerçek rampa günlerin yalnız %58'inde ikisinin arasında kaldı. KGÜP güneş planı bazı günlerde eksik: 77 günde
 * (Ocak – Mart 2025 ve 1–21 Mayıs 2026) plan gerçekleşenin yarısından azını içeriyordu ve tüketim taraflı rampa 5 GW'a kadar
 * sapıyordu. Plan, gerçek zamanlı (lisanslı) güneşe oranından anlaşılır (olağan oran 4–6); eksik görünen günde tüketim taraflı tanım
 * ve lisanssız güneş bandı gösterilmez, rampa yalnız arz taraflı tanımla verilir (sunPlanSuspect). Bu kuralla gün ağırlıklı aylık
 * medyan rampa hatası (MW): tüketim taraflı 957, arz taraflı 414, ortalama 512, pano 285.
 */

import { dayKind } from "@/lib/forecast/tr-holidays";
import { nf } from "@/lib/format";
import { SYSTEM_SOURCES, type SystemSource, type SystemYear } from "@/lib/pool/system-codec";
import { ZERO_PRICE_MAX, type MarketHour } from "./market-summary";

/** Günün bir saati: canlı günde SMF ve sistem yönü henüz yayımlanmamış olabilir */
export type DailyMarketHour = Omit<MarketHour, "smf" | "systemDirection"> & { smf: number | null; systemDirection: string | null };

/** 24 saatlik seri (saat 0..23); verisi olmayan saat null */
export type Series24 = Array<number | null>;

const HOURS = 24;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : null);

// ---------------------------------------------------------------- Kıyas bandı

export type DayClass = "holiday" | "half" | "weekend" | "weekday";
export const DAY_CLASS_LABEL: Record<DayClass, string> = { holiday: "tatil", half: "yarım gün", weekend: "hafta sonu", weekday: "hafta içi" };

/** Kıyasın bakacağı gün sayısı ve bir saat için kıyas bandının gösterilmesi gereken en az gün */
export const REFERENCE_DAYS = 28;
export const REFERENCE_MIN_DAYS = 6;

/** Günün sınıfı: resmî tatil / yarım gün (arife, 28 Ekim) önce, sonra hafta sonu, sonra hafta içi */
export function dayClass(date: string): DayClass {
  const wall = Date.parse(`${date}T00:00:00Z`);
  const k = dayKind(wall);
  if (k !== "normal") return k;
  const dow = new Date(wall).getUTCDay();
  return dow === 0 || dow === 6 ? "weekend" : "weekday";
}

/** "YYYY-AA-GG" biçiminde ve takvimde var olan gün mü (2026-13-40, 2026-02-30 değil) */
export function isValidDay(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date;
}

const shiftDay = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function quantile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface ReferenceBand {
  dayClass: DayClass;
  /** Bandı oluşturan gün sayısı */
  days: number;
  median: Series24;
  /** Çeyrekler arası: %25 ve %75 */
  low: Series24;
  high: Series24;
}

/**
 * Günden önceki `REFERENCE_DAYS` takvim gününün, aynı sınıftaki günlerinin saatlik PTF ortancası ve çeyrekleri. `history`:
 * gün → 24 saatlik PTF. Bir saat için `REFERENCE_MIN_DAYS`'ten az değer varsa o saat null; hiçbir saat dolmazsa band yok (null).
 */
export function referenceBand(date: string, history: Map<string, Series24>): ReferenceBand | null {
  const cls = dayClass(date);
  const days: Series24[] = [];
  for (let i = 1; i <= REFERENCE_DAYS; i++) {
    const d = shiftDay(date, -i);
    const series = history.get(d);
    if (series && dayClass(d) === cls) days.push(series);
  }
  const median: Series24 = [];
  const low: Series24 = [];
  const high: Series24 = [];
  for (let h = 0; h < HOURS; h++) {
    const values = days.map((s) => s[h]).filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
    const ok = values.length >= REFERENCE_MIN_DAYS;
    median.push(ok ? quantile(values, 0.5) : null);
    low.push(ok ? quantile(values, 0.25) : null);
    high.push(ok ? quantile(values, 0.75) : null);
  }
  if (median.every((v) => v === null)) return null;
  return { dayClass: cls, days: days.length, median, low, high };
}

// ---------------------------------------------------------------- KGÜP güneş planı eksik mi?

/** Oranın hesaplandığı saatler: gerçek zamanlı güneş bu MW'ın üstünde (gündüz); en az bu kadar saat gerekir */
export const SUN_RATIO_MIN_RT = 800;
export const SUN_RATIO_MIN_HOURS = 3;
/** Plan / gerçek zamanlı güneş oranı, son 4 haftanın medyanının bu katının altındaysa plan eksik sayılır */
export const SUN_PLAN_RELATIVE = 0.7;
export const SUN_BASELINE_DAYS = 28;
export const SUN_BASELINE_MIN_DAYS = 7;

/**
 * Günün KGÜP güneşi / gerçek zamanlı güneş oranı (gündüz saatlerinde toplam). KGÜP lisanssız güneşi de içerir, gerçek zamanlı
 * üretim içermez; olağan oran yaklaşık 4–6 (kışın 4,5 civarı). Yeterli gündüz saati yoksa null.
 */
export function sunPlanRatio(kgupSun: Series24, rtSun: Series24): number | null {
  let plan = 0;
  let measured = 0;
  let n = 0;
  for (let h = 0; h < HOURS; h++) {
    const k = kgupSun[h];
    const r = rtSun[h];
    if (k === null || r === null || r <= SUN_RATIO_MIN_RT) continue;
    plan += k;
    measured += r;
    n++;
  }
  return n >= SUN_RATIO_MIN_HOURS && measured > 0 ? plan / measured : null;
}

/** Son günlerin oranlarının ortancası; `SUN_BASELINE_MIN_DAYS`'ten az gün varsa null */
export function sunPlanBaseline(ratios: Array<number | null>): number | null {
  const v = ratios.filter((r): r is number => r !== null).sort((a, b) => a - b);
  if (v.length < SUN_BASELINE_MIN_DAYS) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Plan eksik görünüyor mu: oran 1'in altında (toplam üretim lisanslı üretimden az olamaz) ya da son 4 haftanın medyanının
 * `SUN_PLAN_RELATIVE` katının altında. Oran yoksa (gece, veri yok) hayır.
 */
export function sunPlanSuspect(ratio: number | null, baseline: number | null): boolean {
  if (ratio === null) return false;
  return ratio < 1 || (baseline !== null && ratio < SUN_PLAN_RELATIVE * baseline);
}

/** Günden önceki `SUN_BASELINE_DAYS` günün (aynı yıl belgesinde olanların) oran ortancası */
export function sunPlanBaselineFor(doc: SystemYear | null, date: string): number | null {
  if (!doc) return null;
  const ratios: Array<number | null> = [];
  for (let i = 1; i <= SUN_BASELINE_DAYS; i++) {
    const d = shiftDay(date, -i);
    if (Number(d.slice(0, 4)) !== doc.year) continue;
    const day = systemDay(doc, d);
    ratios.push(sunPlanRatio(day.kgupSun, day.rt.sun));
  }
  return sunPlanBaseline(ratios);
}

// ---------------------------------------------------------------- Net yük ve rampa

/** Net yük (MW, saatlik ortalama); girdilerden biri eksik olan saat null */
export function netLoad(consumption: Series24, wind: Series24, sun: Series24): Series24 {
  return Array.from({ length: HOURS }, (_, h) => {
    const c = consumption[h];
    const w = wind[h];
    const s = sun[h];
    return c === null || w === null || s === null ? null : c - w - s;
  });
}

/**
 * Arz tarafı net yük (MW): gerçek zamanlı üretimin rüzgâr ve güneş dışındaki kaynakları + net ithalat (ithalat / ihracat serisi
 * eksi: ihracat). Kaynaklardan biri ya da ithalat / ihracat o saatte yoksa null.
 */
export function supplyNetLoad(rt: Record<SystemSource, Series24>, rtImportExport: Series24): Series24 {
  return Array.from({ length: HOURS }, (_, h) => {
    const ie = rtImportExport[h];
    if (ie === null) return null;
    let total = 0;
    for (const src of SYSTEM_SOURCES) {
      const v = rt[src][h];
      if (v === null) return null;
      if (src !== "wind" && src !== "sun") total += v;
    }
    return total + ie;
  });
}

/** Akşam rampası: bu saatler arasında, `RAMP_WINDOW` saatlik pencerelerin en büyük net yük artışı */
export const RAMP_WINDOW = 3;
export const RAMP_FROM = 15;
export const RAMP_TO = 22;

export interface Ramp {
  fromHour: number;
  toHour: number;
  /** MW */
  rise: number;
  /** MW / saat */
  perHour: number;
}

/** En büyük artış; uç saatlerden biri eksik pencere atlanır; artış yoksa null */
export function eveningRamp(net: Series24): Ramp | null {
  let best: Ramp | null = null;
  for (let a = RAMP_FROM; a + RAMP_WINDOW <= RAMP_TO; a++) {
    const from = net[a];
    const to = net[a + RAMP_WINDOW];
    if (from === null || to === null) continue;
    const rise = to - from;
    if (rise > 0 && (!best || rise > best.rise)) best = { fromHour: a, toHour: a + RAMP_WINDOW, rise, perHour: rise / RAMP_WINDOW };
  }
  return best;
}

/** İki tanımın akşam rampası: ortalama (`rise`), aralık ve kaç tanımla hesaplandığı */
export interface RampEstimate extends Ramp {
  low: number;
  high: number;
  /** 2: tüketim ve arz taraflı birlikte; 1: yalnız biri hesaplanabildi */
  definitions: 1 | 2;
}

/**
 * Tüketim taraflı (A) ve arz taraflı (B) net yükün akşam rampalarını birleştirir: ikisi de varsa ortalama ve aralık, biri varsa
 * o (aralık daralır), hiçbiri yoksa null. Pencere (saatler) A'nınkidir, A yoksa B'nin.
 */
export function combinedRamp(a: Series24, b: Series24): RampEstimate | null {
  const ra = eveningRamp(a);
  const rb = eveningRamp(b);
  if (!ra && !rb) return null;
  const base = (ra ?? rb)!;
  const rises = [ra, rb].filter((r): r is Ramp => r !== null).map((r) => r.rise);
  const rise = rises.reduce((x, y) => x + y, 0) / rises.length;
  return { fromHour: base.fromHour, toHour: base.toHour, rise, perHour: rise / RAMP_WINDOW, low: Math.min(...rises), high: Math.max(...rises), definitions: rises.length === 2 ? 2 : 1 };
}

const extreme = (s: Series24, pick: "min" | "max"): { hour: number; value: number } | null => {
  let out: { hour: number; value: number } | null = null;
  s.forEach((v, hour) => {
    if (v === null) return;
    if (!out || (pick === "min" ? v < out.value : v > out.value)) out = { hour, value: v };
  });
  return out;
};

// ---------------------------------------------------------------- Kaynak karması

export const MIX_GROUPS = [
  { key: "wind", label: "Rüzgâr", sources: ["wind"] },
  { key: "sun", label: "Güneş (lisanslı)", sources: ["sun"] },
  { key: "unlicensedSun", label: "Lisanssız güneş (plan)", sources: [] },
  { key: "river", label: "Akarsu", sources: ["river"] },
  { key: "dam", label: "Barajlı", sources: ["dam"] },
  { key: "gas", label: "Doğalgaz", sources: ["naturalGas"] },
  { key: "coal", label: "Kömür", sources: ["lignite", "importedCoal", "stoneCoal"] },
  { key: "other", label: "Diğer", sources: ["fueloil", "geothermal", "biomass", "naphtha", "other"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; sources: readonly SystemSource[] }>;
export type MixKey = (typeof MIX_GROUPS)[number]["key"];
export type MixHour = { hour: number } & Record<MixKey, number | null>;

/**
 * Saatlik karma (MW): gerçek zamanlı üretim gruplara toplanır. Lisanssız güneş = KGÜP güneşi − gerçek zamanlı güneş (en az 0):
 * ölçüm değil plan farkıdır, ayrı etiketlenir. Gerçek zamanlı rüzgârı olmayan saat bütünüyle null.
 */
export function mixHours(rt: Record<SystemSource, Series24>, kgupSun: Series24): MixHour[] {
  return Array.from({ length: HOURS }, (_, hour) => {
    const row = { hour } as MixHour;
    const missing = rt.wind[hour] === null;
    for (const g of MIX_GROUPS) {
      if (missing) {
        row[g.key] = null;
      } else if (g.key === "unlicensedSun") {
        const plan = kgupSun[hour];
        row[g.key] = plan === null ? null : Math.max(0, plan - (rt.sun[hour] ?? 0));
      } else {
        row[g.key] = (g.sources as readonly SystemSource[]).reduce((s, src) => s + (rt[src][hour] ?? 0), 0);
      }
    }
    return row;
  });
}

// ---------------------------------------------------------------- Gün özeti

/** Günün sistem serileri (24 saat) */
export interface DailySystem {
  consumption: Series24;
  rt: Record<SystemSource, Series24>;
  rtImportExport: Series24;
  kgupSun: Series24;
  netInstruction: Series24;
  upDelivered: Series24;
  downDelivered: Series24;
}

export interface DailyInput {
  /** YYYY-AA-GG */
  date: string;
  /** 24 saat; verisi olmayan saat null */
  market: Array<DailyMarketHour | null>;
  system: DailySystem;
  /** Önceki günlerin saatlik PTF'si (kıyas bandı için) */
  history: Map<string, Series24>;
  /** Son 4 haftanın KGÜP / gerçek zamanlı güneş oranı ortancası (sunPlanBaselineFor); yoksa yalnız mutlak kural işler */
  sunPlanBaseline?: number | null;
}

export interface DayRow {
  hour: number;
  ptf: number | null;
  smf: number | null;
  gipPrice: number | null;
  direction: string | null;
  refMedian: number | null;
  refLow: number | null;
  refHigh: number | null;
  consumption: number | null;
  wind: number | null;
  /** KGÜP güneşi (plan; lisanssız dahil) */
  sunPlan: number | null;
  net: number | null;
  /** Arz tarafı net yük (gerçek zamanlı termik + hidro + diğer + net ithalat) */
  netSupply: number | null;
  /** Teslim edilen YAL (artı) ve YAT (eksi) ile net talimat, MWh */
  up: number | null;
  down: number | null;
  netInstruction: number | null;
}

export interface DailyMarket {
  date: string;
  dayClass: DayClass;
  rows: DayRow[];
  mix: MixHour[];
  reference: ReferenceBand | null;
  prices: {
    hours: number;
    ptfMean: number | null;
    smfMean: number | null;
    /** Ortalama |SMF − PTF| */
    spreadMean: number | null;
    ptfMax: { hour: number; value: number } | null;
    ptfMin: { hour: number; value: number } | null;
    zeroHours: number;
    /** Günün ortalama PTF'sinin kıyas bandı ortancasına farkı, % (ortak saatlerde) */
    vsReferencePct: number | null;
  };
  direction: { deficit: number; balanced: number; surplus: number; unknown: number };
  net: { hours: number; min: { hour: number; value: number } | null; max: { hour: number; value: number } | null; ramp: RampEstimate | null };
  /** KGÜP güneş planı kontrolü: oran, son 4 haftanın medyanı ve plan eksik mi (eksikse tüketim taraflı net yük gösterilmez) */
  sunPlan: { ratio: number | null; baseline: number | null; suspect: boolean };
  /** Gerçek zamanlı ithalat / ihracat günlük ortalama MW (eksi: ihracat); veri yoksa null */
  importExportMean: number | null;
  coverage: { market: number; consumption: number; wind: number; sunPlan: number };
  sentences: string[];
  warnings: string[];
}

const count = (s: Series24) => s.filter((v) => v !== null).length;
const gw = (mw: number) => `${nf(mw / 1000, 1)} GW`;
const pctSigned = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}%${nf(Math.abs(v))}`;

export function buildDailyMarket(input: DailyInput): DailyMarket {
  const { date, market, system, history } = input;
  const cls = dayClass(date);
  const reference = referenceBand(date, history);
  const wind = system.rt.wind;
  const sunRatio = sunPlanRatio(system.kgupSun, system.rt.sun);
  const sunBaseline = input.sunPlanBaseline ?? null;
  const suspect = sunPlanSuspect(sunRatio, sunBaseline);
  // Plan eksikse güneş planına dayanan her şey (tüketim taraflı net yük, lisanssız güneş bandı) gösterilmez
  const sunPlan: Series24 = suspect ? Array(HOURS).fill(null) : system.kgupSun;
  const net = netLoad(system.consumption, wind, sunPlan);
  const netSupply = supplyNetLoad(system.rt, system.rtImportExport);

  const rows: DayRow[] = Array.from({ length: HOURS }, (_, hour) => {
    const m = market[hour];
    return {
      hour,
      ptf: m?.ptf ?? null,
      smf: m?.smf ?? null,
      gipPrice: m?.gipPrice ?? null,
      direction: m?.systemDirection ?? null,
      refMedian: reference?.median[hour] ?? null,
      refLow: reference?.low[hour] ?? null,
      refHigh: reference?.high[hour] ?? null,
      consumption: system.consumption[hour],
      wind: wind[hour],
      sunPlan: sunPlan[hour],
      net: net[hour],
      netSupply: netSupply[hour],
      up: system.upDelivered[hour],
      down: system.downDelivered[hour],
      netInstruction: system.netInstruction[hour],
    };
  });

  const ptfSeries: Series24 = rows.map((r) => r.ptf);
  const ptfs = ptfSeries.filter((v): v is number => v !== null);
  const smfs = rows.map((r) => r.smf).filter((v): v is number => v !== null);
  const spreads = rows.filter((r) => r.ptf !== null && r.smf !== null).map((r) => Math.abs(r.smf! - r.ptf!));
  let vsReferencePct: number | null = null;
  const both = rows.filter((r) => r.ptf !== null && r.refMedian !== null);
  if (both.length >= 20) {
    const refMean = mean(both.map((r) => r.refMedian!))!;
    if (refMean > 0) vsReferencePct = (mean(both.map((r) => r.ptf!))! / refMean - 1) * 100;
  }
  const prices: DailyMarket["prices"] = {
    hours: ptfs.length,
    ptfMean: mean(ptfs),
    smfMean: mean(smfs),
    spreadMean: mean(spreads),
    ptfMax: extreme(ptfSeries, "max"),
    ptfMin: extreme(ptfSeries, "min"),
    zeroHours: ptfs.filter((v) => v <= ZERO_PRICE_MAX).length,
    vsReferencePct,
  };

  const direction = { deficit: 0, balanced: 0, surplus: 0, unknown: 0 };
  for (const r of rows) {
    if (r.direction === "DEFICIT") direction.deficit++;
    else if (r.direction === "BALANCED") direction.balanced++;
    else if (r.direction === "SURPLUS") direction.surplus++;
    else direction.unknown++;
  }

  const netSummary = { hours: count(net), min: extreme(net, "min"), max: extreme(net, "max"), ramp: combinedRamp(net, netSupply) };
  const ie = system.rtImportExport.filter((v): v is number => v !== null);
  const coverage = { market: ptfs.length, consumption: count(system.consumption), wind: count(wind), sunPlan: count(system.kgupSun) };

  const warnings: string[] = [];
  if (coverage.market < HOURS) warnings.push(`Piyasa verisi ${coverage.market}/24 saat.`);
  if (suspect) {
    warnings.push(
      `KGÜP güneş planı eksik görünüyor (plan / gerçek zamanlı güneş oranı ${nf(sunRatio!, 1)}; ${sunBaseline !== null ? `son 4 haftanın medyanı ${nf(sunBaseline, 1)}` : "olağan oran en az 1"}): tüketim taraflı net yük, güneş planı ve lisanssız güneş bandı gösterilmiyor; akşam rampası yalnız arz taraflı tanımla.`
    );
  } else {
    if (netSummary.hours < HOURS) {
      warnings.push(
        netSummary.hours === 0
          ? "Net yük hesaplanamadı: bu gün için sistem verisi (tüketim, rüzgâr, güneş planı) eksik."
          : `Net yük ${netSummary.hours}/24 saat (tüketim ${coverage.consumption}, rüzgâr ${coverage.wind}, güneş planı ${coverage.sunPlan}).`
      );
    }
    if (netSummary.ramp?.definitions === 1) warnings.push("Akşam rampası tek tanımla hesaplandı (tüketim ya da gerçek zamanlı üretim / ithalat verisi eksik); iki tanım arası fark gösterilemiyor.");
  }
  if (!reference) warnings.push(`Kıyas bandı yok: son ${REFERENCE_DAYS} günde ${DAY_CLASS_LABEL[cls]} günü verisi yetersiz.`);

  // Cümleler yalnız betimler; neden-sonuç iddiası yok
  const sentences: string[] = [];
  if (prices.hours > 0) {
    let s = `PTF ortalaması ${nf(prices.ptfMean!)} TL/MWh`;
    if (prices.smfMean !== null) s += `, SMF ${nf(prices.smfMean)}`;
    if (prices.spreadMean !== null) s += `; makas (ortalama |SMF − PTF|) ${nf(prices.spreadMean)} TL/MWh`;
    s += ".";
    if (vsReferencePct !== null) s += ` Son ${reference!.days} ${DAY_CLASS_LABEL[cls]} gününün ortancasına göre ${pctSigned(vsReferencePct)}.`;
    sentences.push(s);
    sentences.push(`En pahalı saat ${hh(prices.ptfMax!.hour)} (${nf(prices.ptfMax!.value)} TL/MWh), en ucuz ${hh(prices.ptfMin!.hour)} (${nf(prices.ptfMin!.value)}).`);
    if (prices.zeroHours > 0) sentences.push(`${prices.zeroHours} saatte PTF sıfır ya da sıfıra yakın (≤ ${nf(ZERO_PRICE_MAX)} TL/MWh).`);
  }
  if (direction.deficit + direction.balanced + direction.surplus > 0) {
    let s = `Sistem ${direction.deficit} saat enerji açığında, ${direction.surplus} saat enerji fazlasında`;
    if (direction.balanced > 0) s += `, ${direction.balanced} saat dengede`;
    sentences.push(`${s}.`);
  }
  if (netSummary.hours > 0 && netSummary.min && netSummary.max) {
    sentences.push(`Net yük en düşük ${hh(netSummary.min.hour)}'de ${gw(netSummary.min.value)}, en yüksek ${hh(netSummary.max.hour)}'de ${gw(netSummary.max.value)} (güneş planıyla; seviye yaklaşık).`);
  }
  if (netSummary.ramp) {
    const r = netSummary.ramp;
    sentences.push(
      r.definitions === 2
        ? `Akşam rampası: ${hh(r.fromHour)}–${hh(r.toHour)} arasında net yük yaklaşık ${gw(r.rise)} arttı (iki tanım arasında ${gw(r.low)}–${gw(r.high)}; saatte ortalama ${nf(r.perHour)} MW).`
        : `Akşam rampası: ${hh(r.fromHour)}–${hh(r.toHour)} arasında net yük ${gw(r.rise)} arttı (tek tanımla; saatte ortalama ${nf(r.perHour)} MW).`
    );
  }
  if (netSummary.max && prices.ptfMax && Math.abs(prices.ptfMax.hour - netSummary.max.hour) <= 1) {
    sentences.push(`PTF'nin en yüksek saati (${hh(prices.ptfMax.hour)}) net yükün en yüksek saatinin (${hh(netSummary.max.hour)}) en çok bir saat yakınında.`);
  }

  return {
    date,
    dayClass: cls,
    rows,
    mix: mixHours(system.rt, sunPlan),
    reference,
    prices,
    direction,
    net: netSummary,
    sunPlan: { ratio: sunRatio, baseline: sunBaseline, suspect },
    importExportMean: ie.length ? mean(ie) : null,
    coverage,
    sentences,
    warnings,
  };
}

/** Karma serilerini 24 saatlik dilimlere çevirmek için: yıl serisinden günün dilimi (başlangıç saat sırası `from`) */
export function daySlice(series: ReadonlyArray<number | null>, from: number): Series24 {
  return Array.from({ length: HOURS }, (_, h) => series[from + h] ?? null);
}

export const emptyRt = (): Record<SystemSource, Series24> =>
  Object.fromEntries(SYSTEM_SOURCES.map((s) => [s, Array<number | null>(HOURS).fill(null)])) as Record<SystemSource, Series24>;

/** Yıl belgesinden günün 24 saatlik dilimleri; belge ya da seri yoksa (eski biçim) o seri null */
export function systemDay(doc: SystemYear | null, date: string): DailySystem {
  const empty = (): Series24 => Array(HOURS).fill(null);
  const rt = emptyRt();
  if (!doc) return { consumption: empty(), rt, rtImportExport: empty(), kgupSun: empty(), netInstruction: empty(), upDelivered: empty(), downDelivered: empty() };
  const from = (Date.parse(`${date}T00:00:00Z`) - Date.parse(doc.start)) / 3_600_000;
  const slice = (s: ReadonlyArray<number | null> | undefined) => (s ? daySlice(s, from) : empty());
  if (doc.rt) for (const src of SYSTEM_SOURCES as readonly SystemSource[]) rt[src] = slice(doc.rt[src]);
  return {
    consumption: slice(doc.consumption),
    rt,
    rtImportExport: slice(doc.rtImportExport),
    kgupSun: slice(doc.kgup?.sun),
    netInstruction: slice(doc.netInstruction),
    upDelivered: slice(doc.upDelivered),
    downDelivered: slice(doc.downDelivered),
  };
}

/** Yıl belgesinde gerçek zamanlı üretimi olan son gün ("YYYY-AA-GG"); yoksa null */
export function lastSystemDay(doc: SystemYear | null): string | null {
  const wind = doc?.rt?.wind;
  if (!doc || !wind) return null;
  for (let i = wind.length - 1; i >= 0; i--) {
    if (wind[i] !== null) return new Date(Date.parse(doc.start) + Math.floor(i / HOURS) * 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}
