/**
 * Veri havuzuna mevcut veriyi aktarır (PLAN 7.3). EPİAŞ'a gidilmez.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/pool-import.mts [--dry]
 *
 * 1. Sektör önbelleği (.cache/epias/sector-<yıl>-hourly): plan = ilk KGÜP, gerçekleşen = UEVM. Çekilme anı olarak
 *    dosyanın tarihi yazılır; son 90 gün içindeki aylar böylece geçici sayılır ve ilk ihtiyaçta yeniden kontrol edilir.
 * 2. EPİAŞ'tan eklenmiş proje santrallerinin kayıtları: yalnız havuzda hâlâ eksik olan aylar.
 * Havuzda zaten olan ay üzerine yazılmaz; betik tekrar çalıştırılabilir.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import { emptyYear, monthStatus, writeMonth, type PoolSeries, type PoolYear } from "@/lib/pool/pool-codec";
import { readPoolPlantInfo, readPoolYear, writePoolPlantInfo, writePoolYear } from "@/lib/pool/pool-store";

const dry = process.argv.includes("--dry");
const CACHE = path.join(process.cwd(), ".cache", "epias");
const HOUR = 3_600_000;
const TYPES = new Set(["RES", "HES", "GES"]);

type Row = { t: number; kgup: number | null; uevm: number | null };

/** Satırları ay ay havuza yazar; havuzda zaten olan (eksik olmayan) seri-aylar atlanır. Yazılan ay sayısı */
async function importRows(epiasPlantId: number, rows: Row[], kSeries: PoolSeries, fetchedAt: Date): Promise<number> {
  const byYearMonth = new Map<string, Row[]>();
  for (const r of rows) {
    const d = new Date(r.t);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    (byYearMonth.get(key) ?? byYearMonth.set(key, []).get(key)!).push(r);
  }
  const docs = new Map<number, PoolYear>();
  let written = 0;
  for (const [key, monthRows] of byYearMonth) {
    const [year, month] = key.split("-").map(Number);
    if (!docs.has(year)) docs.set(year, (await readPoolYear(epiasPlantId, year)) ?? emptyYear(epiasPlantId, year));
    const doc = docs.get(year)!;
    for (const [series, pick] of [[kSeries, (r: Row) => r.kgup], ["uevm", (r: Row) => r.uevm]] as const) {
      if (monthStatus(doc, series, month) !== "missing") continue;
      const values = monthRows.flatMap((r) => (pick(r) === null ? [] : [{ timestamp: new Date(r.t), value: pick(r)! }]));
      writeMonth(doc, series, month, values, fetchedAt);
      written++;
    }
  }
  if (!dry) for (const doc of docs.values()) await writePoolYear(doc);
  return written;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

// 1. Sektör önbelleği
let plants = 0;
let months = 0;
for (const year of [2024, 2025, 2026]) {
  const dir = path.join(CACHE, `sector-${year}-hourly`);
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json.gz"));
  } catch {
    continue;
  }
  let yearMonths = 0;
  for (const f of files) {
    const file = path.join(dir, f);
    const s = JSON.parse(gunzipSync(await fs.readFile(file)).toString("utf8")) as {
      epiasPlantId: number; start: string; forecast: Array<number | null>; actual: Array<number | null>;
    };
    const t0 = Date.parse(s.start);
    const rows: Row[] = s.forecast.map((k, i) => ({ t: t0 + i * HOUR, kgup: k, uevm: s.actual[i] }));
    const fetchedAt = (await fs.stat(file)).mtime;
    yearMonths += await importRows(s.epiasPlantId, rows, "kgupFirst", fetchedAt);
    const meta = await readJson<{ name?: string; type?: string }>(path.join(CACHE, `sector-${year}`, `${s.epiasPlantId}.json`));
    const info = await readPoolPlantInfo(s.epiasPlantId);
    if (!dry && meta && !info?.type && TYPES.has(meta.type ?? "")) {
      await writePoolPlantInfo({ epiasPlantId: s.epiasPlantId, name: meta.name, type: meta.type as "RES" | "HES" | "GES" });
    }
    plants++;
  }
  months += yearMonths;
  console.log(`Sektör ${year}: ${files.length} santral dosyası, ${yearMonths} seri-ay yazıldı`);
}

// 2. Proje santralleri
const projectPlants = await prisma.powerPlant.findMany({
  where: { epiasPlantId: { not: null } },
  select: { id: true, name: true, type: true, epiasPlantId: true, kgupVersion: true, uevcbIds: true, createdAt: true },
});
let projectMonths = 0;
for (const p of projectPlants) {
  const recs = await prisma.generationRecord.findMany({
    where: { plantId: p.id },
    select: { timestamp: true, forecastMwh: true, actualMwh: true },
    orderBy: { timestamp: "asc" },
  });
  const kSeries: PoolSeries = p.kgupVersion === "FINAL" ? "kgupFinal" : "kgupFirst";
  projectMonths += await importRows(
    p.epiasPlantId!,
    recs.map((r) => ({ t: r.timestamp.getTime(), kgup: r.forecastMwh, uevm: r.actualMwh })),
    kSeries,
    p.createdAt
  );
  const info = await readPoolPlantInfo(p.epiasPlantId!);
  if (!dry) {
    await writePoolPlantInfo({
      epiasPlantId: p.epiasPlantId!,
      name: info?.name ?? p.name,
      ...(info?.type || !TYPES.has(p.type) ? {} : { type: p.type as "RES" | "HES" | "GES" }),
      ...(info?.uevcbs?.length || !p.uevcbIds
        ? {}
        : { uevcbs: p.uevcbIds.split(",").map((id) => ({ id: Number(id), name: id })), uevcbsAt: p.createdAt.toISOString() }),
    });
  }
}
console.log(`Projeler: ${projectPlants.length} santral, ${projectMonths} eksik seri-ay yazıldı`);
console.log(`${dry ? "(deneme) " : ""}Toplam: ${months + projectMonths} seri-ay`);
await prisma.$disconnect();
