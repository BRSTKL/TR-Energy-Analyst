/**
 * Toplayıcılar arası kıyası üretir (PLAN 8.7): .cache/epias/aggregator-benchmark-<yıl>.json
 *
 *   npx tsx --tsconfig tsconfig.json scripts/aggregator-benchmark.mts [yıl=2026] [bitiş=2026-08-31]
 *
 * Girdi: toplayıcı üyelik listesi (.cache/epias/aggregator-membership.json), veri havuzu (data/pool; ilk KGÜP ve UEVM),
 * santral sahibi ve türü (sektör karnesi santral dosyaları), EPİAŞ resmi dengesizlik fiyatları (MarketData). EPİAŞ'a
 * gidilmez.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { readRange } from "@/lib/pool/pool-codec";
import { readPoolYear } from "@/lib/pool/pool-store";
import { benchmarkAggregator, type BenchmarkHourPrice, type BenchmarkPlant } from "@/lib/analysis/aggregator-benchmark";

const year = Number(process.argv[2] ?? 2026);
const end = process.argv[3] ?? `${year}-08-31`;
const start = `${year}-01-01`;
const CACHE = path.join(process.cwd(), ".cache", "epias");

const membership = JSON.parse(fs.readFileSync(path.join(CACHE, "aggregator-membership.json"), "utf8")) as {
  asOf: string;
  aggregators: Array<{ id: number; name: string; plantIds: number[] }>;
};

const market = await prisma.marketData.findMany({
  where: { timestamp: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T23:00:00Z`) } },
});
const prices = new Map<number, BenchmarkHourPrice>();
for (const m of market) {
  if (m.imbalancePosPrice === null || m.imbalanceNegPrice === null) continue;
  prices.set(m.timestamp.getTime(), { ptf: m.ptf, pos: m.imbalancePosPrice, neg: m.imbalanceNegPrice });
}

const plants = new Map<number, BenchmarkPlant>();
const ids = Array.from(new Set(membership.aggregators.flatMap((a) => a.plantIds)));
for (const id of ids) {
  const doc = await readPoolYear(id, year);
  if (!doc) continue;
  let meta: { type?: string; organizationName?: string | null } = {};
  try {
    meta = JSON.parse(fs.readFileSync(path.join(CACHE, `sector-${year}`, `${id}.json`), "utf8"));
  } catch {
    // karnede olmayan santral: türü havuz tanımından
    try {
      meta = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "pool", String(id), "plant.json"), "utf8"));
    } catch {}
  }
  const hours = new Map<number, { d: number; actual: number }>();
  for (const r of readRange([doc], start, end)) {
    if (r.kgupFirst === null || r.uevm === null) continue;
    hours.set(r.timestamp.getTime(), { d: r.uevm - r.kgupFirst, actual: r.uevm });
  }
  // Yalnız rüzgâr, güneş ve hidro kıyasa girer (türü sektör karnesinden ya da havuz tanımından; PLAN 10.5)
  if (!meta.type || !["RES", "GES", "HES"].includes(meta.type)) continue;
  plants.set(id, { epiasPlantId: id, type: meta.type, owner: meta.organizationName ?? null, hours });
}

// Dışarıda kalanların sebebi: analiz edilmeyen tür ya da veri yok
const otherTech = new Set<number>();
for (const id of ids) {
  if (plants.has(id)) continue;
  try {
    const info = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "pool", String(id), "plant.json"), "utf8"));
    if (info.kind === "OTHER") otherTech.add(id);
  } catch {}
}

// Sektör medyanları (santral tek başına TL/MWh): karışıma göre beklenen maliyet için
const sector = JSON.parse(fs.readFileSync(path.join(CACHE, `sector-${year}.json`), "utf8"));
const medians: Record<string, number> = {};
for (const [t, v] of Object.entries(sector.byType ?? {})) medians[t] = (v as any).unitImbalanceTl.median;

const rows = membership.aggregators
  .map((a) => {
    const r = benchmarkAggregator(a, plants, prices, medians);
    const other = a.plantIds.filter((id) => otherTech.has(id)).length;
    return { ...r, otherTechPlants: other, missingPlants: a.plantIds.length - r.coveredPlants - other };
  })
  .filter((r) => r.coveredPlants > 0)
  .sort((a, b) => b.productionMwh - a.productionMwh);

const out = { year, period: { start, end }, membershipAsOf: membership.asOf, sectorMedians: medians, generatedAt: new Date().toISOString(), aggregators: rows };
fs.writeFileSync(path.join(CACHE, `aggregator-benchmark-${year}.json`), JSON.stringify(out, null, 1));
for (const r of rows)
  console.log(
    `${r.name.slice(0, 40).padEnd(40)} ${String(r.coveredPlants).padStart(3)}/${String(r.listedPlants).padEnd(3)} ${(r.productionMwh / 1000).toFixed(0).padStart(6)} GWh  değer ${(r.nettingValueTl / 1e6).toFixed(1).padStart(6)} M  %${r.nettingPct.toFixed(0).padStart(2)}  ${r.nettedTlPerMwh.toFixed(0).padStart(4)} TL/MWh  endeks ${r.mixAdjustedIndex?.toFixed(2) ?? "-"}`
  );
await prisma.$disconnect();
