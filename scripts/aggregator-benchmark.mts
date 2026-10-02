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
import { benchmarkAggregator } from "@/lib/analysis/aggregator-benchmark";
import { loadBenchmarkPlants, loadBenchmarkPrices, otherTechIds } from "@/lib/services/aggregator-data";

const year = Number(process.argv[2] ?? 2026);
const end = process.argv[3] ?? `${year}-08-31`;
const start = `${year}-01-01`;
const CACHE = path.join(process.cwd(), ".cache", "epias");

const membership = JSON.parse(fs.readFileSync(path.join(CACHE, "aggregator-membership.json"), "utf8")) as {
  asOf: string;
  aggregators: Array<{ id: number; name: string; plantIds: number[] }>;
};

const prices = await loadBenchmarkPrices(start, end);
const ids = Array.from(new Set(membership.aggregators.flatMap((a) => a.plantIds)));
const plants = await loadBenchmarkPlants(ids, year, start, end);
// Dışarıda kalanların sebebi: analiz edilmeyen tür ya da veri yok
const otherTech = otherTechIds(ids.filter((id) => !plants.has(id)));

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
