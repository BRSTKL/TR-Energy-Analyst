/**
 * Sektör karnesi verisi: EPİAŞ'ta üretimi yayımlanan lisanslı RES ve GES (isteğe bağlı HES) santrallerinin bir yıllık
 * göstergeleri ve saatlik serileri.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/sector-collect.mts [yıl=2025] [dönem sonu, YYYY-AA-GG] [--hes] [--rebuild]
 *
 *   --hes      hidroelektrik santralleri de toplar (hidro karnesi; yaklaşık bir saat ek süre)
 *   --rebuild  EPİAŞ'a bağlanmadan, diskteki saatlik serilerden ve veritabanındaki güncel piyasa fiyatlarından karneyi
 *              yeniden kurar (ör. piyasa verisi yeniden çekildikten sonra)
 *
 * Dönem sonu verilmezse geçmiş yıllarda 31 Aralık, içinde bulunulan yılda geçen ayın son günüdür (yıl içi karne:
 * ör. 2026 için Ocak–Ağustos). Kalite süzgeci ve dağılımlar bu döneme göre hesaplanır.
 *
 * Her santral için: uzlaştırma birimleri → KGÜP ilk versiyon (çeyrek parçalar; UEVM servisi en fazla 3 ay kabul eder)
 * → UEVM → veritabanındaki piyasa fiyatlarıyla saatlik hesap → göstergeler. Her santral .cache/epias/sector-<yıl>/
 * altına ayrı dosya olarak, saatlik plan ve gerçekleşen serisi .cache/epias/sector-<yıl>-hourly/ altına sıkıştırılmış
 * yazılır: bağlantı koparsa tekrar çalıştırıldığında yalnızca eksikler çekilir. Saatlik serisi olmayan (bu özellikten
 * önce toplanmış) santraller de yeniden çekilir.
 * Sonunda .cache/epias/sector-<yıl>.json özet dosyası (kalite süzgecinden geçenler ve dağılımlar) üretilir.
 * Hiç ortak saati olmayan (boş) santraller her çalıştırmada yeniden denenir; uzlaştırma birimi yıl başında yoksa
 * (yıl içinde devreye giren santral) yıl ortası ve yıl sonu tarihleriyle de aranır.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { fetchKgup, fetchUevm, listUevcbsForPlant, listUevmPowerPlants, listYekdemPlantIds, plantOwnerIndex } from "../lib/services/epias-plants";
import { guessTechnologyFromName, mergePlantSeries, parseKgupItems, parseUevmItems, sumSeries } from "../lib/epias-plant/plant-data";
import { processHourlyRecord } from "../lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, SystemDirection } from "../lib/calculations/types";
import { buildBenchmark, plantMetrics, type SectorPlantMetrics, type SectorTech } from "../lib/sector/benchmark";
import { decodeHourly, encodeHourly } from "../lib/sector/hourly-store";
import { listSectorHourlyIds, loadSectorHourly, saveSectorHourly } from "../lib/services/sector";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const TYPES: SectorTech[] = flags.has("--hes") ? ["RES", "GES", "HES"] : ["RES", "GES"];
const rebuild = flags.has("--rebuild");
const year = Number(args[0] ?? 2025);
const now = new Date();
const periodEnd =
  args[1] ??
  (year < now.getUTCFullYear() ? `${year}-12-31` : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10));
if (!periodEnd.startsWith(`${year}-`)) throw new Error(`Dönem sonu ${year} içinde olmalı: ${periodEnd}`);
const periodStart = `${year}-01-01`;
const endExclusive = Date.parse(`${periodEnd}T00:00:00Z`) + 86_400_000;
const dir = path.join(process.cwd(), ".cache", "epias", `sector-${year}`);
await fs.mkdir(dir, { recursive: true });
// UEVM servisi en fazla 3 ay kabul eder: çeyrekler dönem sonuna kırpılır
const quarters = [
  [`${year}-01-01`, `${year}-03-31`],
  [`${year}-04-01`, `${year}-06-30`],
  [`${year}-07-01`, `${year}-09-30`],
  [`${year}-10-01`, `${year}-12-31`],
]
  .filter(([s]) => s <= periodEnd)
  .map(([s, e]) => [s, e < periodEnd ? e : periodEnd]);
const expectedHours = (endExclusive - Date.UTC(year, 0, 1)) / 3_600_000;
console.log(`dönem ${periodStart} – ${periodEnd} (${expectedHours} saat)`);

const prisma = new PrismaClient();
const market = new Map(
  (await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(endExclusive) } } })).map((m) => [
    m.timestamp.getTime(),
    m,
  ])
);
console.log(`piyasa verisi: ${market.size} / ${expectedHours} saat`);
if (market.size < expectedHours * 0.99) throw new Error("Dönemin piyasa verisi eksik; önce EPİAŞ'tan piyasa verisini senkronlayın.");

// Diskteki santral dosyaları (kimlik → göstergeler)
const saved = new Map<number, SectorPlantMetrics>();
for (const f of await fs.readdir(dir)) saved.set(Number(f.replace(".json", "")), JSON.parse(await fs.readFile(path.join(dir, f), "utf8")));

// Yeniden kurarken EPİAŞ'a bağlanılmaz: hedefler diskteki dosyalardan, teknoloji dosyadaki türden
const [plantsAll, owners, yekdem] = rebuild
  ? [null, null, null]
  : await Promise.all([
      listUevmPowerPlants(),
      plantOwnerIndex(year).then((i) => i.owners).catch(() => null),
      listYekdemPlantIds(year).catch(() => null),
    ]);
type Target = { p: { id: number; name: string; shortName?: string | null }; type: SectorTech };
const targets: Target[] = (
  plantsAll
    ? plantsAll.map((p) => ({ p, type: guessTechnologyFromName(p.name) }))
    : Array.from(saved.entries()).map(([id, m]) => ({ p: { id, name: m.name }, type: m.type as string }))
).filter((x): x is Target => TYPES.includes(x.type as SectorTech));
/** Santralin saatlik sonuçları: veritabanındaki piyasa fiyatlarıyla (fiyatı olmayan saat atlanır) */
const price = (rows: Array<{ timestamp: Date; forecastMwh: number; actualMwh: number }>) =>
  rows.flatMap((row) => {
    const m = market.get(row.timestamp.getTime());
    return m
      ? [
          processHourlyRecord(
            { timestamp: row.timestamp, forecastMwh: row.forecastMwh, actualMwh: row.actualMwh },
            {
              timestamp: m.timestamp,
              ptf: m.ptf,
              smf: m.smf,
              systemDirection: m.systemDirection as SystemDirection,
              imbalancePosPrice: m.imbalancePosPrice,
              imbalanceNegPrice: m.imbalanceNegPrice,
            },
            DEFAULT_IMBALANCE_PROFILE
          ),
        ]
      : [];
  });
