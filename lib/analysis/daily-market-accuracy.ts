/**
 * TR-Energy Analyst - Günlük panonun ölçülmüş doğruluğu (Aşama 24)
 *
 * Panodaki net yük ve akşam rampası, gerçek zamanlı ölçümlerle ve KGÜP planıyla hesaplanır (lib/analysis/daily-market.ts).
 * Resmî sayaç üretimi (UEVM) haftalarca sonra yayımlandığı için doğruluk ancak sonradan ölçülür: bir ayın bütün günleri için
 * panonun iki tanımı (tüketim taraflı A, arz taraflı B) ve ortalamaları, "referans" net yükle karşılaştırılır:
 *   referans = UEVM toplamı − UEVM rüzgâr − UEVM güneş + gerçek zamanlı net ithalat.
 * Referans da bir tanımdır (şebeke enjeksiyonu), mutlak gerçek değil; ölçüm tanımlar arası sapmayı ve rampa hatasını verir.
 * Panonun gerçek davranışı da ölçülür (`rampPanel`): KGÜP güneş planı eksik görünen günde (sunPlanSuspect) rampa yalnız B, diğer
 * günlerde A ve B'nin ortalaması. Yalnız 24 saati A, B ve referansıyla tam olan günler sayılır; en az MIN_ACCURACY_DAYS gün yoksa ay raporlanmaz.
 * SAF: I/O yok (betik scripts/analysis/daily-market-accuracy.mts).
 */

import { SYSTEM_SOURCES, type SystemYear } from "@/lib/pool/system-codec";
import { combinedRamp, daySlice, eveningRamp, netLoad, sunPlanBaselineFor, sunPlanRatio, sunPlanSuspect, supplyNetLoad, systemDay, type Series24 } from "./daily-market";

export const MIN_ACCURACY_DAYS = 5;

export interface ErrorStats {
  /** Ortalama hata (panonun değeri − referans) */
  bias: number;
  /** Ortalama mutlak hata */
  mae: number;
  /** Mutlak hatanın %90'ıncı yüzdeliği */
  p90: number;
}

export interface RampErrorStats {
  bias: number;
  medianAbs: number;
  p90: number;
}

