/**
 * TR-Energy Analyst - Santral rehberi: arama (SAF, I/O yok)
 *
 * Santral adında ve sahip şirket adında arar. Türkçe harfler ve noktalama yok sayılır ("Çal" → "CAL"); sorgudaki her kelime
 * bulunmalı. Sıra: adı sorguyla başlayanlar, adında geçenler, yalnız sahibinde geçenler; eşitlikte ad sırası. Sayısal sorgu
 * santral kimliğiyle de eşleşir.
 */

import { normalizePlantName } from "@/lib/epias-plant/plant-data";

export type DirectoryType = "RES" | "HES" | "GES";

export interface DirectoryEntry {
  id: number;
  name: string;
  type: DirectoryType;
  /** Sahip şirket; sektör karnesinde yoksa null */
  owner: string | null;
}

export interface SearchResult {
  /** Eşleşen toplam (sınırdan önce) */
  total: number;
  items: DirectoryEntry[];
}

export function searchPlants(list: DirectoryEntry[], query: string, type: DirectoryType | "ALL" = "ALL", limit = 50): SearchResult {
  const q = normalizePlantName(query);
  const words = q ? q.split(" ") : [];
  const scored: Array<{ e: DirectoryEntry; rank: number; key: string }> = [];
  for (const e of list) {
    if (type !== "ALL" && e.type !== type) continue;
    const name = normalizePlantName(e.name);
    const owner = e.owner ? normalizePlantName(e.owner) : "";
    let rank: number;
    if (!words.length) rank = 2;
    else if (/^\d+$/.test(q) && String(e.id) === q) rank = 0;
    else {
      const hay = `${name} ${owner}`;
      if (!words.every((w) => hay.includes(w))) continue;
      rank = name.startsWith(q) ? 0 : words.every((w) => name.includes(w)) ? 1 : 2;
    }
    scored.push({ e, rank, key: name });
  }
  scored.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key, "tr"));
  return { total: scored.length, items: scored.slice(0, limit).map((s) => s.e) };
}
