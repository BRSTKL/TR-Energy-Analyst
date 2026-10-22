/**
 * TR-Energy Analyst - Sistem yönünü ne belirledi? (sektör karnesi, "Sistem yönü" sekmesi)
 *
 * Her saat, her kaynak türü için sapma = UEVM − son KGÜP (MW); tüketim için sapma = yük tahmini − gerçek zamanlı
 * tüketim, ayın ortanca farkı çıkarılarak (seviye kamu verisiyle ölçülemiyor; systemYearHours).
 * İşaret kuralı: artı sapma sistemi FAZLAYA iter (plandan fazla üretim, tahminden az tüketim), eksi sapma AÇIĞA.
 *
 * Kaynaklar iki gruba ayrılır:
 *   - Sürükleyenler (rüzgâr, güneş, akarsu, tüketim): sapmaları hava ve talepten gelir, talimatla yönetilmez.
 *   - Dengeleyenler (barajlı HES, doğalgaz, kömür, diğer): YAL/YAT talimatı alırlar; açıkta plandan fazla, fazlada az
 *     üretmeleri sebep değil cevaptır. Ayrı gösterilir, baskın kaynak seçiminde kullanılmaz.
 * Baskın kaynak: saatin yönünde (açıkta en eksi, fazlada en artı) en büyük sapmayı veren sürükleyen; hiçbiri o yönde
 * sapmadıysa "none" (yön başka bir şeyden: gün içi alım satım, ithalat / ihracat, dengeleyenlerin kendi sapması).
 * Uyum: sürükleyenlerin toplam sapmasının işareti saatin yönüyle aynı olan saatlerin payı, açık ve fazla saatlerde ayrı;
 * ekranda ikisinin ortalaması (dengeli isabet; her saate aynı yönü diyen tahmin %50). Ham isabet yanıltır: 2025'te saatlerin
 * analize giren saatlerin %67'si açıktı, "hep açık" demek %67 tutturuyordu, yöntemin ham isabeti %68 idi (dengeli %64).
 * İtme (push): sürükleyenin saatin yönünde verdiği sapma, yalnız o yöndeyse (açıkta max(0, −sapma)); ortalaması "açığın
 * kaç MW'ı tüketimden, kaç MW'ı rüzgârdan" sorusunu cevaplar. Ters yöndeki sapma (açıkta fazla üretim) itme sayılmaz.
 * Plan eksik günler: bir sürükleyenin günlük UEVM'si KGÜP'ünün PLAN_GAP_RATIO katını aşıyorsa o günün planı eksik
 * kayıtlıdır (lisanssız güneşin KGÜP'ü Ocak–Mart 2025'te ve 1–21 Mayıs 2026'da toplama girmemiş); gün bütünüyle
 * dışarıda bırakılır. 2025–2026'da günlük oranın %99'luk değeri rüzgârda 1,16, akarsuda 1,14: kural gerçek tahmin hatasını
 * silmez.
 *
 * SAF: I/O yok (veri lib/services/system-drivers.ts'te toplanır).
 */

import { SYSTEM_SOURCES, type SystemSource, type SystemYear } from "@/lib/pool/system-codec";

const HOUR = 3_600_000;

export const DRIVERS = ["wind", "sun", "river", "load"] as const;
export const BALANCERS = ["dam", "gas", "coal", "other"] as const;
export type Driver = (typeof DRIVERS)[number];
export type Balancer = (typeof BALANCERS)[number];
export type Group = Driver | Balancer;
export const GROUPS: readonly Group[] = [...DRIVERS, ...BALANCERS];

export type Direction = "DEFICIT" | "SURPLUS";

export interface DriverHour {
  /** Duvar saati (UTC alanlarında), ms */
  t: number;
  direction: Direction;
  /** Grup → sapma (MW); artı = fazlaya iter */
  dev: Record<Group, number>;
  /** Net teslim edilen talimat (MWh; artı = yukarı yönlü, açık) */
  net: number | null;
  /** Teslim edilen yukarı (YAL) ve aşağı (YAT, artı yazılır) talimat, MWh; yoksa null */
  up?: number | null;
  down?: number | null;
  /** Sapmaya geri eklenen olası kısıntı (karnedeki lisanslı santrallerin plansız kaybı, MWh); düzeltme yoksa yok */
  curtailed?: { wind: number; sun: number; river: number };
}

