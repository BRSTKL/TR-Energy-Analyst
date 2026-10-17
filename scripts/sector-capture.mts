/**
 * Sektör capture rate (PLAN 19.2): sektör karnesinin santralleri (kalite süzgeçli) için capture fiyatı ve oranı,
 * teknoloji (rüzgâr, güneş, hidro barajlı / nehir tipi) ve ay bazında; santraller arası dağılım.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/sector-capture.mts [sonAy=karnedeki son tam ay]
 *
 * Yıllar: sektör karnesi olan yıllar (sector-<yıl>.json). Ana grup karnenin lisanslı santralleri; lisanssız toplamlar
 * (K3_, LÜM_, LÜY) yılın `unlicensed` alanında ayrı. Yıllar arası kıyas (`common`) iki yılda da aynı gruptaki lisanslı
 * santrallerle ve aynı aylarla (Ocak–<sonAy>); önceki yılın tam yılı ayrıca (fullYear). Üretim havuzdan (UEVM), PTF MarketData'dan. EPİAŞ'a gidilmez.
 * Çıktı: .cache/epias/sector-capture.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { readPoolYearCached } from "@/lib/pool/pool-store";
import { groupCapture, captureStat, type CaptureHour, type GroupCapture } from "@/lib/analysis/capture-rate";
import { karnePeriodEnd, lastFullMonth } from "@/lib/sector/period";

// Varsayılan: içinde bulunulan yılın karnesindeki son tam ay (lib/sector/period.ts)
const lastMonth = Number(process.argv[2] ?? lastFullMonth(karnePeriodEnd(new Date().getUTCFullYear()) ?? "2026-08-31"));
const CACHE = path.join(process.cwd(), ".cache", "epias");
const HOUR = 3_600_000;
const years = fs
  .readdirSync(CACHE)
  .map((f) => /^sector-(\d{4})\.json$/.exec(f)?.[1])
  .filter((y): y is string => !!y)
  .map(Number)
  .sort();

type SectorPlant = { epiasPlantId: number; name: string; type: string; hydroKind?: string | null };
const GROUP_LABEL: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro (hepsi)", "HES:RESERVOIR": "Hidro · barajlı", "HES:RUN_OF_RIVER": "Hidro · nehir tipi" };

async function ptfYear(year: number): Promise<Map<number, number>> {
  const rows = await prisma.marketData.findMany({
    where: { timestamp: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    select: { timestamp: true, ptf: true },
  });
  return new Map(rows.map((r) => [r.timestamp.getTime(), r.ptf]));
}

type Entry = { key: string; group: string; hours: CaptureHour[] };

/** Santral listesi → teknoloji (ve hidro alt tipi) girdileri; havuzda olmayanlar sayılır */
async function entriesOf(list: SectorPlant[], year: number, untilMonth: number, ptf: Map<number, number>): Promise<{ entries: Entry[]; missing: number }> {
  const entries: Entry[] = [];
  let missing = 0;
  for (const p of list) {
    const doc = await readPoolYearCached(p.epiasPlantId, year);
    if (!doc) {
      missing++;
      continue;
    }
    const start = Date.parse(doc.start);
    const hours: CaptureHour[] = [];
    for (let i = 0; i < doc.uevm.length; i++) {
      const t = start + i * HOUR;
      if (new Date(t).getUTCMonth() >= untilMonth) break;
      const u = doc.uevm[i];
      const price = ptf.get(t);
      if (u === null || price === undefined) continue;
      hours.push({ t, mwh: Math.max(0, u), ptf: price });
    }
    if (!hours.length) continue;
    const key = String(p.epiasPlantId);
    entries.push({ key, group: p.type, hours });
    if (p.type === "HES" && p.hydroKind) entries.push({ key, group: `HES:${p.hydroKind}`, hours });
  }
  return { entries, missing };
}

/**
 * Yılın capture'ı. Ana grup karnenin lisanslı santralleri (`plants`); lisanssız toplamlar (K3_, LÜM_, LÜY; karnede kıyas
 * dışı `unlicensed`) ayrı grup: gerçek üretim, ama EPİAŞ geçmişlerini sonradan değiştiriyor ve 2025 karnesinde yoklar.
 */
async function yearCapture(year: number, untilMonth: number) {
  const sector = JSON.parse(fs.readFileSync(path.join(CACHE, `sector-${year}.json`), "utf8")) as { plants: SectorPlant[]; unlicensed?: SectorPlant[] };
  const ptf = await ptfYear(year);
  const { entries, missing } = await entriesOf(sector.plants, year, untilMonth, ptf);
  const groups = groupCapture(entries);
  // Santral başına oran (sonuç sayfasında sektördeki yer için): grup → [id, oran, üretim]
  const plants: Record<string, Array<[number, number, number]>> = {};
  for (const e of entries) {
    const s = captureStat(e.hours);
    if (s.ratePct === null || s.mwh < 1000) continue;
    (plants[e.group] ??= []).push([Number(e.key), Math.round(s.ratePct * 100) / 100, Math.round(s.mwh)]);
  }
  const un = await entriesOf(sector.unlicensed ?? [], year, untilMonth, ptf);
  const unlicensed = un.entries.length ? { plants: new Set(un.entries.map((e) => e.key)).size, missing: un.missing, groups: groupCapture(un.entries) } : null;
  const result = { year, months: untilMonth, plants: new Set(entries.map((e) => e.key)).size, missing, groups, plantRates: plants, unlicensed };
  return { result, entries };
}