// Tamamlanmış sayılan: en az bir ortak saati ve saatlik serisi olan santral (boş sonuçlar yeniden denenir)
const withHourly = new Set(await listSectorHourlyIds(year));
const done = new Set(Array.from(saved.entries()).filter(([id, m]) => m.hours > 0 && withHourly.has(id)).map(([id]) => id));
const todo = rebuild ? [] : targets.filter((x) => !done.has(x.p.id));
console.log(`hedef ${targets.length} santral (${TYPES.join("+")}), tamamlanmış ${done.size}, kalan ${todo.length}`);

if (rebuild) {
  // Diskteki saatlik serilerden, güncel fiyatlarla göstergeleri yeniden hesapla (saatlik serisi olmayan dosyaya dokunulmaz)
  let rebuilt = 0;
  for (const { p, type } of targets) {
    const series = done.has(p.id) ? await loadSectorHourly(year, p.id) : null;
    if (!series) continue;
    const old = saved.get(p.id)!;
    const metrics = plantMetrics({ epiasPlantId: p.id, name: old.name, type, organizationName: old.organizationName, yekdem: old.yekdem }, price(decodeHourly(series)));
    await fs.writeFile(path.join(dir, `${p.id}.json`), JSON.stringify(metrics));
    rebuilt++;
  }
  console.log(`yeniden hesaplanan ${rebuilt} santral; saatlik serisi olmayan ${targets.length - rebuilt} santral olduğu gibi kaldı`);
}

// EPİAŞ hız sınırı: kontrolsüz paralel isteklerde HTTP 429 dönüyor. İstek başına 2–3 sn sürdüğü için az sayıda paralel
// işçi, ortak bir hız sınırıyla (istek başlatmaları arası en az MIN_GAP_MS) çalışır; 429'da giderek uzayan bekleme.
const WORKERS = Number(process.env.SECTOR_WORKERS ?? 3);
const MIN_GAP_MS = Number(process.env.SECTOR_GAP_MS ?? 350);
let rateLimitedCount = 0;
let lastCall = 0;
const pace = async () => {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
};
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    await pace();
    try {
      return await fn();
    } catch (e) {
      const rateLimited = e instanceof Error && e.message.includes("HTTP 429");
      if (rateLimited) rateLimitedCount++;
      if (attempt >= (rateLimited ? 6 : 3)) throw e;
      await new Promise((r) => setTimeout(r, rateLimited ? 15000 * attempt : 2000 * attempt));
    }
  }
};

