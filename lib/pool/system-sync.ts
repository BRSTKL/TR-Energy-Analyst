/**
 * TR-Energy Analyst - Sistem geneli serileri havuza tamamlama
 *
 * `ensureSystemCoverage(ilkAy, sonAy, fetcher)`: aralıktaki her ay için havuza bakar; eksik ya da yenileme zamanı gelmiş
 * (geçici) ayları EPİAŞ'tan çeker ve yıl belgesine yazar (umm-sync.ts ile aynı akış). Gelecekteki aylar çekilmez. Bir ay
 * hata verirse kaydedilir ve kalan aylar denenir. EPİAŞ çağrısı dışarıdan verilir (testler).
 */

import { emptySystemYear, systemMonthQuery, systemNeedsFetch, upgradeSystemYear, writeSystemMonth, type SystemMonthRaw, type SystemYear } from "./system-codec";
import { readSystemYear, writeSystemYear } from "./system-store";

export type SystemFetcher = (query: { startDate: string; endDate: string }) => Promise<SystemMonthRaw>;

export interface SystemMonthResult {
  month: string;
  source: "pool" | "epias" | "failed" | "future";
  hours?: Record<string, number>;
  error?: string;
}

export interface SystemStore {
  read: (year: number) => Promise<SystemYear | null>;
  write: (doc: SystemYear) => Promise<void>;
}

const fileStore: SystemStore = { read: readSystemYear, write: writeSystemYear };

/** "YYYY-AA" aralığının ayları (dahil) */
function monthKeys(from: string, to: string): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4));
  const em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push({ year: y, month: m });
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export async function ensureSystemCoverage(
  from: string,
  to: string,
  fetcher: SystemFetcher,
  { now = new Date(), store = fileStore, onMonth }: { now?: Date; store?: SystemStore; onMonth?: (r: SystemMonthResult) => void } = {}
): Promise<SystemMonthResult[]> {
  const results: SystemMonthResult[] = [];
  const docs = new Map<number, { doc: SystemYear; dirty: boolean }>();
  const docFor = async (year: number) => {
    let entry = docs.get(year);
    if (!entry) {
      const stored = await store.read(year);
      entry = { doc: stored ? upgradeSystemYear(stored) : emptySystemYear(year), dirty: false };
      docs.set(year, entry);
    }
    return entry;
  };

  for (const { year, month } of monthKeys(from, to)) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    let result: SystemMonthResult;
    const query = systemMonthQuery(year, month, now);
    if (!query) result = { month: key, source: "future" };
    else {
      const entry = await docFor(year);
      if (!systemNeedsFetch(entry.doc, month, now)) result = { month: key, source: "pool" };
      else {
        try {
          const raw = await fetcher(query);
          const { hours } = writeSystemMonth(entry.doc, month, raw, now);
          entry.dirty = true;
          result = { month: key, source: "epias", hours };
        } catch (e) {
          result = { month: key, source: "failed", error: e instanceof Error ? e.message : String(e) };
        }
      }
    }
    results.push(result);
    onMonth?.(result);
  }
  for (const { doc, dirty } of docs.values()) if (dirty) await store.write(doc);
  return results;
}