/** Yıllar arası kıyas: iki yılda da aynı gruptaki lisanslı santraller (ortak küme), aynı aylar */
function commonCapture(a: { year: number; entries: Entry[] }, b: { year: number; entries: Entry[] }, months: number) {
  const id = (e: Entry) => `${e.group}|${e.key}`;
  const inB = new Set(b.entries.map(id));
  const both = new Set(a.entries.map(id).filter((k) => inB.has(k)));
  return {
    fromYear: a.year,
    toYear: b.year,
    months,
    byYear: [a, b].map((y) => ({ year: y.year, groups: groupCapture(y.entries.filter((e) => both.has(id(e)))) })),
  };
}

const out: {
  generatedAt: string;
  lastMonth: number;
  years: Awaited<ReturnType<typeof yearCapture>>["result"][];
  common: ReturnType<typeof commonCapture> | null;
  fullYear: Awaited<ReturnType<typeof yearCapture>>["result"] | null;
} = {
  generatedAt: new Date().toISOString(),
  lastMonth,
  years: [],
  common: null,
  fullYear: null,
};
const yearEntries: Array<{ year: number; entries: Entry[] }> = [];
for (const y of years) {
  const { result, entries } = await yearCapture(y, lastMonth);
  out.years.push(result);
  yearEntries.push({ year: y, entries });
}
if (yearEntries.length > 1) out.common = commonCapture(yearEntries[yearEntries.length - 2], yearEntries[yearEntries.length - 1], lastMonth);
if (years.length > 1) out.fullYear = (await yearCapture(years[years.length - 2], 12)).result;
fs.writeFileSync(path.join(CACHE, "sector-capture.json"), JSON.stringify(out, null, 1));

const f = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "–" : v.toFixed(d));
const g = (yc: (typeof out.years)[number], key: string): GroupCapture | undefined => yc.groups.find((x) => x.key === key);
console.log(`Ocak–${lastMonth}. ay, ${out.years.map((y) => `${y.year}: ${y.plants} santral${y.missing ? ` (${y.missing} havuzda yok)` : ""}`).join(" · ")}\n`);
console.log("Grup".padEnd(20), out.years.map((y) => `${y.year}: oran / sıfır fiyatlı üretim / dağılım P10–P50–P90`.padEnd(54)).join(""));
for (const key of ["GES", "RES", "HES", "HES:RESERVOIR", "HES:RUN_OF_RIVER"]) {
  console.log(
    GROUP_LABEL[key].padEnd(20),
    out.years
      .map((y) => {
        const x = g(y, key);
        return x
          ? `%${f(x.pooled.ratePct)} / %${f(x.pooled.zeroSharePct)} / ${f(x.distribution?.p10, 0)}–${f(x.distribution?.p50, 0)}–${f(x.distribution?.p90, 0)} (n=${x.distribution?.n ?? 0})`.padEnd(54)
          : "–".padEnd(54);
      })
      .join("")
  );
}
for (const y of out.years)
  if (y.unlicensed)
    console.log(
      `${y.year} lisanssız toplamlar (ayrı, ${y.unlicensed.plants} santral): ${y.unlicensed.groups.map((x) => `${GROUP_LABEL[x.key] ?? x.key} %${f(x.pooled.ratePct)} (${x.plants}, ${f(x.pooled.mwh / 1e6, 2)} TWh)`).join(" · ")}`
    );
if (out.common) {
  console.log(`\nOrtak küme (iki yılda da aynı grupta lisanslı santraller), ${out.common.fromYear} → ${out.common.toYear}:`);
  for (const key of ["GES", "RES", "HES", "HES:RESERVOIR", "HES:RUN_OF_RIVER"]) {
    const [a, b] = out.common.byYear.map((y) => y.groups.find((x) => x.key === key));
    console.log(`  ${GROUP_LABEL[key].padEnd(20)} %${f(a?.pooled.ratePct)} → %${f(b?.pooled.ratePct)} (${b?.plants ?? 0} santral)`);
  }
}
for (const key of ["GES", "RES", "HES"]) {
  console.log(`\n${GROUP_LABEL[key]}, aylık capture rate (%):`);
  for (const y of out.years) console.log(`  ${y.year}: ${(g(y, key)?.monthly ?? []).map((m) => `${m.month.slice(5)}:${f(m.ratePct, 0)}`).join(" ")}`);
}
if (out.fullYear)
  console.log(
    `\n${out.fullYear.year} tam yıl: ${["GES", "RES", "HES"].map((k) => `${GROUP_LABEL[k]} %${f(g(out.fullYear!, k)?.pooled.ratePct)}`).join(" · ")}`
  );
await prisma.$disconnect();
