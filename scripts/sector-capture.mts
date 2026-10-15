/**
 * Sektör capture rate (PLAN 19.2): sektör karnesinin santralleri (kalite süzgeçli) için capture fiyatı ve oranı,
 * teknoloji (rüzgâr, güneş, hidro barajlı / nehir tipi) ve ay bazında; santraller arası dağılım.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/sector-capture.mts [sonAy=8]
 *
 * Yıllar: sektör karnesi olan yıllar (sector-<yıl>.json). Kıyas iki yılda da Ocak–<sonAy> (aynı aylar); önceki yılın tam
 * yılı ayrıca (fullYear). Üretim havuzdan (UEVM), PTF MarketData'dan. EPİAŞ'a gidilmez.
 * Çıktı: .cache/epias/sector-capture.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { readPoolYearCached } from "@/lib/pool/pool-store";
import { groupCapture, captureStat, type CaptureHour, type GroupCapture } from "@/lib/analysis/capture-rate";

const lastMonth = Number(process.argv[2] ?? 8);
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

async function yearCapture(year: number, untilMonth: number) {
  const sector = JSON.parse(fs.readFileSync(path.join(CACHE, `sector-${year}.json`), "utf8")) as { plants: SectorPlant[] };
  const ptf = await ptfYear(year);
  const entries: Array<{ key: string; group: string; hours: CaptureHour[] }> = [];
  let missing = 0;
  for (const p of sector.plants) {
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
  const groups = groupCapture(entries);
  // Santral başına oran (sonuç sayfasında sektördeki yer için): grup → [id, oran, üretim]
  const plants: Record<string, Array<[number, number, number]>> = {};
  for (const e of entries) {
    const s = captureStat(e.hours);
    if (s.ratePct === null || s.mwh < 1000) continue;
    (plants[e.group] ??= []).push([Number(e.key), Math.round(s.ratePct * 100) / 100, Math.round(s.mwh)]);
  }
  return { year, months: untilMonth, plants: new Set(entries.map((e) => e.key)).size, missing, groups, plantRates: plants };
}

const out: { generatedAt: string; lastMonth: number; years: Awaited<ReturnType<typeof yearCapture>>[]; fullYear: Awaited<ReturnType<typeof yearCapture>> | null } = {
  generatedAt: new Date().toISOString(),
  lastMonth,
  years: [],
  fullYear: null,
};
for (const y of years) out.years.push(await yearCapture(y, lastMonth));
if (years.length > 1) out.fullYear = await yearCapture(years[years.length - 2], 12);
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
for (const key of ["GES", "RES", "HES"]) {
  console.log(`\n${GROUP_LABEL[key]}, aylık capture rate (%):`);
  for (const y of out.years) console.log(`  ${y.year}: ${(g(y, key)?.monthly ?? []).map((m) => `${m.month.slice(5)}:${f(m.ratePct, 0)}`).join(" ")}`);
}
if (out.fullYear)
  console.log(
    `\n${out.fullYear.year} tam yıl: ${["GES", "RES", "HES"].map((k) => `${GROUP_LABEL[k]} %${f(g(out.fullYear!, k)?.pooled.ratePct)}`).join(" · ")}`
  );
await prisma.$disconnect();
