/**
 * Bağımsız doğrulama (PLAN 19, kabul): sektör capture rate'i lib/analysis/capture-rate.ts kullanılmadan ham veriden
 * (havuz dosyası zlib ile doğrudan, MarketData) yeniden hesaplanır ve .cache/epias/sector-capture.json ile karşılaştırılır:
 *   (1) bir santralin dönem capture rate'i (plantRates), (2) bir teknoloji grubunun bir ayının üretim ağırlıklı oranı.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/verify-capture.mts [yıl=2026] [grup=GES] [ay=05]
 *
 * Tanım: capture fiyatı = Σ üretim × PTF / Σ üretim; baz PTF = verisi olan saatlerin PTF ortalaması (her saat bir kez).
 * Fark %0,01 puanı aşarsa çıkış kodu 1.
 */

import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";

const year = Number(process.argv[2] ?? 2026);
const group = process.argv[3] ?? "GES";
const month = process.argv[4] ?? "05";
const CACHE = path.join(process.cwd(), ".cache", "epias");
const HOUR = 3_600_000;

const cache = JSON.parse(fs.readFileSync(path.join(CACHE, "sector-capture.json"), "utf8"));
const y = cache.years.find((x: { year: number }) => x.year === year);
if (!y) throw new Error(`${year} yok`);
const lastMonth: number = y.months;

const ptf = new Map(
  (
    await prisma.marketData.findMany({
      where: { timestamp: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year, lastMonth, 1)) } },
      select: { timestamp: true, ptf: true },
    })
  ).map((r) => [r.timestamp.getTime(), r.ptf])
);

/** Havuz dosyasını doğrudan oku: { start, uevm[] } */
function pool(id: number): { start: number; uevm: Array<number | null> } | null {
  const f = path.join(process.cwd(), "data", "pool", String(id), `${year}.json.gz`);
  if (!fs.existsSync(f)) return null;
  const doc = JSON.parse(gunzipSync(fs.readFileSync(f)).toString("utf8"));
  return { start: Date.parse(doc.start), uevm: doc.uevm };
}

/** Santral listesi → (seçilen ay ya da tüm dönem) üretim ağırlıklı oran, saatleri birleştirerek */
function rate(ids: number[], onlyMonth: string | null): { rate: number; mwh: number; hours: number } {
  const hourPtf = new Map<number, number>();
  let mwh = 0;
  let value = 0;
  for (const id of ids) {
    const d = pool(id);
    if (!d) continue;
    for (let i = 0; i < d.uevm.length; i++) {
      const t = d.start + i * HOUR;
      const mm = new Date(t).getUTCMonth() + 1;
      if (mm > lastMonth) break;
      if (onlyMonth && String(mm).padStart(2, "0") !== onlyMonth) continue;
      const u = d.uevm[i];
      const p = ptf.get(t);
      if (u === null || p === undefined) continue;
      const q = Math.max(0, u);
      hourPtf.set(t, p);
      mwh += q;
      value += q * p;
    }
  }
  const base = Array.from(hourPtf.values()).reduce((a, b) => a + b, 0) / hourPtf.size;
  return { rate: (value / mwh / base) * 100, mwh, hours: hourPtf.size };
}

let failed = false;
const check = (label: string, mine: number, cached: number) => {
  const diff = Math.abs(mine - cached);
  if (diff > 0.01) failed = true;
  console.log(`${label}: bağımsız %${mine.toFixed(4)} · önbellek %${cached.toFixed(4)} · fark ${diff.toFixed(4)} puan ${diff > 0.01 ? "✗" : "✓"}`);
};

// (1) Grubun en büyük santrali, dönem oranı (önbellek 2 ondalığa yuvarlı)
const plants: Array<[number, number, number]> = y.plantRates[group];
const [id, cachedRate] = [...plants].sort((a, b) => b[2] - a[2])[0];
const one = rate([id], null);
check(`${group} en büyük santral #${id} (${(one.mwh / 1000).toFixed(0)} GWh), ${year} Ocak–${lastMonth}`, one.rate, cachedRate);

// (2) Grubun bir ayı, üretim ağırlıklı (gruptaki bütün santraller: önbellekte 1 GWh altı da dahil; plantRates 1 GWh üstü)
const sector = JSON.parse(fs.readFileSync(path.join(CACHE, `sector-${year}.json`), "utf8")) as { plants: Array<{ epiasPlantId: number; type: string; hydroKind?: string | null }> };
const members = sector.plants.filter((p) => (group.startsWith("HES:") ? p.type === "HES" && `HES:${p.hydroKind}` === group : p.type === group)).map((p) => p.epiasPlantId);
const g = rate(members, month);
const cachedMonth = y.groups.find((x: { key: string }) => x.key === group).monthly.find((m: { month: string }) => m.month === `${year}-${month}`).ratePct;
check(`${group} ${year}-${month}, ${members.length} santral (${(g.mwh / 1000).toFixed(0)} GWh, ${g.hours} saat)`, g.rate, cachedMonth);

await prisma.$disconnect();
if (failed) process.exit(1);
