/**
 * Geçmişle sınama (Aşama 12.2, 12.3): sektör karnesindeki santrallerin 2025 ve 2026 Ocak–Ağustos verisi.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/sector-backtest.mts [geçmiş=2025] [hedef=2026] [sonAy=08]
 *
 * Çıktı: .cache/epias/sector-backtest-<hedef>.json (rapor okur). Girdi: sektör karnesi (sector-<yıl>.json; kalite
 * süzgecinden geçmiş santraller), saatlik seriler (sector-<yıl>-hourly), MarketData. EPİAŞ'a gidilmez.
 * Fiyatlama hesap motoruyla: "tahmin" geçmiş yılın verisi 2026 katsayılarıyla (formül; raporun risk primi yöntemi), "gerçek"
 * hedef yılın resmi fiyatlarıyla; KÜPST her ikisinde de en güncel oranlarla.
 */

import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, REGULATORY_IMBALANCE_REGIMES, type ImbalancePricingProfile, type MarketPriceRecord, type SystemDirection } from "@/lib/calculations/types";
import { KUPST_REGIMES, kupstForHour } from "@/lib/calculations/kupst";
import { candidateBacktest, improvementBacktest, premiumBacktest, type PlantBacktestInput, type SectorBacktest } from "@/lib/analysis/sector-backtest";
import { loadBenchmarkPlants, loadBenchmarkPrices } from "@/lib/services/aggregator-data";
import type { BenchmarkHourPrice, BenchmarkPlant } from "@/lib/analysis/aggregator-benchmark";

const fromYear = Number(process.argv[2] ?? 2025);
const toYear = Number(process.argv[3] ?? 2026);
const lastMonth = Number(process.argv[4] ?? 8);
const CACHE = path.join(process.cwd(), ".cache", "epias");
const HOUR = 3_600_000;
const hoursOf = (y: number) => (Date.UTC(y, lastMonth, 1) - Date.UTC(y, 0, 1)) / HOUR;
const N = Math.min(hoursOf(fromYear), hoursOf(toYear));

const COEF_2026: ImbalancePricingProfile = { mode: "CUSTOM", ...REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].coefficients };
const latestKupst = KUPST_REGIMES[KUPST_REGIMES.length - 1];

async function market(year: number): Promise<(MarketPriceRecord | undefined)[]> {
  const rows = await prisma.marketData.findMany({
    where: { timestamp: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year, lastMonth, 1)) } },
  });
  const out: (MarketPriceRecord | undefined)[] = new Array(N);
  for (const m of rows) {
    const i = (m.timestamp.getTime() - Date.UTC(year, 0, 1)) / HOUR;
    if (i >= 0 && i < N)
      out[i] = {
        timestamp: m.timestamp,
        ptf: m.ptf,
        smf: m.smf,
        systemDirection: m.systemDirection as SystemDirection,
        imbalancePosPrice: m.imbalancePosPrice,
        imbalanceNegPrice: m.imbalanceNegPrice,
      };
  }
  return out;
}

const readSector = (y: number) =>
  JSON.parse(fs.readFileSync(path.join(CACHE, `sector-${y}.json`), "utf8")) as {
    plants: Array<{ epiasPlantId: number; type: string; unitImbalanceTl: number }>;
  };
function readHourly(y: number, id: number): { forecast: (number | null)[]; actual: (number | null)[] } | null {
  const f = path.join(CACHE, `sector-${y}-hourly`, `${id}.json.gz`);
  return fs.existsSync(f) ? JSON.parse(gunzipSync(fs.readFileSync(f)).toString("utf8")) : null;
}

const [mFrom, mTo] = await Promise.all([market(fromYear), market(toYear)]);
const toRows = new Map(readSector(toYear).plants.map((p) => [p.epiasPlantId, p]));
const inputs: PlantBacktestInput[] = [];
let skipped = 0;

