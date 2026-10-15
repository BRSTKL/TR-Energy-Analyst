/**
 * GİP likiditesi ve toplayıcıların gerçekleşen katılımı (PLAN 18.1).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/gip-participation.mts [yıl=2026] [sonAy=08]
 *
 * Toplayıcılar: EPİAŞ toplayıcı listesi (.cache/epias/aggregator-membership.json); santrallerin ilk ve son KGÜP'ü havuzdan
 * (loadBenchmarkPlants, 12.1 ile aynı). Kıyasa giren: son plan kapsamı ≥ %90 ve üretim ≥ 100 GWh (intradayPeerStats ile
 * aynı eşik). GİP hacmi MarketData (saatlik kontrat eşleşmesi). Likidite profili 2024'ten yılın son ayına.
 * Çıktı: .cache/epias/gip-participation-<yıl>.json. EPİAŞ'a gidilmez.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { loadBenchmarkPlants } from "@/lib/services/aggregator-data";
import { capImpact, liquidityProfile, participationStats, portfolioTradeHours, quantiles } from "@/lib/analysis/gip-liquidity";

const year = Number(process.argv[2] ?? 2026);
const lastMonth = Number(process.argv[3] ?? 8);
const CACHE = path.join(process.cwd(), ".cache", "epias");
const pad = (n: number) => String(n).padStart(2, "0");
const end = `${year}-${pad(lastMonth)}-${new Date(Date.UTC(year, lastMonth, 0)).getUTCDate()}`;
const CAPS = [0.02, 0.05, 0.1, 0.2];

const market = await prisma.marketData.findMany({
  where: { timestamp: { gte: new Date(Date.UTC(2024, 0, 1)), lt: new Date(Date.UTC(year, lastMonth, 1)) } },
  select: { timestamp: true, gipVolumeMwh: true, gipPrice: true, gipMinPrice: true, gipMaxPrice: true },
});
const volume = new Map(
  market.filter((m) => m.timestamp.getUTCFullYear() === year && (m.gipVolumeMwh ?? 0) > 0).map((m) => [m.timestamp.getTime(), m.gipVolumeMwh!])
);
const profile = liquidityProfile(
  market.map((m) => ({ t: m.timestamp.getTime(), volumeMwh: m.gipVolumeMwh ?? 0, price: m.gipPrice, minPrice: m.gipMinPrice, maxPrice: m.gipMaxPrice }))
);

const membership = JSON.parse(fs.readFileSync(path.join(CACHE, "aggregator-membership.json"), "utf8")) as {
  asOf: string;
  aggregators: Array<{ id: number; name: string; plantIds: number[] }>;
};
const plants = await loadBenchmarkPlants(Array.from(new Set(membership.aggregators.flatMap((a) => a.plantIds))), year, `${year}-01-01`, end);

const rows = [];
for (const a of membership.aggregators) {
  const members = a.plantIds.map((id) => plants.get(id)).filter((p): p is NonNullable<typeof p> => !!p && p.hours.size > 0);
  if (!members.length) continue;
  const { hours, coveragePct } = portfolioTradeHours(members.map((m) => m.hours), volume);
  const productionMwh = members.reduce((s, m) => s + Array.from(m.hours.values()).reduce((x, h) => x + h.actual, 0), 0);
  const stats = participationStats(hours);
  rows.push({
    id: a.id,
    name: a.name.replace(/\s*\(TOPLAYICI\)\s*$/i, ""),
    plants: members.length,
    productionGwh: productionMwh / 1000,
    /** Ortalama saatlik üretim (MWh) */
    meanGenerationMwh: hours.length ? productionMwh / hours.length : 0,
    coveragePct,
    included: coveragePct >= 90 && productionMwh >= 100_000,
    ...stats,
    caps: Object.fromEntries(CAPS.map((c) => [String(c), capImpact(hours, c)])),
  });
}
rows.sort((x, y) => y.productionGwh - x.productionGwh);
const included = rows.filter((r) => r.included);
const medianProd = quantiles(included.map((r) => r.productionGwh)).p50;
const large = included.filter((r) => r.productionGwh >= medianProd);
const summary = {
  included: included.length,
  large: large.length,
  largeThresholdGwh: medianProd,
  /** Büyük toplayıcıların saatlik katılım P90'ının medyanı (sınırın dayanağı, karar 1) */
  largeP90ShareMedian: quantiles(large.map((r) => r.share.p90)).p50,
  largeP99ShareMedian: quantiles(large.map((r) => r.share.p99)).p50,
  allP90ShareMedian: quantiles(included.map((r) => r.share.p90)).p50,
};
fs.writeFileSync(
  path.join(CACHE, `gip-participation-${year}.json`),
  JSON.stringify({ generatedAt: new Date().toISOString(), year, period: `${year}-01-01 – ${end}`, membershipAsOf: membership.asOf, summary, profile, rows }, null, 1)
);

const f = (v: number, d = 1) => v.toFixed(d);
console.log(`${year} Ocak–${pad(lastMonth)}: ${rows.length} toplayıcı, kıyasta ${included.length} (kapsam ≥ %90, üretim ≥ 100 GWh)\n`);
console.log("Toplayıcı".padEnd(28), "santral", "  GWh", " ort. üretim", "kapsam", "  katılım P50 / P90 / P99 / en çok", "  işlem MWh P90", "  %10 sınır bağlar / keser");
for (const r of rows)
  console.log(
    (r.included ? "" : "· ") + r.name.slice(0, 26).padEnd(r.included ? 28 : 26),
    String(r.plants).padStart(7),
    f(r.productionGwh, 0).padStart(5),
    f(r.meanGenerationMwh, 0).padStart(11),
    `%${f(r.coveragePct, 0)}`.padStart(6),
    `  %${f(r.share.p50 * 100, 2)} / %${f(r.share.p90 * 100, 2)} / %${f(r.share.p99 * 100, 2)} / %${f(r.share.max * 100, 1)}`.padEnd(36),
    f(r.tradeMwh.p90, 1).padStart(14),
    `  %${f(r.caps["0.1"].bindingPct, 1)} saat / %${f(r.caps["0.1"].cutTradePct, 1)} işlem`
  );
console.log(`\nBüyük toplayıcılar (üretim ≥ ${f(medianProd, 0)} GWh, ${large.length}): katılım P90 medyanı %${f(summary.largeP90ShareMedian * 100, 2)}, P99 medyanı %${f(summary.largeP99ShareMedian * 100, 2)}; kıyastakilerin hepsi P90 medyanı %${f(summary.allP90ShareMedian * 100, 2)}`);
console.log("\nGİP saatlik hacmi (medyan / P10, MWh), aylara göre:");
console.log(profile.byMonth.map((m) => `${m.month} ${f(m.median, 0)}/${f(m.p10, 0)}`).join("  "));
console.log("Günün saatine göre (medyan):", profile.byHour.map((h) => `${h.hour}:${f(h.median, 0)}`).join(" "));
console.log("Hacim beşte birliklerine göre fiyat aralığı (en yüksek − en düşük) / ortalama:", profile.rangeByVolume.map((q) => `${f(q.volumeFrom, 0)}–${f(q.volumeTo, 0)} MWh: %${f(q.rangePct, 1)}`).join(" · "));
await prisma.$disconnect();
