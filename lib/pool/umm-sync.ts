/**
 * TR-Energy Analyst - Arıza / bakım bildirimlerini havuza tamamlama (Aşama 14.0)
 *
 * `ensureUmmCoverage(ilkAy, sonAy, fetcher)`: aralıktaki her ay için havuza bakar; eksik ya da yenileme zamanı gelmiş
 * (geçici) ayları EPİAŞ'tan çeker ve yıl belgesine yazar. Gelecekteki aylar çekilmez. Bir ay hata verirse kaydedilir ve
 * kalan aylar denenir (belge yalnız başarılı aylarla yazılır). EPİAŞ çağrısı dışarıdan verilir (testler).
 */

import { emptyUmmYear, ummMonthQuery, ummNeedsFetch, writeUmmMonth, type UmmQuery, type UmmYear } from "./umm-codec";
import { readUmmYear, writeUmmYear } from "./umm-store";

export type UmmFetcher = (query: UmmQuery) => Promise<unknown[]>;

export type UmmMonthSource = "pool" | "epias" | "failed" | "future";

export interface UmmMonthResult {
  month: string;
  source: UmmMonthSource;
  messages?: number;
  error?: string;
}

export interface UmmStore {
  read: (year: number) => Promise<UmmYear | null>;
  write: (doc: UmmYear) => Promise<void>;
}

const fileStore: UmmStore = { read: readUmmYear, write: writeUmmYear };

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

export async function ensureUmmCoverage(
  from: string,
  to: string,
  fetcher: UmmFetcher,
  { now = new Date(), store = fileStore, onMonth }: { now?: Date; store?: UmmStore; onMonth?: (r: UmmMonthResult) => void } = {}
): Promise<UmmMonthResult[]> {
  const results: UmmMonthResult[] = [];
  const docs = new Map<number, { doc: UmmYear; dirty: boolean }>();
  const docFor = async (year: number) => {
    let entry = docs.get(year);
    if (!entry) {
      entry = { doc: (await store.read(year)) ?? emptyUmmYear(year), dirty: false };
      docs.set(year, entry);
    }
    return entry;
  };

  for (const { year, month } of monthKeys(from, to)) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    let result: UmmMonthResult;
    // Ay henüz başlamadıysa (ya da sorgulanabilir bir saati yoksa) çekilmez
    const query = ummMonthQuery(year, month, now);
    if (!query) result = { month: key, source: "future" };
    else {
      const entry = await docFor(year);
      if (!ummNeedsFetch(entry.doc, month, now)) {
        result = { month: key, source: "pool", messages: entry.doc.months[key.slice(5)]?.ids.length ?? 0 };
      } else {
        try {
          const items = await fetcher(query);
          writeUmmMonth(entry.doc, month, items, now);
          entry.dirty = true;
          result = { month: key, source: "epias", messages: entry.doc.months[key.slice(5)].ids.length };
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