export type Dominant = Driver | "none";
export const DOMINANTS: readonly Dominant[] = [...DRIVERS, "none"];

export interface DirectionSide {
  hours: number;
  /** Grup → bu yöndeki saatlerde ortalama sapma (MW) */
  meanDev: Record<Group, number>;
  /** Baskın kaynak → saat sayısı */
  dominant: Record<Dominant, number>;
  /** Sürükleyen → bu yöne ortalama itme (MW, ≥ 0) */
  push: Record<Driver, number>;
  /** Bu yöndeki saatlerde ortalama teslim edilen talimat, MW (YAL ve YAT ayrı, ikisi de artı); verisi olan saatlerle */
  instructed: { up: number; down: number } | null;
  /** Bu yöndeki saatlerde sapmaya geri eklenen ortalama olası kısıntı, MW */
  curtailed: { wind: number; sun: number; river: number };
}

export interface DriverSummary {
  hours: number;
  deficit: DirectionSide;
  surplus: DirectionSide;
  /** Sürükleyenlerin toplam sapması saatin yönünü gösteriyor: saatlerin yüzdesi (ham isabet; tek başına yanıltıcı) */
  agreementPct: number | null;
  /** Aynısı yalnız açık saatlerde ve yalnız fazla saatlerde */
  deficitAgreementPct: number | null;
  surplusAgreementPct: number | null;
  /** İkisinin ortalaması (dengeli isabet); rastgele / tek yönlü tahmin %50. İki yönden biri yoksa null */
  balancedAgreementPct: number | null;
  /** Sürükleyenlerin toplam sapması ile net talimat arasındaki korelasyon (beklenen: eksi; açıkta yukarı talimat) */
  netCorrelation: number | null;
}

export interface MonthDrivers extends DriverSummary {
  /** "YYYY-AA" */
  month: string;
}

export interface HourOfDayDrivers {
  hour: number;
  deficitHours: number;
  surplusHours: number;
  dominant: { deficit: Record<Dominant, number>; surplus: Record<Dominant, number> };
  /** Sürükleyen → o saatteki açık (fazla) saatlerde ortalama itme, MW */
  push: { deficit: Record<Driver, number>; surplus: Record<Driver, number> };
}

const zeros = <K extends string>(keys: readonly K[]): Record<K, number> => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** Saatin yönünde en büyük sapmayı veren sürükleyen; o yönde sapan yoksa "none" */
export function dominantDriver(h: DriverHour): Dominant {
  const sign = h.direction === "DEFICIT" ? -1 : 1;
  let best: Dominant = "none";
  let bestPush = 0;
  for (const d of DRIVERS) {
    const push = h.dev[d] * sign;
    if (push > bestPush) {
      best = d;
      bestPush = push;
    }
  }
  return best;
}

const driversSum = (h: DriverHour) => DRIVERS.reduce((s, d) => s + h.dev[d], 0);

