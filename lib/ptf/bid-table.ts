/**
 * TR-Energy Analyst - teklif masası: saat saat karar tablosu (saf, I/O yok)
 *
 * Her saat için PTF tahmini ve aralığı, portföyün üretim tahmini ve fiyat riski. Teklif miktarı önerisi VERİLMEZ (kendi KGÜP,
 * pozisyon ve sözleşme verisi yok); tablo yalnız tahmini ve riski gösterir. Risk: fiyat limite yakın (tahmin ya da aralığın üstü)
 * ya da sıfıra yakın (aralığın altı) olan saatler ("Riskli saat" sayısına geniş aralık girmez, o yalnız bilgi); lib/analysis/price-limit.ts ile aynı eşikler.
 */

import { hourLevel, LEVEL_LABEL, type PriceLimit } from "@/lib/analysis/price-limit";

export interface BidPtfHour {
  hour: number;
  p50: number;
  q10: number | null;
  q90: number | null;
}

export type BidRisk = "cap" | "near" | "zero" | "wide" | null;

export interface BidRow {
  hour: number;
  label: string;
  ptf: number;
  low: number | null;
  high: number | null;
  /** Portföy üretim tahmini (MWh); üretim kaydı yoksa null */
  mwh: number | null;
  risk: BidRisk;
  note: string;
}

/** Aralık genişliği tahminin bu katından fazlaysa "geniş" (%80 aralık zaten tahminin ±%25'i kadar gezer; 0,9 yalnız alışılmışın çok üstünü yakalar) */
const WIDE_RATIO = 0.9;

export const RISK_LABEL: Record<Exclude<BidRisk, null>, string> = {
  ...LEVEL_LABEL,
  wide: "belirsiz (aralık geniş)",
};

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Bir saatin riski: tahmin limitte / limite yakın / sıfır; değilse aralık üst ucu limitte ya da aralık çok geniş */
export function hourRisk(h: BidPtfHour, limit: PriceLimit | null): { risk: BidRisk; note: string } {
  const own = hourLevel(h.p50, limit);
  if (own) return { risk: own, note: `Tahmin ${LEVEL_LABEL[own]}` };
  const upper = hourLevel(h.q90, limit);
  if (upper === "cap" || upper === "near")
    return { risk: "near", note: "Üst aralık limite ulaşıyor" };
  if (h.q10 !== null && h.q10 <= 0.5 && h.p50 > 0.5)
    return { risk: "zero", note: "Alt aralık sıfıra iniyor" };
  if (h.q10 !== null && h.q90 !== null && h.p50 > 0 && (h.q90 - h.q10) / h.p50 > WIDE_RATIO)
    return { risk: "wide", note: "Aralık geniş" };
  return { risk: null, note: "" };
}

/** 24 satır; `production` verilmezse üretim sütunu boş. PTF saatleri 0–23 olmalı */
export function buildBidRows(
  ptf: BidPtfHour[],
  production: number[] | null,
  limit: PriceLimit | null
): BidRow[] {
  return [...ptf]
    .sort((a, b) => a.hour - b.hour)
    .map((h) => {
      const { risk, note } = hourRisk(h, limit);
      return {
        hour: h.hour,
        label: hh(h.hour),
        ptf: h.p50,
        low: h.q10,
        high: h.q90,
        mwh: production && Number.isFinite(production[h.hour]) ? production[h.hour] : null,
        risk,
        note,
      };
    });
}

export function bidTotals(rows: BidRow[]): {
  mwh: number | null;
  /** Üretim ağırlıklı ortalama PTF (TL/MWh); üretim yoksa null */
  weightedPtf: number | null;
  meanPtf: number;
  riskHours: number;
} {
  const withMwh = rows.filter((r) => r.mwh !== null);
  const mwh = withMwh.length ? withMwh.reduce((s, r) => s + (r.mwh as number), 0) : null;
  const weightedPtf =
    mwh && mwh > 0 ? withMwh.reduce((s, r) => s + (r.mwh as number) * r.ptf, 0) / mwh : null;
  return {
    mwh,
    weightedPtf,
    meanPtf: rows.length ? rows.reduce((s, r) => s + r.ptf, 0) / rows.length : 0,
    riskHours: rows.filter((r) => r.risk !== null && r.risk !== "wide").length,
  };
}

const num = (v: number | null, d: number) =>
  v === null ? "" : v.toFixed(d).replace(".", ",");

/** Excel'de çift tıkla açılır: noktalı virgül ayırıcı, virgüllü ondalık, UTF-8 BOM */
export function bidCsv(date: string, rows: BidRow[]): string {
  const head = ["Tarih", "Saat", "PTF tahmini (TL/MWh)", "Alt (TL/MWh)", "Üst (TL/MWh)", "Üretim tahmini (MWh)", "Risk"];
  const lines = rows.map((r) =>
    [
      date,
      r.label,
      num(r.ptf, 0),
      num(r.low, 0),
      num(r.high, 0),
      num(r.mwh, 2),
      r.risk ? RISK_LABEL[r.risk] : "",
    ].join(";")
  );
  return `﻿${[head.join(";"), ...lines].join("\r\n")}\r\n`;
}