for (const p of readSector(fromYear).plants) {
  const other = toRows.get(p.epiasPlantId);
  const a = readHourly(fromYear, p.epiasPlantId);
  const b = readHourly(toYear, p.epiasPlantId);
  if (!other || other.type !== p.type || !a || !b) {
    skipped++;
    continue;
  }
  let predicted = 0;
  let priceOnly = 0;
  let mwhA = 0;
  let actual = 0;
  let mwhB = 0;
  let absA = 0;
  let absB = 0;
  for (let i = 0; i < N; i++) {
    const fa = a.forecast[i];
    const aa = a.actual[i];
    const ma = mFrom[i];
    const mb = mTo[i];
    if (fa !== null && fa !== undefined && aa !== null && aa !== undefined && ma) {
      const h = processHourlyRecord({ timestamp: ma.timestamp, forecastMwh: fa, actualMwh: aa }, { ...ma, imbalancePosPrice: null, imbalanceNegPrice: null }, COEF_2026);
      predicted += h.imbalanceCost + kupstForHour(h, p.type, latestKupst);
      mwhA += aa;
      absA += Math.abs(aa - fa);
      // Fiyat etkisi: aynı sapma, hedef yılın aynı takvim saatinin fiyatıyla
      if (mb) {
        const hp = processHourlyRecord({ timestamp: mb.timestamp, forecastMwh: fa, actualMwh: aa }, mb, DEFAULT_IMBALANCE_PROFILE);
        priceOnly += hp.imbalanceCost + kupstForHour(hp, p.type, latestKupst);
      }
    }
    const fb = b.forecast[i];
    const ab = b.actual[i];
    if (fb !== null && fb !== undefined && ab !== null && ab !== undefined && mb) {
      const h = processHourlyRecord({ timestamp: mb.timestamp, forecastMwh: fb, actualMwh: ab }, mb, DEFAULT_IMBALANCE_PROFILE);
      actual += h.imbalanceCost + kupstForHour(h, p.type, latestKupst);
      mwhB += ab;
      absB += Math.abs(ab - fb);
    }
  }
  if (mwhA <= 0 || mwhB <= 0) {
    skipped++;
    continue;
  }
  inputs.push({
    epiasPlantId: p.epiasPlantId,
    type: p.type,
    predictedTlPerMwh: predicted / mwhA,
    actualTlPerMwh: actual / mwhB,
    priceOnlyTlPerMwh: priceOnly / mwhA,
    wape2025: (absA / mwhA) * 100,
    wape2026: (absB / mwhB) * 100,
    unit2025TlPerMwh: p.unitImbalanceTl,
  });
}

