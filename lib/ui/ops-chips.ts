/**
 * TR-Energy Analyst - üst şeritteki kayıt rozetleri (saf, I/O yok): yarının PTF, güneş ve rüzgâr kayıtları
 *
 * Kayıt yazılmışsa yeşil (kesimden sonra yazıldıysa sarı); yazılmamışsa beklenen saate kadar nötr "bekleniyor", saat geçtiyse
 * kırmızı "yok". Beklenen saatler sunucudaki zamanlayıcılardan (scripts/server/systemd): güneş 09:30 ve 11:00, rüzgâr 10:00 ve
 * 11:30, PTF 12:03 (hesap ~2 dk).
 */

import type { ForecastLogSummary, PtfRecordSummary } from "@/lib/services/ops-status";

export type ChipTone = "ok" | "warn" | "bad" | "wait";

export interface Chip {
  key: "ptf" | "solar" | "wind";
  text: string;
  tone: ChipTone;
  title: string;
}

/** Kaydın yazılmış olması beklenen en geç saat (Türkiye, dakika) */
export const EXPECTED_MINUTES = {
  solar: 11 * 60 + 15,
  wind: 11 * 60 + 45,
  ptf: 12 * 60 + 10,
} as const;

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function chip(
  key: Chip["key"],
  label: string,
  summary: { onTime: boolean; ok?: number; total?: number } | null,
  nowMinutes: number
): Chip {
  const expected = EXPECTED_MINUTES[key];
  if (summary) {
    const count = summary.total !== undefined ? ` ${summary.ok}/${summary.total}` : "";
    const partial = summary.total !== undefined && summary.ok! < summary.total!;
    const tone: ChipTone = !summary.onTime || partial ? "warn" : "ok";
    const why = [
      !summary.onTime ? "kesimden sonra yazıldı (skora girmez)" : null,
      partial ? "bazı santraller için tahmin kurulamadı" : null,
    ].filter(Boolean);
    return {
      key,
      text: `${label}${count}`,
      tone,
      title: why.length ? `${label} kaydı: ${why.join("; ")}` : `${label} kaydı yazıldı`,
    };
  }
  if (nowMinutes < expected)
    return {
      key,
      text: `${label} bekleniyor`,
      tone: "wait",
      title: `${label} kaydı yaklaşık ${hhmm(expected)}'e kadar yazılır`,
    };
  return {
    key,
    text: `${label} yok`,
    tone: "bad",
    title: `${label} kaydı yarın için henüz yazılmadı (beklenen ${hhmm(expected)})`,
  };
}

export function opsChips(
  status: {
    ptf: PtfRecordSummary | null;
    solar: ForecastLogSummary | null;
    wind: ForecastLogSummary | null;
  },
  nowMinutes: number
): Chip[] {
  return [
    chip("ptf", "PTF", status.ptf, nowMinutes),
    chip("solar", "Güneş", status.solar, nowMinutes),
    chip("wind", "Rüzgâr", status.wind, nowMinutes),
  ];
}
