/**
 * TR-Energy Analyst - Yarın görünümü (PTF açıklandıktan sonra, genelde 13:00–14:00)
 *
 * Yarının açıklanmış PTF'si, yük tahmini ve GÖP eşleşme hacmi, aynı sınıftaki son günlerin ortancasıyla ve fiyat limitiyle
 * kıyaslanır. FİYAT TAHMİNİ DEĞİLDİR: PTF zaten açıklanmıştır; görünüm "bu fiyat benzer günlere ve yük seviyesine göre nerede?"
 * sorusunu yanıtlar. Ölçüm (27.10.2026, 626 gün, doğrulanmış PTF): yük tahmini tek başına benzer gün ortancasına göre fiyat
 * hatasını yalnız %2,3 azalttı (günlerin %49,7'sinde daha iyi); gerçekleşen rüzgâr ve güneş planıyla net yük %12 (günlerin %61'i).
 * Yarının rüzgâr ve güneşi 14:00'te bilinmediği için net yük yarın için hesaplanmaz (scripts/analysis/ptf-load-evidence.mts).
 * SAF: I/O yok.
 */

import { dayClass, DAY_CLASS_LABEL, referenceBand, type DayClass } from "./daily-market";
import { hourLevel, type HourLevel, type PriceLimit } from "./price-limit";
import { nf } from "@/lib/format";