function correlation(xs: number[], ys: number[]): number | null {
  if (xs.length < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

function side(hours: DriverHour[]): DirectionSide {
  const meanDev = zeros(GROUPS);
  const dominant = zeros(DOMINANTS);
  const push = zeros(DRIVERS);
  let up = 0;
  let down = 0;
  let withInstr = 0;
  const curtailed = { wind: 0, sun: 0, river: 0 };
  for (const h of hours) {
    const sign = h.direction === "DEFICIT" ? -1 : 1;
    for (const g of GROUPS) meanDev[g] += h.dev[g];
    for (const d of DRIVERS) push[d] += Math.max(0, h.dev[d] * sign);
    if (h.curtailed) {
      curtailed.wind += h.curtailed.wind;
      curtailed.sun += h.curtailed.sun;
      curtailed.river += h.curtailed.river;
    }
    if (h.up != null && h.down != null) {
      up += h.up;
      down += h.down;
      withInstr++;
    }
    dominant[dominantDriver(h)]++;
  }
  if (hours.length) {
    for (const g of GROUPS) meanDev[g] /= hours.length;
    for (const d of DRIVERS) push[d] /= hours.length;
    curtailed.wind /= hours.length;
    curtailed.sun /= hours.length;
    curtailed.river /= hours.length;
  }
  return { hours: hours.length, meanDev, dominant, push, instructed: withInstr ? { up: up / withInstr, down: down / withInstr } : null, curtailed };
}

export function summarizeDrivers(hours: DriverHour[]): DriverSummary {
  const deficit = hours.filter((h) => h.direction === "DEFICIT");
  const surplus = hours.filter((h) => h.direction === "SURPLUS");
  const hitDeficit = deficit.filter((h) => driversSum(h) < 0).length;
  const hitSurplus = surplus.filter((h) => driversSum(h) >= 0).length;
  const deficitAgreementPct = deficit.length ? (hitDeficit / deficit.length) * 100 : null;
  const surplusAgreementPct = surplus.length ? (hitSurplus / surplus.length) * 100 : null;
  const withNet = hours.filter((h) => h.net !== null);
  return {
    hours: hours.length,
    deficit: side(deficit),
    surplus: side(surplus),
    agreementPct: hours.length ? ((hitDeficit + hitSurplus) / hours.length) * 100 : null,
    deficitAgreementPct,
    surplusAgreementPct,
    balancedAgreementPct: deficitAgreementPct !== null && surplusAgreementPct !== null ? (deficitAgreementPct + surplusAgreementPct) / 2 : null,
    netCorrelation: correlation(
      withNet.map(driversSum),
      withNet.map((h) => h.net!)
    ),
  };
}

const monthKey = (t: number) => new Date(t).toISOString().slice(0, 7);

/** Ay ay özet, ay sırasıyla */
export function monthlyDrivers(hours: DriverHour[]): MonthDrivers[] {
  const by = new Map<string, DriverHour[]>();
  for (const h of hours) {
    const k = monthKey(h.t);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(h);
  }
  return Array.from(by.keys())
    .sort()
    .map((month) => ({ month, ...summarizeDrivers(by.get(month)!) }));
}

/** Günün saatine göre (duvar saati 0–23) yön, baskın kaynak sayıları ve ortalama itme */
export function hourOfDayDrivers(hours: DriverHour[]): HourOfDayDrivers[] {
  const buckets = Array.from({ length: 24 }, () => [] as DriverHour[]);
  for (const h of hours) buckets[new Date(h.t).getUTCHours()].push(h);
  return buckets.map((b, hour) => {
    const deficit = side(b.filter((h) => h.direction === "DEFICIT"));
    const surplus = side(b.filter((h) => h.direction === "SURPLUS"));
    return {
      hour,
      deficitHours: deficit.hours,
      surplusHours: surplus.hours,
      dominant: { deficit: deficit.dominant, surplus: surplus.dominant },
      push: { deficit: deficit.push, surplus: surplus.push },
    };
  });
}

/** Grup → havuzdaki kaynaklar (tüketim ayrı) */
const GROUP_SOURCES: Record<Exclude<Group, "load">, SystemSource[]> = {
  wind: ["wind"],
  sun: ["sun"],
  river: ["river"],
  dam: ["dam"],
  gas: ["naturalGas"],
  coal: ["lignite", "importedCoal", "stoneCoal"],
  other: ["fueloil", "geothermal", "biomass", "naphtha", "other"],
};

/** Günlük UEVM bu kat KGÜP'ü aşarsa günün planı eksik kayıtlı sayılır */
export const PLAN_GAP_RATIO = 1.5;
const DRIVER_SOURCES: SystemSource[] = ["wind", "sun", "river"];

/** Bir sürükleyenin planı eksik kayıtlı günler ("YYYY-AA-GG" → kaynaklar) */
export function planGapDays(doc: SystemYear): Map<string, SystemSource[]> {
  const t0 = Date.parse(doc.start);
  const sums = new Map<string, Record<string, [number, number]>>();
  for (let i = 0; i < doc.lep.length; i++) {
    const day = new Date(t0 + i * HOUR).toISOString().slice(0, 10);
    for (const s of DRIVER_SOURCES) {
      const k = doc.kgup[s][i];
      const u = doc.uevm[s][i];
      if (k === null || u === null) continue;
      const row = sums.get(day) ?? {};
      const [sk, su] = row[s] ?? [0, 0];
      row[s] = [sk + k, su + u];
      sums.set(day, row);
    }
  }
  const out = new Map<string, SystemSource[]>();
  for (const [day, row] of sums) {
    const gaps = DRIVER_SOURCES.filter((s) => row[s] && row[s][1] > PLAN_GAP_RATIO * row[s][0]);
    if (gaps.length) out.set(day, gaps);
  }
  return out;
}

/** Ortanca (boş dizide 0) */
function median(values: number[]): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Havuzdaki yıl belgesinden saatler: yalnız yönü, yük tahmini, gerçek zamanlı tüketimi ve bütün kaynakların KGÜP'ü ile
 * UEVM'si olan, planı eksik kayıtlı olmayan günlerin saatleri.
 *
 * Tüketim sapması = (yük tahmini − gerçek zamanlı tüketim) − o ayın ortanca farkı. Yük tahmini ile kamuya açık iki tüketim
 * serisi aynı temelde değil: gerçek zamanlı tüketimle fark aydan aya −1,9 ile +0,8 GW, UEÇM ile 0 ile +2,3 GW arasında
 * gidip geliyor (20.10.2026). Seviye ölçülemediği için yalnız ayın içindeki saatlik sapma okunur. Gerçek zamanlı tüketim
 * UEÇM'den iyi: sistem yönünde dengeli isabet %64 / %64 (UEÇM %59 / %61, 2025 / 2026), net talimatla ilişkisi daha güçlü;
 * muhtemelen UEÇM'de saatlik sayacı olmayanlar profille dağıtıldığı için. Ayın farkını çıkarmak isabeti değiştirmez (ham %64 / %65).
 */
export function systemYearHours(
  doc: SystemYear,
  directions: Map<number, "DEFICIT" | "SURPLUS">,
  gaps = planGapDays(doc),
  /** Saat sırasıyla olası kısıntı (MWh; lib/analysis/hourly-loss.ts): verilirse rüzgâr / güneş sapmasına geri eklenir */
  curtailment?: { wind?: number[]; sun?: number[]; river?: number[] }
): DriverHour[] {
  const t0 = Date.parse(doc.start);
  const out: DriverHour[] = [];
  for (let i = 0; i < doc.lep.length; i++) {
    const t = t0 + i * HOUR;
    if (gaps.has(new Date(t).toISOString().slice(0, 10))) continue;
    const direction = directions.get(t);
    const lep = doc.lep[i];
    const cons = doc.consumption[i];
    if (!direction || lep === null || cons === null) continue;
    if (SYSTEM_SOURCES.some((s) => doc.kgup[s][i] === null || doc.uevm[s][i] === null)) continue;
    const dev = { load: lep - cons } as Record<Group, number>;
    for (const [g, sources] of Object.entries(GROUP_SOURCES) as Array<[Exclude<Group, "load">, SystemSource[]]>) {
      dev[g] = sources.reduce((sum, s) => sum + doc.uevm[s][i]! - doc.kgup[s][i]!, 0);
    }
    const dn = doc.downDelivered[i];
    const hour: DriverHour = { t, direction, dev, net: doc.netInstruction[i], up: doc.upDelivered[i], down: dn === null ? null : Math.abs(dn) };
    if (curtailment) {
      // Kısılan santral planından az üretmiş görünür: kaybı geri eklemek sapmayı tahmin hatasına indirir
      hour.curtailed = { wind: curtailment.wind?.[i] ?? 0, sun: curtailment.sun?.[i] ?? 0, river: curtailment.river?.[i] ?? 0 };
      dev.wind += hour.curtailed.wind;
      dev.sun += hour.curtailed.sun;
      dev.river += hour.curtailed.river;
    }
    out.push(hour);
  }
  // Tüketim: ayın ortanca farkı çıkarılır (yukarıda)
  const byMonth = new Map<string, number[]>();
  for (const h of out) {
    const k = new Date(h.t).toISOString().slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(h.dev.load);
  }
  const bias = new Map(Array.from(byMonth, ([k, v]) => [k, median(v)]));
  for (const h of out) h.dev.load -= bias.get(new Date(h.t).toISOString().slice(0, 7))!;
  return out;
}
