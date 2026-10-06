/**
 * TR-Energy Analyst - Kurulu güç kaynağı (EPİAŞ YEKDEM katılımcı listeleri)
 *
 * Kural ve eşleştirme: lib/epias-plant/installed-capacity.ts. Bu dosya listeleri EPİAŞ'tan alır ve önbellekte tutar
 * (.cache/epias/yekdem-participants.json): geçmiş yılların listesi değişmez, içinde bulunulan yılınki bir gün geçerli.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { epiasRequest } from "@/lib/services/epias-service";
import { poolPlantRows } from "@/lib/pool/pool-hours";
import {
  buildCapacityIndex,
  matchInstalledCapacity,
  peakEstimate,
  type CapacityIndex,
  type CapacityMatch,
  type YekdemParticipant,
} from "@/lib/epias-plant/installed-capacity";

/** Liste 2016'dan önce boş döner (canlı denendi 2026-10-06) */
export const FIRST_PARTICIPANT_YEAR = 2016;

const cacheFile = () => path.join(process.cwd(), ".cache", "epias", "yekdem-participants.json");
const DAY_MS = 24 * 3_600_000;

interface ParticipantCache {
  /** yıl → liste */
  years: Record<string, YekdemParticipant[]>;
  /** yıl → çekildiği an (ISO) */
  fetchedAt: Record<string, string>;
}

async function readCache(): Promise<ParticipantCache> {
  try {
    return JSON.parse(await fs.readFile(cacheFile(), "utf8"));
  } catch {
    return { years: {}, fetchedAt: {} };
  }
}

async function fetchYear(year: number): Promise<YekdemParticipant[]> {
  const json = await epiasRequest<{ items?: any[] }>("/renewables/data/renewables-participant", { year });
  return (json.items ?? []).map((it) => ({
    orgName: String(it.orgName ?? ""),
    facilityName: String(it.facilityName ?? ""),
    facilityType: String(it.facilityType ?? ""),
    installedPower: it.installedPower === null || it.installedPower === undefined ? null : Number(it.installedPower),
  }));
}

let indexPromise: Promise<{ index: CapacityIndex; errors: string[] }> | null = null;
let indexBuiltAt = 0;

/**
 * Bütün yılların YEKDEM katılımcı listesinden kurulu güç dizini. Eksik ya da süresi dolmuş yıllar EPİAŞ'tan alınır;
 * alınamayan yıl önbellekteki eski haliyle kullanılır ve hata olarak döner (dizin yine kurulur).
 */
export function installedCapacityIndex(now = new Date()): Promise<{ index: CapacityIndex; errors: string[] }> {
  if (indexPromise && Date.now() - indexBuiltAt < DAY_MS) return indexPromise;
  indexBuiltAt = Date.now();
  indexPromise = (async () => {
    const cache = await readCache();
    const errors: string[] = [];
    const thisYear = now.getUTCFullYear();
    let changed = false;
    for (let y = FIRST_PARTICIPANT_YEAR; y <= thisYear; y++) {
      const k = String(y);
      const at = cache.fetchedAt[k] ? Date.parse(cache.fetchedAt[k]) : 0;
      // Geçmiş yıl bir kez dolu alındıysa yeterli; içinde bulunulan yıl (henüz boş olabilir) günde bir
      const fresh = y < thisYear ? (cache.years[k]?.length ?? 0) > 0 : now.getTime() - at < DAY_MS;
      if (fresh) continue;
      try {
        cache.years[k] = await fetchYear(y);
        cache.fetchedAt[k] = now.toISOString();
        changed = true;
      } catch (e) {
        errors.push(`YEKDEM ${y} katılımcı listesi alınamadı (${e instanceof Error ? e.message : "bağlantı"})`);
      }
    }
    if (changed) {
      await fs.mkdir(path.dirname(cacheFile()), { recursive: true });
      await fs.writeFile(cacheFile(), JSON.stringify(cache));
    }
    const byYear: Record<number, YekdemParticipant[]> = {};
    for (const [k, v] of Object.entries(cache.years)) byYear[Number(k)] = v;
    return { index: buildCapacityIndex(byYear), errors };
  })();
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

export interface CapacityPlantRef {
  name: string;
  type: string;
  organizationName: string | null;
  epiasPlantId: number | null;
  kgupVersion?: string | null;
}

/** Santralin dönemdeki en yüksek saatlik üretimi ve saat sayısı (havuzdan) */
export async function plantPeak(plant: CapacityPlantRef, start: string, end: string): Promise<{ peakMw: number; hours: number }> {
  const rows = await poolPlantRows(plant, start, end);
  let peak = 0;
  for (const r of rows) if (r.actualMwh > peak) peak = r.actualMwh;
  return { peakMw: peak, hours: rows.length };
}

/**
 * Santrallerin kurulu gücü: YEKDEM kaydı, yoksa en yüksek saatlik üretimden tahmin. `peaks` verilmezse havuzdan
 * okunur (dönem gerekli). Dizin alınamazsa hepsi tahmine düşer ve hata döner.
 */
export async function resolveInstalledCapacities(
  plants: CapacityPlantRef[],
  period: { start: string; end: string } | null,
  peaks?: Array<{ peakMw: number; hours: number }>
): Promise<{ matches: CapacityMatch[]; peaks: Array<{ peakMw: number; hours: number }>; errors: string[] }> {
  const measured =
    peaks ?? (await Promise.all(plants.map((p) => (period ? plantPeak(p, period.start, period.end) : { peakMw: 0, hours: 0 }))));
  let index: CapacityIndex | null = null;
  const errors: string[] = [];
  try {
    const r = await installedCapacityIndex();
    index = r.index;
    errors.push(...r.errors);
  } catch (e) {
    errors.push(`Kurulu güç kayıtları alınamadı (${e instanceof Error ? e.message : "bağlantı"}); tahmin kullanıldı`);
  }
  const matches = plants.map((p, i) => {
    const q = { name: p.name, type: p.type, organizationName: p.organizationName, ...measured[i] };
    return index ? matchInstalledCapacity(q, index) : peakEstimate(q);
  });
  return { matches, peaks: measured, errors };
}