// --- 12.5 Aday taraması: santralin toplayıcı portföyüne kattığı netleşme, geçmiş yılın verisiyle ve hedef yılın verisiyle ---
// Katılan santral: hedef yılın üyeliğinde olup geçmiş yılın aynı aylarında hiçbir toplayıcıda olmayan santral
async function candidates() {
  const histFile = path.join(CACHE, `aggregator-membership-${fromYear}.json`);
  if (!fs.existsSync(histFile)) return null;
  const hist = JSON.parse(fs.readFileSync(histFile, "utf8")) as { aggregators: Array<{ byMonth: Record<string, number[]> }> };
  const wasAggregated = new Set(hist.aggregators.flatMap((a) => Object.values(a.byMonth).flat()));
  const current = JSON.parse(fs.readFileSync(path.join(CACHE, "aggregator-membership.json"), "utf8")) as {
    aggregators: Array<{ id: number; name: string; plantIds: number[] }>;
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const end = (y: number) => `${y}-${pad(lastMonth)}-${new Date(Date.UTC(y, lastMonth, 0)).getUTCDate()}`;
  const ids = Array.from(new Set(current.aggregators.flatMap((a) => a.plantIds)));
  const [pA, pB, prA, prB] = await Promise.all([
    loadBenchmarkPlants(ids, fromYear, `${fromYear}-01-01`, end(fromYear)),
    loadBenchmarkPlants(ids, toYear, `${toYear}-01-01`, end(toYear)),
    loadBenchmarkPrices(`${fromYear}-01-01`, end(fromYear)),
    loadBenchmarkPrices(`${toYear}-01-01`, end(toYear)),
  ]);
  const cost = (d: number, p: BenchmarkHourPrice) => (d > 0 ? d * (p.ptf - p.pos) : d < 0 ? -d * (p.neg - p.ptf) : 0);
  // Santralin portföye katkısı (TL/MWh): portföy (onsuz) + santral tek başına − portföy (onunla), santralin üretimine göre
  const contribution = (members: BenchmarkPlant[], j: BenchmarkPlant, prices: Map<number, BenchmarkHourPrice>) => {
    const others = new Map<number, number>();
    for (const m of members) if (m !== j) for (const [t, h] of Array.from(m.hours.entries())) others.set(t, (others.get(t) ?? 0) + h.d);
    let gain = 0;
    let mwh = 0;
    for (const [t, h] of Array.from(j.hours.entries())) {
      const pr = prices.get(t);
      if (!pr) continue;
      const o = others.get(t) ?? 0;
      gain += cost(o, pr) + cost(h.d, pr) - cost(o + h.d, pr);
      mwh += h.actual;
    }
    return mwh > 0 ? gain / mwh : null;
  };
  const pairs: Array<{ aggregatorId: number; predictedTlPerMwh: number; actualTlPerMwh: number }> = [];
  for (const a of current.aggregators) {
    // İki yılda da verisi olan üyeler; portföy iki yılda aynı santrallerden kurulur
    const both = a.plantIds.filter((id) => (pA.get(id)?.hours.size ?? 0) > 0 && (pB.get(id)?.hours.size ?? 0) > 0);
    if (both.length < 3) continue;
    const membersA = both.map((id) => pA.get(id)!);
    const membersB = both.map((id) => pB.get(id)!);
    for (const id of both) {
      if (wasAggregated.has(id)) continue;
      const pred = contribution(membersA, pA.get(id)!, prA);
      const act = contribution(membersB, pB.get(id)!, prB);
      if (pred !== null && act !== null) pairs.push({ aggregatorId: a.id, predictedTlPerMwh: pred, actualTlPerMwh: act });
    }
  }
  return candidateBacktest(pairs);
}

const months = `Ocak–${["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][lastMonth - 1]}`;
const out: SectorBacktest & { generatedAt: string; plants: number; skipped: number } = {
  fromYear,
  toYear,
  months,
  premium: premiumBacktest(inputs),
  improvement: improvementBacktest(inputs),
  candidates: await candidates(),
  generatedAt: new Date().toISOString(),
  plants: inputs.length,
  skipped,
};
fs.writeFileSync(path.join(CACHE, `sector-backtest-${toYear}.json`), JSON.stringify(out, null, 1));

const f = (v: number, d = 2) => v.toFixed(d);
console.log(`${inputs.length} santral (${skipped} atlandı: iki yılda da karnede ve saatlik seride olmayan), ${months} ${fromYear} → ${toYear}\n`);
console.log("Risk primi: gerçek / tahmin");
for (const [t, s] of Object.entries(out.premium))
  console.log(
    `  ${t.padEnd(4)} n=${String(s.n).padStart(4)}  medyan ${f(s.ratio.p50)}  %50 aralık ${f(s.ratio.p25)}–${f(s.ratio.p75)}  %80 aralık ${f(s.ratio.p10)}–${f(s.ratio.p90)}  medyan mutlak hata %${f(s.medianAbsErrorPct, 0)}  fiyat etkisi ×${f(s.priceEffectRatio)}  tahmin etkisi ×${f(s.forecastEffectRatio)}`
  );
console.log("\nTahmin iyileştirme (2025'te medyandan pahalı santraller, WAPE değişimi)");
for (const [t, s] of Object.entries(out.improvement))
  console.log(
    `  ${t.padEnd(4)} n=${String(s.n).padStart(4)}  iyileşen %${f(s.improvedSharePct, 0)}  değişim medyan %${f(s.change.p50, 1)}  çeyrekler %${f(s.change.p25, 1)} / %${f(s.change.p75, 1)}  → gerçekçi %${f(s.realisticImprovementPct, 1)}, iyi %${f(s.goodImprovementPct, 1)}`
  );
const c = out.candidates;
if (c)
  console.log(
    `\nAday taraması (santralin toplayıcıya katkısı, TL/MWh): ${c.n} santral, ${c.aggregators} toplayıcı · gerçek / tahmin medyanı ${f(c.ratio.p50)} (%50 aralık ${f(c.ratio.p25)}–${f(c.ratio.p75)}) · sıra korelasyonu ${f(c.spearman)} · tahminde en iyi çeyrekteki santrallerin %${f(c.topQuartileHitPct, 0)}'i gerçekte en iyi yarıda`
  );
await prisma.$disconnect();
