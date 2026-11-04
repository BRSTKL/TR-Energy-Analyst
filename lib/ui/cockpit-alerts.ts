/**
 * TR-Energy Analyst - Bugün kokpitinin uyarı listesi (saf, I/O yok)
 *
 * Girdiler: yarının kayıt durumu (ops-status), canlı piyasa notları ve projelerin veri boşlukları. Kural: eksik kayıt kırmızı,
 * kısmi ya da geç kayıt ve limite yakın saat sarı, bilgi notu gri. Alınamayan veri sessizce atlanmaz, uyarı olarak yazılır.
 */

import type { OpsStatus } from "@/lib/services/ops-status";
import { opsChips } from "./ops-chips";

export type AlertTone = "bad" | "warn" | "info";

export interface CockpitAlert {
  id: string;
  tone: AlertTone;
  text: string;
  href?: string;
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** [17, 18, 19, 22] → "17:00–19:00, 22:00" */
export function formatHours(hours: number[]): string {
  const s = [...new Set(hours)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${hh(s[i])}–${hh(s[j])}` : hh(s[i]));
    i = j + 1;
  }
  return out.join(", ");
}

export interface AlertInput {
  status: OpsStatus | null;
  /** Kayıt durumu istenip alınamadıysa nedeni */
  statusError: string | null;
  nowMinutes: number;
  /** Canlı piyasanın alınamayan serileri (live-day notları) */
  liveNotes: string[];
  /** Veri boşluğu olan projeler */
  projectGaps: Array<{ id: string; name: string; gaps: number }>;
  /** Üretim tahmini bağlantısı (son proje ya da proje listesi) */
  forecastHref: string;
  /**
   * Yarının açıklanmış PTF'si (14:00 sonrası, tomorrow-view satırları; level: limitte / limite yakın / sıfır). Verilirse
   * limit ve ucuz saat uyarıları tahminden değil açıklanan fiyattan yazılır.
   */
  announced?: { date: string; hours: Array<{ hour: number; ptf: number | null; level: "cap" | "near" | "zero" | null }> } | null;
}

const ORDER: Record<AlertTone, number> = { bad: 0, warn: 1, info: 2 };

export function buildAlerts(input: AlertInput): CockpitAlert[] {
  const out: CockpitAlert[] = [];
  const { status } = input;
  if (input.statusError)
    out.push({
      id: "status-error",
      tone: "warn",
      text: `Yarının kayıt durumu alınamadı: ${input.statusError}`,
    });
  if (status) {
    for (const c of opsChips(status, input.nowMinutes)) {
      if (c.tone !== "bad" && c.tone !== "warn") continue;
      out.push({
        id: `chip-${c.key}`,
        tone: c.tone === "bad" ? "bad" : "warn",
        text: c.title,
        href: c.key === "ptf" ? "/market/teklif" : input.forecastHref,
      });
    }
    for (const e of status.errors)
      out.push({ id: `read-${e}`, tone: "warn", text: `Kayıt okunamadı (${e})` });
    const p = status.ptf;
    const a = input.announced && (!p || input.announced.date === p.targetDate) ? input.announced : null;
    if (a) {
      // Fiyat açıklandı: uyarı açıklanan değerden (tahmin artık kıyas sayısıdır)
      const cap = a.hours.filter((h) => h.level === "cap").map((h) => h.hour);
      const near = a.hours.filter((h) => h.level === "near").map((h) => h.hour);
      if (cap.length || near.length)
        out.push({
          id: "near-cap",
          tone: "warn",
          text: `Yarının açıklanan PTF'si: ${[cap.length ? `${cap.length} saat limitte` : "", near.length ? `${near.length} saat limite yakın` : ""].filter(Boolean).join(", ")} (${formatHours([...cap, ...near])}).`,
          href: "/market/gunluk?sekme=yarin",
        });
      const priced = a.hours.filter((h): h is { hour: number; ptf: number; level: typeof h.level } => h.ptf !== null);
      const min = priced.reduce<(typeof priced)[number] | null>((m, h) => (m === null || h.ptf < m.ptf ? h : m), null);
      if (min && min.ptf < 300)
        out.push({
          id: "near-zero",
          tone: "info",
          text: `Yarının açıklanan PTF'sinde en ucuz saat ${hh(min.hour)} (${Math.round(min.ptf).toLocaleString("tr-TR")} TL/MWh).`,
          href: "/market/gunluk?sekme=yarin",
        });
    } else {
      if (p && p.nearCapHours.length)
        out.push({
          id: "near-cap",
          tone: "warn",
          text: `Yarın ${p.nearCapHours.length} saat fiyat limitine yakın tahmin ediliyor (${formatHours(p.nearCapHours)}).`,
          href: "/market/teklif",
        });
      if (p && p.min.value < 300)
        out.push({
          id: "near-zero",
          tone: "info",
          text: `Yarın en ucuz saat ${hh(p.min.hour)} (${Math.round(p.min.value).toLocaleString("tr-TR")} TL/MWh): sıfır fiyat riski.`,
          href: "/market/teklif",
        });
    }
  }
  for (const [i, n] of input.liveNotes.slice(0, 3).entries())
    out.push({ id: `live-${i}`, tone: "warn", text: n, href: "/market/gunluk" });
  for (const g of input.projectGaps)
    out.push({
      id: `gap-${g.id}`,
      tone: "info",
      text: `${g.name}: ${g.gaps} eksik veri.`,
      href: `/projects/${g.id}/results`,
    });
  return out.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
}
