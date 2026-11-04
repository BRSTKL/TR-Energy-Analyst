/**
 * TR-Energy Analyst - Arıza izleme: bildirim listesi ve saatlik kapasite kaybı (SAF, I/O yok)
 *
 * Kaynak EPİAŞ piyasa mesaj sistemi bildirimleridir (havuz data/pool/umm). Bir bildirimin kaybı
 * max(0, işletmedeki güç − olay anındaki kapasite) MW; [başlangıç, bitiş) aralığında sürer (outage-capacity.ts ile aynı kural).
 * "Süren" = bildirilen başlangıç ≤ an < bildirilen bitiş. Bitiş çoğu zaman tahminidir ve sonradan değişebilir; bildirimlerde
 * yayım zamanı yok. Zamanlar duvar saati ms'idir (gerçek an + 3 saat, UTC alanlarında).
 */

import { wallClockMs } from "@/lib/analysis/outage-capacity";
import type { UmmMessage } from "@/lib/pool/umm-codec";

const HOUR = 3_600_000;

export interface OutageRow {
  id: number;
  uevcbId: number | null;
  plant: string;
  org: string | null;
  /** Duvar saati ms */
  startMs: number;
  endMs: number;
  /** Çıkan kapasite, MW */
  lossMw: number;
  /** İşletmedeki güç, MW */
  installedMw: number;
  /** Olay anındaki kapasite, MW */
  remainingMw: number;
  reason: string | null;
}

/** Geçerli bildirimler (zamanı geçerli, bitişi başlangıçtan sonra, kaybı > 0) ve atlananların sayısı. Kimliği aynı olan bir kez */
export function toOutageRows(messages: UmmMessage[]): { rows: OutageRow[]; skipped: number } {
  const rows: OutageRow[] = [];
  const seen = new Set<number>();
  let skipped = 0;
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const s = wallClockMs(m.caseStartDate);
    const e = wallClockMs(m.caseEndDate);
    const installed = Number(m.operatorPower ?? 0);
    const remaining = Number(m.capacityAtCaseTime ?? 0);
    const loss = Math.max(0, installed - remaining);
    if (s === null || e === null || e <= s || !Number.isFinite(loss) || loss <= 0) {
      skipped++;
      continue;
    }
    rows.push({
      id: m.id,
      uevcbId: Number.isFinite(m.uevcbId) ? (m.uevcbId as number) : null,
      plant: (m.powerPlantName || m.uevcbName || "").trim() || "Adsız santral",
      org: m.orgName?.trim() || null,
      startMs: s,
      endMs: e,
      lossMw: loss,
      installedMw: installed,
      remainingMw: remaining,
      reason: m.reason?.trim() || null,
    });
  }
  return { rows, skipped };
}

/** t anında süren bildirimler */
export const activeAt = (rows: OutageRow[], t: number): OutageRow[] => rows.filter((r) => r.startMs <= t && t < r.endMs);

/** [from, to) aralığıyla kesişen bildirimler */
export const overlapping = (rows: OutageRow[], from: number, to: number): OutageRow[] => rows.filter((r) => r.startMs < to && r.endMs > from);

export const totalLossMw = (rows: OutageRow[]): number => rows.reduce((s, r) => s + r.lossMw, 0);

/**
 * Saatlik seri: her saat başında (from'dan to'ya, to dahil değil) süren bildirim sayısı ve toplam çıkan kapasite.
 * Aynı santralin üst üste binen bildirimleri toplanır (outage-capacity.ts ile aynı).
 */
export function hourlyLoss(rows: OutageRow[], from: number, to: number): Array<{ t: number; mw: number; count: number }> {
  const out: Array<{ t: number; mw: number; count: number }> = [];
  for (let t = from; t < to; t += HOUR) {
    let mw = 0;
    let count = 0;
    for (const r of rows) {
      if (r.startMs <= t && t < r.endMs) {
        mw += r.lossMw;
        count++;
      }
    }
    out.push({ t, mw, count });
  }
  return out;
}