export interface MonthAccuracy {
  /** "YYYY-AA" */
  month: string;
  /** Tam sayılan gün ve saat sayısı */
  days: number;
  hours: number;
  /** KGÜP güneşi − UEVM güneşi (MW) */
  sunPlan: ErrorStats;
  /** Gerçek zamanlı rüzgâr − UEVM rüzgâr (MW) */
  wind: ErrorStats;
  /** Net yük, tüketim taraflı (A) ve arz taraflı (B) − referans (MW); seviye farkı tanımlardan gelir */
  netA: ErrorStats;
  netB: ErrorStats;
  /** Referans akşam rampasının ortalaması (MW) */
  truthRampMean: number;
  /** Akşam rampası hatası: A, B ve ikisinin ortalaması (MW) */
  rampA: RampErrorStats;
  rampB: RampErrorStats;
  rampMean: RampErrorStats;
  /** Panonun gösterdiği rampa: plan eksik görünen günde yalnız B, diğer günlerde A ve B'nin ortalaması */
  rampPanel: RampErrorStats;
  /** Plan eksik görünen (ölçülen) gün sayısı */
  suspectDays: number;
  /** Referans rampanın [A, B] aralığında kaldığı günlerin payı (0–1) ve aralığın medyan genişliği (MW) */
  rampInRange: number;
  rampRangeWidthMedian: number;
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const absSorted = (a: number[]) => a.map(Math.abs).sort((x, y) => x - y);
const p90Of = (a: number[]) => absSorted(a)[Math.floor(a.length * 0.9)];
const medianOf = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const errorStats = (e: number[]): ErrorStats => ({ bias: mean(e), mae: mean(e.map(Math.abs)), p90: p90Of(e) });
const rampStats = (e: number[]): RampErrorStats => ({ bias: mean(e), medianAbs: medianOf(e.map(Math.abs)), p90: p90Of(e) });

const complete = (s: Series24) => s.every((v) => v !== null);

/** Bir ayın doğruluğu; yeterli tam gün (UEVM dahil) yoksa null */
export function monthAccuracy(doc: SystemYear, month: number): MonthAccuracy | null {
  const mm = String(month).padStart(2, "0");
  const daysInMonth = new Date(Date.UTC(doc.year, month, 0)).getUTCDate();
  const sunErr: number[] = [];
  const windErr: number[] = [];
  const errA: number[] = [];
  const errB: number[] = [];
  const truthRamps: number[] = [];
  const rampErr = { a: [] as number[], b: [] as number[], mean: [] as number[], panel: [] as number[] };
  let suspectDays = 0;
  const widths: number[] = [];
  let inRange = 0;
  let days = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${doc.year}-${mm}-${String(d).padStart(2, "0")}`;
    const from = (Date.parse(`${date}T00:00:00Z`) - Date.parse(doc.start)) / 3_600_000;
    const sys = systemDay(doc, date);
    const uevm = Object.fromEntries(SYSTEM_SOURCES.map((s) => [s, daySlice(doc.uevm?.[s] ?? [], from)])) as Record<(typeof SYSTEM_SOURCES)[number], Series24>;
    const truth: Series24 = Array.from({ length: 24 }, (_, h) => {
      const ie = sys.rtImportExport[h];
      if (ie === null) return null;
      let total = 0;
      for (const s of SYSTEM_SOURCES) {
        const v = uevm[s][h];
        if (v === null) return null;
        total += v;
      }
      return total - uevm.wind[h]! - uevm.sun[h]! + ie;
    });
    const a = netLoad(sys.consumption, sys.rt.wind, sys.kgupSun);
    const b = supplyNetLoad(sys.rt, sys.rtImportExport);
    if (!complete(truth) || !complete(a) || !complete(b)) continue;
    const rTruth = eveningRamp(truth);
    const rA = eveningRamp(a);
    const rB = eveningRamp(b);
    if (!rTruth || !rA || !rB) continue;

    days++;
    for (let h = 0; h < 24; h++) {
      errA.push(a[h]! - truth[h]!);
      errB.push(b[h]! - truth[h]!);
      sunErr.push(sys.kgupSun[h]! - uevm.sun[h]!);
      windErr.push(sys.rt.wind[h]! - uevm.wind[h]!);
    }
    const mid = combinedRamp(a, b)!;
    const suspect = sunPlanSuspect(sunPlanRatio(sys.kgupSun, sys.rt.sun), sunPlanBaselineFor(doc, date));
    if (suspect) suspectDays++;
    truthRamps.push(rTruth.rise);
    rampErr.a.push(rA.rise - rTruth.rise);
    rampErr.b.push(rB.rise - rTruth.rise);
    rampErr.mean.push(mid.rise - rTruth.rise);
    rampErr.panel.push((suspect ? rB.rise : mid.rise) - rTruth.rise);
    widths.push(mid.high - mid.low);
    if (mid.low <= rTruth.rise && rTruth.rise <= mid.high) inRange++;
  }
  if (days < MIN_ACCURACY_DAYS) return null;
  return {
    month: `${doc.year}-${mm}`,
    days,
    hours: days * 24,
    sunPlan: errorStats(sunErr),
    wind: errorStats(windErr),
    netA: errorStats(errA),
    netB: errorStats(errB),
    truthRampMean: mean(truthRamps),
    rampA: rampStats(rampErr.a),
    rampB: rampStats(rampErr.b),
    rampMean: rampStats(rampErr.mean),
    rampPanel: rampStats(rampErr.panel),
    suspectDays,
    rampInRange: inRange / days,
    rampRangeWidthMedian: medianOf(widths),
  };
}