export type Series24 = Array<number | null>;
const HOURS = 24;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const range = (a: number, b: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => a + i);
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}%${nf(Math.abs(v))}`;

export interface TomorrowInput {
  /** YYYY-AA-GG */
  date: string;
  ptf: Series24;
  lep: Series24;
  /** GÖP eşleşen alış miktarı (MWh) */
  gopVolume: Series24;
  ptfHistory: Map<string, Series24>;
  lepHistory: Map<string, Series24>;
  limit: PriceLimit | null;
}

export type Position = "above" | "below" | "within" | null;

export interface TomorrowRow {
  hour: number;
  ptf: number | null;
  refLow: number | null;
  refMedian: number | null;
  refHigh: number | null;
  position: Position;
  level: HourLevel;
  lep: number | null;
  lepRef: number | null;
  lepVsRefPct: number | null;
  gopVolume: number | null;
}

export interface TomorrowView {
  date: string;
  dayClass: DayClass;
  rows: TomorrowRow[];
  published: { ptf: boolean; lep: boolean };
  ptf: {
    hours: number;
    mean: number | null;
    vsReferencePct: number | null;
    max: { hour: number; value: number } | null;
    min: { hour: number; value: number } | null;
    zeroHours: number;
    capHours: number;
    nearHours: number;
    hoursAbove: number;
    hoursBelow: number;
    /** Ortalama PTF(18–21) − PTF(11–14); referans aynı farkın kıyas ortancasından */
    eveningMinusNoon: number | null;
    refEveningMinusNoon: number | null;
  };
  load: {
    hours: number;
    peak: { hour: number; value: number } | null;
    peakRef: number | null;
    meanVsRefPct: number | null;
  };
  sentences: string[];
  warnings: string[];
}

function extreme(
  series: Series24,
  kind: "max" | "min"
): { hour: number; value: number } | null {
  let best: { hour: number; value: number } | null = null;
  series.forEach((v, hour) => {
    if (v === null) return;
    if (best === null || (kind === "max" ? v > best.value : v < best.value))
      best = { hour, value: v };
  });
  return best;
}

const spread = (s: Series24) => {
  const e = range(18, 21).map((h) => s[h]);
  const n = range(11, 14).map((h) => s[h]);
  return e.some((v) => v === null) || n.some((v) => v === null)
    ? null
    : mean(e as number[])! - mean(n as number[])!;
};

export function buildTomorrowView(input: TomorrowInput): TomorrowView {
  const { date, ptf, lep, gopVolume, limit } = input;
  const cls = dayClass(date);
  const priceRef = referenceBand(date, input.ptfHistory);
  const loadRef = referenceBand(date, input.lepHistory);

  const rows: TomorrowRow[] = Array.from({ length: HOURS }, (_, hour) => {
    const p = ptf[hour];
    const lo = priceRef?.low[hour] ?? null;
    const hi = priceRef?.high[hour] ?? null;
    const lRef = loadRef?.median[hour] ?? null;
    const l = lep[hour];
    return {
      hour,
      ptf: p,
      refLow: lo,
      refMedian: priceRef?.median[hour] ?? null,
      refHigh: hi,
      position:
        p === null || lo === null || hi === null
          ? null
          : p > hi
            ? "above"
            : p < lo
              ? "below"
              : "within",
      level: hourLevel(p, limit),
      lep: l,
      lepRef: lRef,
      lepVsRefPct: l !== null && lRef !== null && lRef > 0 ? (l / lRef - 1) * 100 : null,
      gopVolume: gopVolume[hour],
    };
  });

  const ptfs = rows.map((r) => r.ptf).filter((v): v is number => v !== null);
  const both = rows.filter((r) => r.ptf !== null && r.refMedian !== null);
  let vsReferencePct: number | null = null;
  if (both.length >= 20) {
    const refMean = mean(both.map((r) => r.refMedian!))!;
    if (refMean > 0)
      vsReferencePct = (mean(both.map((r) => r.ptf!))! / refMean - 1) * 100;
  }
  const ptfSummary: TomorrowView["ptf"] = {
    hours: ptfs.length,
    mean: mean(ptfs),
    vsReferencePct,
    max: extreme(ptf, "max"),
    min: extreme(ptf, "min"),
    zeroHours: rows.filter((r) => r.level === "zero").length,
    capHours: rows.filter((r) => r.level === "cap").length,
    nearHours: rows.filter((r) => r.level === "near").length,
    hoursAbove: rows.filter((r) => r.position === "above").length,
    hoursBelow: rows.filter((r) => r.position === "below").length,
    eveningMinusNoon: spread(ptf),
    refEveningMinusNoon: priceRef ? spread(priceRef.median) : null,
  };

  const lepVals = rows.filter((r) => r.lep !== null);
  const lepRel = rows.map((r) => r.lepVsRefPct).filter((v): v is number => v !== null);
  const load: TomorrowView["load"] = {
    hours: lepVals.length,
    peak: extreme(lep, "max"),
    peakRef:
      loadRef && lepVals.length
        ? Math.max(...loadRef.median.filter((v): v is number => v !== null))
        : null,
    meanVsRefPct: lepRel.length >= 20 ? mean(lepRel) : null,
  };

  const warnings: string[] = [];
  const published = { ptf: ptfs.length === HOURS, lep: lepVals.length >= 24 };
  if (ptfs.length === 0)
    warnings.push(
      "Yarının PTF'si henüz yayımlanmadı (gün öncesi piyasası sonuçları genelde 13:00–14:00 arasında açıklanır)."
    );
  else if (ptfs.length < HOURS) warnings.push(`Yarının PTF'si ${ptfs.length}/24 saat.`);
  if (lepVals.length === 0) warnings.push("Yarının yük tahmini henüz yayımlanmadı.");
  if (!priceRef)
    warnings.push(
      `Kıyas bandı yok: son günlerde ${DAY_CLASS_LABEL[cls]} günü verisi yetersiz.`
    );
  if (!limit)
    warnings.push("Fiyat limiti verideki platodan çıkarılamadı; limit uyarısı yok.");

  const s: string[] = [];
  if (ptfSummary.mean !== null) {
    let t = `Yarının PTF ortalaması ${nf(ptfSummary.mean)} TL/MWh`;
    if (vsReferencePct !== null)
      t += `; son ${priceRef!.days} ${DAY_CLASS_LABEL[cls]} gününün ortancasına göre ${pct(vsReferencePct)}`;
    s.push(`${t}.`);
    s.push(
      `En pahalı saat ${hh(ptfSummary.max!.hour)} (${nf(ptfSummary.max!.value)} TL/MWh), en ucuz ${hh(ptfSummary.min!.hour)} (${nf(ptfSummary.min!.value)}).` +
        (priceRef
          ? ` ${ptfSummary.hoursAbove} saat referans bandının üstünde, ${ptfSummary.hoursBelow} saat altında.`
          : "")
    );
    if (ptfSummary.eveningMinusNoon !== null) {
      s.push(
        `Akşam (18–21) ile öğle (11–14) arasındaki PTF farkı ${nf(ptfSummary.eveningMinusNoon)} TL/MWh` +
          (ptfSummary.refEveningMinusNoon !== null
            ? ` (kıyas ortancasında ${nf(ptfSummary.refEveningMinusNoon)}).`
            : ".")
      );
    }
    if (limit && (ptfSummary.capHours || ptfSummary.nearHours)) {
      s.push(
        `${ptfSummary.capHours} saat fiyat limitinde (${nf(limit.cap)} TL/MWh, veriden çıkarıldı), ${ptfSummary.nearHours} saat limite yakın (≥ %90). Limitte açık kalan üretici için dengesizlik fiyatı da azami fiyat limiti kuralına döner.`
      );
    }
    if (ptfSummary.zeroHours)
      s.push(`${ptfSummary.zeroHours} saat sıfır fiyatlı (≤ 1 TL/MWh).`);
  }
  if (load.peak) {
    s.push(
      `Yük tahmini zirvesi ${hh(load.peak.hour)}, ${nf(load.peak.value / 1000, 1)} GW` +
        (load.meanVsRefPct !== null
          ? `; ortalaması kıyas ortancasına göre ${pct(load.meanVsRefPct)}.`
          : ".")
    );
  }
  if (s.length)
    s.push(
      "Bu görünüm fiyat tahmini değildir: PTF zaten açıklandı. Yük tahmini tek başına fiyatı benzer gün ortancasından iyi öngörmüyor (yöntem sayfasındaki ölçüm)."
    );

  return {
    date,
    dayClass: cls,
    rows,
    published,
    ptf: ptfSummary,
    load,
    sentences: s,
    warnings,
  };
}
