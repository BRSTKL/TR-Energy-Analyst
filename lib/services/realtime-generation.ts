/**
 * TR-Energy Analyst - EPİAŞ gerçek zamanlı üretimini (GZÜ) geçici üretim olarak havuza çeker (kural lib/pool/provisional.ts)
 *
 * Gerçek zamanlı listedeki santral kimliği UEVM listesindekinden farklıdır; eşleşme santral EIC koduyla (iki listede de
 * aynı). Her santral için UEVM'nin bittiği ya da GZÜ'nün en son çekildiği günden sonrası, EPİAŞ'ın izin verdiği son güne
 * (bugün − 2) kadar çekilir; ay ay istenir. EPİAŞ'a erişim (Almanya'dan VPN) olmazsa hata fırlatır.
 */

import { epiasRequest } from "@/lib/services/epias-service";
import { listUevmPowerPlants } from "@/lib/services/epias-plants";
import { parseUevmItems } from "@/lib/epias-plant/plant-data";
import { readPoolYear, readProvisionalYear, writeProvisionalYear } from "@/lib/pool/pool-store";
import { emptyProvisionalYear, mergeProvisional, provisionalRange } from "@/lib/pool/provisional";

const HOUR = 3_600_000;
const TR = 3 * HOUR;

export interface RealtimePlant {
  id: number;
  name: string;
  eic: string | null;
}

/** Gerçek zamanlı üretim listesi (santral kimliği, adı, EIC) */
export async function listRealtimePlants(): Promise<RealtimePlant[]> {
  const items = ((await epiasRequest<{ items?: any[] }>("/generation/data/powerplant-list")).items ?? []) as any[];
  return items.map((p) => ({ id: Number(p.id), name: String(p.name).trim(), eic: p.eic ?? null }));
}

export async function fetchRealtimeGeneration(rtPlantId: number, fromDay: string, toDay: string): Promise<Map<number, number>> {
  const r = await epiasRequest<{ items?: Array<Record<string, unknown>> }>("/generation/data/realtime-generation", {
    powerPlantId: rtPlantId,
    startDate: `${fromDay}T00:00:00+03:00`,
    endDate: `${toDay}T23:00:00+03:00`,
  });
  return parseUevmItems(r.items ?? []).values;
}

/** Havuzdaki son UEVM günü (YYYY-MM-DD) */
async function lastUevmDay(epiasPlantId: number, year: number): Promise<string | null> {
  for (const y of [year, year - 1]) {
    const doc = await readPoolYear(epiasPlantId, y);
    if (!doc) continue;
    let last = -1;
    doc.uevm.forEach((v, i) => {
      if (v !== null) last = i;
    });
    if (last >= 0) return new Date(Date.parse(doc.start) + last * HOUR).toISOString().slice(0, 10);
  }
  return null;
}

/** Ay sınırlarında böler: [from, to] → [[from, ay sonu], [ay başı, …], …] */
function monthChunks(from: string, to: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let cur = from;
  while (cur <= to) {
    const d = new Date(`${cur}T00:00:00Z`);
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const end = monthEnd < to ? monthEnd : to;
    out.push([cur, end]);
    cur = new Date(Date.parse(`${end}T00:00:00Z`) + 24 * HOUR).toISOString().slice(0, 10);
  }
  return out;
}

export interface ProvisionalSyncResult {
  epiasPlantId: number;
  status: "updated" | "current" | "not-listed" | "error";
  range?: { from: string; to: string };
  hours?: number;
  message?: string;
}

/** Santrallerin geçici üretimini günceller (yalnız eksik günler) */
export async function syncProvisional(epiasPlantIds: number[], now = Date.now()): Promise<ProvisionalSyncResult[]> {
  const today = new Date(now + TR).toISOString().slice(0, 10);
  const [uevmList, rtList] = await Promise.all([listUevmPowerPlants(), listRealtimePlants()]);
  const eicOf = new Map(uevmList.map((p) => [p.id, p.eic]));
  const rtByEic = new Map(rtList.filter((p) => p.eic).map((p) => [p.eic!, p]));
  const out: ProvisionalSyncResult[] = [];
  for (const id of epiasPlantIds) {
    const eic = eicOf.get(id);
    const rt = eic ? rtByEic.get(eic) : undefined;
    if (!eic || !rt) {
      out.push({ epiasPlantId: id, status: "not-listed", message: eic ? "gerçek zamanlı listede yok" : "UEVM listesinde EIC yok" });
      continue;
    }
    try {
      const year = Number(today.slice(0, 4));
      const prevDoc = await readProvisionalYear(id, year);
      const fetchedThrough = prevDoc?.fetchedThrough ?? (await readProvisionalYear(id, year - 1))?.fetchedThrough ?? null;
      const range = provisionalRange({ today, lastUevmDay: await lastUevmDay(id, year), fetchedThrough });
      if (!range) {
        out.push({ epiasPlantId: id, status: "current" });
        continue;
      }
      let hours = 0;
      for (const [a, b] of monthChunks(range.from, range.to)) {
        const values = await fetchRealtimeGeneration(rt.id, a, b);
        const y = Number(a.slice(0, 4));
        const doc = (await readProvisionalYear(id, y)) ?? emptyProvisionalYear(id, y, rt.id, eic);
        await writeProvisionalYear(mergeProvisional({ ...doc, rtPlantId: rt.id, eic }, values, b, new Date(now).toISOString()));
        hours += values.size;
      }
      out.push({ epiasPlantId: id, status: "updated", range, hours });
    } catch (e) {
      out.push({ epiasPlantId: id, status: "error", message: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    }
  }
  return out;
}
