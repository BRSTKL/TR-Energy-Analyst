/**
 * TR-Energy Analyst - Toplayıcıların santral listeleri (PLAN 4.5)
 *
 * EPİAŞ'ta "(TOPLAYICI)" ekiyle kayıtlı tüm katılımcıların santral listesi çekilir ve .cache/epias/
 * aggregator-membership.json'a yazılır. Aday taraması bu dosyadan "başka bir toplayıcıda" olan santralleri ayırır.
 * Toplama scripts/aggregator-collect.mts ile yapılır (VPN gerekir; ~36 toplayıcı, birkaç dakika); okuma EPİAŞ'a
 * bağlanmaz. Liste, sorgulanan dönemlerin (son tam yıl, bu yıl, son ay) birleşimidir: yıl içinde ayrılan bir santral
 * hâlâ toplayıcıda görünebilir.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { isAggregatorName } from "@/lib/projects/aggregator";
import { searchPeriods } from "@/lib/epias-plant/period";
import { fetchAggregatorPortfolio, listOrganizations } from "@/lib/services/epias-plants";

const file = () => path.join(process.cwd(), ".cache", "epias", "aggregator-membership.json");

export interface AggregatorMembershipFile {
  /** Toplama tarihi (YYYY-AA-GG) */
  asOf: string;
  aggregators: Array<{ id: number; name: string; plantIds: number[] }>;
  /** Santral listesi alınamayan toplayıcılar */
  failed: Array<{ id: number; name: string; error: string }>;
}

export interface AggregatorMembership {
  asOf: string;
  aggregatorCount: number;
  failedCount: number;
  /** Santral kimliği → toplayıcı(lar) */
  byPlant: Map<number, Array<{ id: number; name: string }>>;
}

/** Toplayıcının kısa adı: "(TOPLAYICI)" eki ve şirket türü atılır */
export const shortAggregatorName = (name: string) =>
  name
    .replace(/\(TOPLAYICI\)\s*$/i, "")
    .replace(/\s+(ANONİM ŞİRKETİ|A\.Ş\.?|AŞ)\s*$/i, "")
    .trim();

export async function collectAggregatorMembership(log: (msg: string) => void = () => {}): Promise<AggregatorMembershipFile> {
  const lists = await Promise.all(searchPeriods().map(({ start, end }) => listOrganizations(start, end)));
  const aggregators = Array.from(new Map(lists.flat().filter((o) => isAggregatorName(o.name)).map((o) => [o.id, o])).values());
  log(`${aggregators.length} toplayıcı bulundu`);
  const out: AggregatorMembershipFile = { asOf: new Date().toISOString().slice(0, 10), aggregators: [], failed: [] };
  for (const [i, a] of aggregators.entries()) {
    try {
      const p = await fetchAggregatorPortfolio(a.id, a.name);
      out.aggregators.push({ id: a.id, name: a.name, plantIds: p.plantIds ?? [] });
      log(`${i + 1}/${aggregators.length} ${a.name}: ${p.plantCount} santral`);
    } catch (e) {
      out.failed.push({ id: a.id, name: a.name, error: e instanceof Error ? e.message : String(e) });
      log(`${i + 1}/${aggregators.length} ${a.name}: HATA`);
    }
  }
  await fs.mkdir(path.dirname(file()), { recursive: true });
  await fs.writeFile(file(), JSON.stringify(out, null, 1));
  return out;
}

/** Diskteki toplayıcı listesi; toplanmamışsa null */
export async function loadAggregatorMembership(): Promise<AggregatorMembership | null> {
  let saved: AggregatorMembershipFile;
  try {
    saved = JSON.parse(await fs.readFile(file(), "utf8"));
  } catch {
    return null;
  }
  const byPlant = new Map<number, Array<{ id: number; name: string }>>();
  for (const a of saved.aggregators)
    for (const id of a.plantIds) {
      const list = byPlant.get(id) ?? [];
      list.push({ id: a.id, name: shortAggregatorName(a.name) });
      byPlant.set(id, list);
    }
  return { asOf: saved.asOf, aggregatorCount: saved.aggregators.length, failedCount: saved.failed.length, byPlant };
}