let next = 0;
let ok = 0;
let failed = 0;
const t0 = Date.now();
const worker = async () => {
  while (next < todo.length) {
    const { p, type } = todo[next++];
    try {
      // Yıl içinde devreye giren santralin uzlaştırma birimi yıl başında listelenmez
      let uevcbs = await retry(() => listUevcbsForPlant(p.id, `${year}-01-01`));
      for (const day of [`${year}-07-01`, `${year}-12-01`].filter((d) => d <= periodEnd)) {
        if (uevcbs.length) break;
        uevcbs = await retry(() => listUevcbsForPlant(p.id, day));
      }
      const kParts = [];
      const uParts = [];
      for (const [s, e] of quarters) {
        for (const u of uevcbs) kParts.push(parseKgupItems(await retry(() => fetchKgup(u.id, s, e, "FIRST"))));
        uParts.push(parseUevmItems(await retry(() => fetchUevm(p.id, s, e))));
      }
      const kgup = sumSeries(kParts);
      const uevm = sumSeries(uParts);
      const merged = mergePlantSeries(kgup, uevm, periodStart, periodEnd);
      await saveSectorHourly(year, encodeHourly(p.id, merged.rows, periodStart, periodEnd));
      const hourly = price(merged.rows);
      const metrics: SectorPlantMetrics = plantMetrics(
        {
          epiasPlantId: p.id,
          name: p.shortName?.trim() || p.name,
          type,
          organizationName: owners?.get(p.id)?.organizationName ?? null,
          yekdem: yekdem ? yekdem.has(p.id) : null,
        },
        hourly
      );
      // Tanı bilgisi: boş sonuçların nedenini görmek için
      const diag = { uevcbCount: uevcbs.length, kgupHours: kgup.values.size, uevmHours: uevm.values.size };
      await fs.writeFile(path.join(dir, `${p.id}.json`), JSON.stringify({ ...metrics, diag }));
      ok++;
    } catch (e) {
      failed++;
      console.log(`HATA ${p.name}: ${e instanceof Error ? e.message.split("\n")[0].slice(0, 120) : e}`);
    }
    const n = ok + failed;
    if (n % 10 === 0)
      console.log(`${n}/${todo.length} · başarılı ${ok} · hata ${failed} · 429 sayısı ${rateLimitedCount} · ${((Date.now() - t0) / 60000).toFixed(1)} dk`);
  }
};
await Promise.all(Array.from({ length: WORKERS }, worker));

// Özet yalnızca bu turun hedeflerinden kurulur; teknoloji güncel ad tahmininden alınır (tahmin düzeldiyse eski dosyadaki
// yanlış tür kıyaslamaya girmez, hedef dışına düşen santral dışarıda kalır)
const targetType = new Map(targets.map((x) => [x.p.id, x.type]));
const all: SectorPlantMetrics[] = [];
for (const f of await fs.readdir(dir)) {
  const m: SectorPlantMetrics = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
  const type = targetType.get(m.epiasPlantId);
  if (type) all.push({ ...m, type });
}
const bench = { ...buildBenchmark(year, all, expectedHours), period: { start: periodStart, end: periodEnd } };
await fs.writeFile(path.join(process.cwd(), ".cache", "epias", `sector-${year}.json`), JSON.stringify(bench));
console.log(`BİTTİ: toplanan ${all.length}, kıyaslamaya alınan ${bench.plants.length}, elenen ${bench.excluded}, bu turda hata ${failed}`);
for (const t of TYPES) {
  const d = bench.byType[t];
  if (!d) continue;
  console.log(`${t}: ${d.unitImbalanceTl.count} santral · dengesizlik TL/MWh medyan ${d.unitImbalanceTl.median.toFixed(0)} (P25 ${d.unitImbalanceTl.p25.toFixed(0)}, P75 ${d.unitImbalanceTl.p75.toFixed(0)}) · KÜPST medyan ${d.unitKupstTl.median.toFixed(0)}`);
}
await prisma.$disconnect();
