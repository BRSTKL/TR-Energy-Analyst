/**
 * TR-Energy Analyst - Santral rehberi: havuzdaki santrallerin dizini (diskten, EPİAŞ'a bağlanmaz)
 *
 * Kaynak: veri havuzundaki santral tanımları (`data/pool/<kimlik>/plant.json`: ad, tür) ve sahip şirket için sektör karnesi
 * (en yeni yıldan eskiye; karnede olmayan santralin sahibi yok). Analiz edilmeyen türler (doğalgaz, biyokütle… `kind`) ve
 * verisi olmayan santraller dizine girmez. 30 dakika bellekte tutulur.
 */

import type { DirectoryEntry, DirectoryType } from "@/lib/analysis/plant-search";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { availableSectorYears, loadSectorBenchmark, loadSectorPlants } from "@/lib/services/sector";

const TTL_MS = 30 * 60_000;
let memo: { at: number; promise: Promise<DirectoryEntry[]> } | null = null;

export interface SectorFacts {
  owner: string | null;
  organizationId: number | null;
  yekdem: boolean | null;
  hydroKind: "RESERVOIR" | "RUN_OF_RIVER" | null;
  hydroKindSource: "GEM" | "NAME" | "EPDK" | null;
}

let factsMemo: { at: number; promise: Promise<Map<number, SectorFacts>> } | null = null;

/** Karnedeki santral bilgileri; en yeni yıl önceliklidir. 30 dakika bellekte */
export function sectorFacts(now = Date.now()): Promise<Map<number, SectorFacts>> {
  if (factsMemo && now - factsMemo.at < TTL_MS) return factsMemo.promise;
  const promise = readSectorFacts();
  factsMemo = { at: now, promise };
  promise.catch(() => {
    if (factsMemo?.promise === promise) factsMemo = null;
  });
  return promise;
}

async function readSectorFacts(): Promise<Map<number, SectorFacts>> {
  const out = new Map<number, SectorFacts>();
  for (const year of await availableSectorYears()) {
    const bench = await loadSectorBenchmark(year);
    if (!bench) continue;
    for (const p of await loadSectorPlants(bench)) {
      if (out.has(p.epiasPlantId)) continue;
      out.set(p.epiasPlantId, {
        owner: p.organizationName,
        organizationId: p.organizationId,
        yekdem: p.yekdem,
        hydroKind: p.hydroKind ?? null,
        hydroKindSource: p.hydroKindSource ?? null,
      });
    }
  }
  return out;
}

async function build(): Promise<DirectoryEntry[]> {
  const facts = await sectorFacts();
  const ids = await listPoolPlants();
  const out: DirectoryEntry[] = [];
  const BATCH = 64;
  for (let i = 0; i < ids.length; i += BATCH) {
    const infos = await Promise.all(ids.slice(i, i + BATCH).map((id) => readPoolPlantInfo(id).catch(() => null)));
    for (const info of infos) {
      if (!info?.name || !info.type || info.kind) continue;
      out.push({ id: info.epiasPlantId, name: info.name, type: info.type as DirectoryType, owner: facts.get(info.epiasPlantId)?.owner ?? null });
    }
  }
  return out;
}

export function loadDirectory(now = Date.now()): Promise<DirectoryEntry[]> {
  if (memo && now - memo.at < TTL_MS) return memo.promise;
  const promise = build();
  memo = { at: now, promise };
  promise.catch(() => {
    if (memo?.promise === promise) memo = null;
  });
  return promise;
}
