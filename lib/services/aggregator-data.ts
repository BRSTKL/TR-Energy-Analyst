/**
 * TR-Energy Analyst - Toplayıcı kıyası ve ayrıntısı için veri okuma (PLAN 8.7, 9.2)
 *
 * Santral saatleri veri havuzundan (ilk KGÜP ve UEVM), türü ve sahibi sektör karnesi dosyalarından ya da havuz tanımından,
 * fiyatlar veritabanındaki EPİAŞ resmi dengesizlik fiyatlarından okunur. EPİAŞ'a gidilmez. Hem kıyası üreten betik hem de
 * ayrıntı sayfasının API'si kullanır (aynı veri, aynı süzgeç).
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { readRange } from "@/lib/pool/pool-codec";
import { readPoolYear } from "@/lib/pool/pool-store";
import type { AggregatorBenchmarkRow, BenchmarkHourPrice, BenchmarkPlant } from "@/lib/analysis/aggregator-benchmark";
import { aggregatorDetail, type AggregatorDetail } from "@/lib/analysis/aggregator-detail";

const CACHE = path.join(process.cwd(), ".cache", "epias");
const poolPlantFile = (id: number) => path.join(process.cwd(), "data", "pool", String(id), "plant.json");

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Saat (duvar saati, ms) → resmi dengesizlik fiyatları; resmi fiyatı olmayan saat yoktur */
export async function loadBenchmarkPrices(start: string, end: string): Promise<Map<number, BenchmarkHourPrice>> {
  const market = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T23:00:00Z`) } } });
  const prices = new Map<number, BenchmarkHourPrice>();
  for (const m of market) {
    if (m.imbalancePosPrice === null || m.imbalanceNegPrice === null) continue;
    prices.set(m.timestamp.getTime(), { ptf: m.ptf, pos: m.imbalancePosPrice, neg: m.imbalanceNegPrice });
  }
  return prices;
}

/**
 * Santrallerin saatlik sapması (UEVM − ilk KGÜP). Yalnız rüzgâr, güneş ve hidro alınır (türü sektör karnesinden ya da havuz
 * tanımından); havuzda verisi olmayan ya da başka türdeki santral dönmez.
 */
export async function loadBenchmarkPlants(ids: number[], year: number, start: string, end: string): Promise<Map<number, BenchmarkPlant>> {
  const plants = new Map<number, BenchmarkPlant>();
  for (const id of ids) {
    const doc = await readPoolYear(id, year);
    if (!doc) continue;
    const meta =
      readJson<{ type?: string; name?: string; organizationName?: string | null }>(path.join(CACHE, `sector-${year}`, `${id}.json`)) ??
      readJson<{ type?: string; name?: string; organizationName?: string | null }>(poolPlantFile(id)) ??
      {};
    if (!meta.type || !["RES", "GES", "HES"].includes(meta.type)) continue;
    const hours = new Map<number, { d: number; actual: number }>();
    for (const r of readRange([doc], start, end)) {
      if (r.kgupFirst === null || r.uevm === null) continue;
      hours.set(r.timestamp.getTime(), { d: r.uevm - r.kgupFirst, actual: r.uevm });
    }
    plants.set(id, { epiasPlantId: id, name: meta.name, type: meta.type, owner: meta.organizationName ?? null, hours });
  }
  return plants;
}

/** Havuz tanımında "başka tür" (kind OTHER) işaretli santraller */
export function otherTechIds(ids: number[]): Set<number> {
  const out = new Set<number>();
  for (const id of ids) if (readJson<{ kind?: string }>(poolPlantFile(id))?.kind === "OTHER") out.add(id);
  return out;
}

export interface AggregatorDetailResult extends AggregatorDetail {
  year: number;
  id: number;
  name: string;
  period: { start: string; end: string };
  membershipAsOf: string;
  sectorMedians: Record<string, number>;
  /** Kıyas dosyasındaki bütün toplayıcılar (benzer ölçekli grup için) */
  benchmarkRows: AggregatorBenchmarkRow[];
}

export class AggregatorDataError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const detailMemo = new Map<string, { at: number; value: AggregatorDetailResult }>();
const DETAIL_TTL_MS = 5 * 60_000;

/** Toplayıcının ayrıntısı (kıyas dosyası, üyelik listesi ve havuzdan; EPİAŞ'a gitmez). Kısa süre bellekte tutulur. */
export async function loadAggregatorDetail(year: number, id: number): Promise<AggregatorDetailResult> {
  const benchFile = path.join(CACHE, `aggregator-benchmark-${year}.json`);
  if (!fs.existsSync(benchFile)) throw new AggregatorDataError("Toplayıcı kıyası bu yıl için üretilmedi.", 404);
  const key = `${year}:${id}:${fs.statSync(benchFile).mtimeMs}`;
  const hit = detailMemo.get(key);
  if (hit && Date.now() - hit.at < DETAIL_TTL_MS) return hit.value;

  const bench = readJson<{
    period: { start: string; end: string };
    sectorMedians: Record<string, number>;
    membershipAsOf: string;
    aggregators: AggregatorBenchmarkRow[];
  }>(benchFile)!;
  const membership = readJson<{ aggregators: Array<{ id: number; name: string; plantIds: number[] }> }>(path.join(CACHE, "aggregator-membership.json"));
  const agg = membership?.aggregators.find((a) => a.id === id);
  if (!agg) throw new AggregatorDataError("Toplayıcı bulunamadı.", 404);

  const [prices, plants] = await Promise.all([
    loadBenchmarkPrices(bench.period.start, bench.period.end),
    loadBenchmarkPlants(agg.plantIds, year, bench.period.start, bench.period.end),
  ]);
  const value: AggregatorDetailResult = {
    ...aggregatorDetail(agg, plants, prices, bench.sectorMedians),
    year,
    id,
    name: agg.name,
    period: bench.period,
    membershipAsOf: bench.membershipAsOf,
    sectorMedians: bench.sectorMedians,
    benchmarkRows: bench.aggregators,
  };
  detailMemo.set(key, { at: Date.now(), value });
  return value;
}
