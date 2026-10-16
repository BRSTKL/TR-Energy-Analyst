/**
 * Sektör karnesi verisi: EPİAŞ'ta üretimi yayımlanan lisanslı RES ve GES (isteğe bağlı HES) santrallerinin bir yıllık
 * göstergeleri ve saatlik serileri.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/sector-collect.mts [yıl=2025] [dönem sonu, YYYY-AA-GG] [--hes] [--rebuild] [--only-new]
 *
 *   --hes      hidroelektrik santralleri de toplar (hidro karnesi; yaklaşık bir saat ek süre)
 *   --rebuild  EPİAŞ'a bağlanmadan, havuzdaki saatlik serilerden ve veritabanındaki güncel piyasa fiyatlarından karneyi
 *              yeniden kurar (ör. piyasa verisi yeniden çekildikten sonra)
 *   --only-new yalnız diskte göstergesi olmayan hedefler EPİAŞ'tan çekilir (ör. tür kuralı değişince eklenen santraller);
 *              diğerlerinin dosyası olduğu gibi kalır, özet hepsinden kurulur
 *
 * Dönem sonu verilmezse geçmiş yıllarda 31 Aralık, içinde bulunulan yılda veritabanında piyasa verisi olan son tam gündür
 * (en güncel tarih; kullanıcı kararı 16.10.2026: veri her zaman en son tarihe kadar çekilir; önce piyasa verisi
 * senkronlanmalı). Özetin dönemi ise havuzdaki son üretim (UEVM) gününde biter: EPİAŞ UEVM'yi aylık yayımlar. Kalite süzgeci ve dağılımlar bu döneme göre hesaplanır.
 *
 * Veri tek yerden, veri havuzundan (data/pool; PLAN 7.5) okunur: her santral için ensurePlantCoverage havuzda olmayan ya da
 * yenilenme zamanı gelmiş ayları EPİAŞ'tan çekip havuza yazar (başka projelerin çektiği aylar yeniden çekilmez), sonra ilk
 * KGÜP ve UEVM havuzdan alınır → veritabanındaki piyasa fiyatlarıyla saatlik hesap → göstergeler. Her santral .cache/epias/sector-<yıl>/
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
import { buildTechIndex, resolveTechnology } from "../lib/sector/plant-technology";
import { resolveHydroKind, type GemHydroLite } from "../lib/sector/hydro-kind";
import { loadEpdkTechLicenses } from "../lib/sector/epdk-licenses";
import { fuelInRange } from "../lib/pool/pool-codec";
import { ensurePlantCoverage, type PoolFetchers } from "../lib/pool/pool-sync";
import { poolPlantRows } from "../lib/pool/pool-hours";
import { readPoolYear, writePoolPlantInfo } from "../lib/pool/pool-store";
import { processHourlyRecord } from "../lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, SystemDirection } from "../lib/calculations/types";
import { buildBenchmark, plantMetrics, type SectorPlantMetrics, type SectorTech } from "../lib/sector/benchmark";
import { encodeHourly } from "../lib/sector/hourly-store";
import { saveSectorHourly } from "../lib/services/sector";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const TYPES: SectorTech[] = flags.has("--hes") ? ["RES", "GES", "HES"] : ["RES", "GES"];
const rebuild = flags.has("--rebuild");
const year = Number(args[0] ?? 2025);
const now = new Date();
const prisma = new PrismaClient();
/** İçinde bulunulan yıl: piyasa verisi 23:00 saatine kadar olan son gün (dünden ileri değil) */
async function latestMarketDay(): Promise<string> {
  const last = await prisma.marketData.findFirst({ orderBy: { timestamp: "desc" }, select: { timestamp: true } });
  if (!last) throw new Error("Veritabanında piyasa verisi yok.");
  const t = last.timestamp.getTime();
  const fullDay = new Date(t - (last.timestamp.getUTCHours() === 23 ? 0 : 86_400_000)).toISOString().slice(0, 10);
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10);
  return fullDay < yesterday ? fullDay : yesterday;
}
const periodEnd = args[1] ?? (year < now.getUTCFullYear() ? `${year}-12-31` : await latestMarketDay());
if (!periodEnd.startsWith(`${year}-`)) throw new Error(`Dönem sonu ${year} içinde olmalı: ${periodEnd}`);
const periodStart = `${year}-01-01`;
const endExclusive = Date.parse(`${periodEnd}T00:00:00Z`) + 86_400_000;
const dir = path.join(process.cwd(), ".cache", "epias", `sector-${year}`);
await fs.mkdir(dir, { recursive: true });
const expectedHours = (endExclusive - Date.UTC(year, 0, 1)) / 3_600_000;
console.log(`dönem ${periodStart} – ${periodEnd} (${expectedHours} saat)`);

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
// Tür (lib/sector/plant-technology.ts): ad açıkça söylüyorsa ad, yoksa EPDK lisansı (sıkı ad eşleşmesi), yoksa havuzdaki
// UEVM kaynak kırılımı. EPDK dışa aktarımı yoksa (.cache/epdk) yalnız ad ve kırılım.
let techIndex: ReturnType<typeof buildTechIndex> | null = null;
try {
  techIndex = buildTechIndex(loadEpdkTechLicenses());
} catch {
  console.log("EPDK lisans listesi yok (.cache/epdk): tür addan ve UEVM kaynak kırılımından");
}
const techOf = async (p: { id: number; name: string }) => {
  const doc = await readPoolYear(p.id, year).catch(() => null);
  return resolveTechnology(p.name, techIndex, doc ? fuelInRange([doc], `${year}-01-01`, `${year}-12-31`) : null).type;
};
const targets: Target[] = (
  plantsAll
    ? await Promise.all(plantsAll.map(async (p) => ({ p, type: await techOf(p) })))
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
// Havuz sayesinde tamamlanmış santral EPİAŞ'a gitmez (ensurePlantCoverage yalnız eksik ve yenilenme zamanı gelmiş ayları
// çeker); bu yüzden her çalıştırmada bütün hedefler gezilir. Devam eden ay günde bir, biten ama kesinleşmemiş ay haftada bir
// yenilenir (havuz kuralı). Yeniden kurmada EPİAŞ'a hiç gidilmez.
const todo = rebuild ? [] : flags.has("--only-new") ? targets.filter((t) => !saved.has(t.p.id)) : targets;
console.log(`hedef ${targets.length} santral (${TYPES.join("+")}), diskte göstergesi olan ${saved.size}`);

if (rebuild) {
  // Havuzdaki saatlik serilerden, güncel fiyatlarla göstergeleri yeniden hesapla (havuzda verisi olmayan dosyaya dokunulmaz)
  let rebuilt = 0;
  for (const { p, type } of targets) {
    const rows = await poolPlantRows({ epiasPlantId: p.id, kgupVersion: "FIRST" }, periodStart, periodEnd);
    const old = saved.get(p.id);
    if (!old || rows.length === 0) continue;
    await saveSectorHourly(year, encodeHourly(p.id, rows, periodStart, periodEnd));
    const metrics = plantMetrics({ epiasPlantId: p.id, name: old.name, type, organizationName: old.organizationName, yekdem: old.yekdem }, price(rows));
    await fs.writeFile(path.join(dir, `${p.id}.json`), JSON.stringify(metrics));
    rebuilt++;
  }
  console.log(`yeniden hesaplanan ${rebuilt} santral; havuzda verisi olmayan ${targets.length - rebuilt} santral olduğu gibi kaldı`);
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

const fetchers: PoolFetchers = {
  listUevcbs: (id, day) => retry(() => listUevcbsForPlant(id, day)),
  kgup: (uevcb, start, end, version) => retry(() => fetchKgup(uevcb, start, end, version)),
  uevm: (id, start, end) => retry(() => fetchUevm(id, start, end)),
};

let next = 0;
let ok = 0;
let failed = 0;
const t0 = Date.now();
const worker = async () => {
  while (next < todo.length) {
    const { p, type } = todo[next++];
    try {
      // Havuzda olmayan ya da yenilenme zamanı gelmiş aylar EPİAŞ'tan çekilip havuza yazılır; hız sınırı sarmalayıcıyla
      const cov = await ensurePlantCoverage(p.id, periodStart, periodEnd, "FIRST", { fetchers });
      const failedMonth = cov.months.find((m) => m.source === "failed");
      if (failedMonth) throw new Error(failedMonth.error ?? "EPİAŞ verisi alınamadı");
      await writePoolPlantInfo({ epiasPlantId: p.id, type });
      const rows = await poolPlantRows({ epiasPlantId: p.id, kgupVersion: "FIRST" }, periodStart, periodEnd);
      await saveSectorHourly(year, encodeHourly(p.id, rows, periodStart, periodEnd));
      const hourly = price(rows);
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
      const diag = { uevcbCount: cov.uevcbs.length, kgupHours: cov.kgup.values.size, uevmHours: cov.uevm.values.size };
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
// Hidro alt tipi kayıttan (lib/sector/hydro-kind.ts; kullanıcı kararı 17.10.2026): GEM hidro izleyicisi, ad eki, EPDK lisansı.
// Santral dosyasındaki desen tahmini yalnız etiket (hydroKindGuess). Dosyalar yoksa (GEM / EPDK indirilmemiş) yalnız ad eki.
const readJson = async (f: string) => JSON.parse(await fs.readFile(path.join(process.cwd(), f), "utf8").catch(() => "null"));
const gemHydro: GemHydroLite[] = (await readJson(".cache/gem/hydro-tr.json"))?.plants ?? [];
const epdkHes: string[] = ((await readJson(".cache/epdk/hes-licenses.json"))?.licenses ?? []).map((l: { plant: string }) => l.plant);
const all: SectorPlantMetrics[] = [];
for (const f of await fs.readdir(dir)) {
  const m: SectorPlantMetrics = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
  const type = targetType.get(m.epiasPlantId);
  if (!type) continue;
  if (type === "HES") {
    const r = resolveHydroKind(m.name, gemHydro, epdkHes);
    all.push({ ...m, type, hydroKind: r.kind, hydroKindSource: r.source, hydroKindGuess: m.hydroKind ?? null });
  } else all.push({ ...m, type });
}
// İçinde bulunulan yılda dönem sonu verilmediyse özet, havuzdaki son üretim (UEVM) gününe kadar: EPİAŞ UEVM'yi aylık
// uzlaştırmadan sonra yayımlar (16.10.2026: Ekim'in KGÜP'ü var, UEVM'si yok). Santral göstergeleri zaten yalnız UEVM'si
// olan saatlerden; düzeltilen dönem etiketi ve kalite süzgecinin (veri ≥ %90) paydası.
let summaryEnd = periodEnd;
if (!args[1] && year === now.getUTCFullYear()) {
  let last = 0;
  for (const { p } of targets) {
    const doc = await readPoolYear(p.id, year).catch(() => null);
    if (!doc) continue;
    for (let i = doc.uevm.length - 1; i >= 0; i--)
      if (doc.uevm[i] !== null) {
        last = Math.max(last, Date.parse(doc.start) + i * 3_600_000);
        break;
      }
  }
  const dataEnd = last ? new Date(last).toISOString().slice(0, 10) : periodEnd;
  if (dataEnd < periodEnd) {
    summaryEnd = dataEnd;
    console.log(`üretim verisi (UEVM) ${dataEnd} gününe kadar: özet dönemi ${periodStart} – ${dataEnd}`);
  }
}
const summaryHours = (Date.parse(`${summaryEnd}T00:00:00Z`) + 86_400_000 - Date.UTC(year, 0, 1)) / 3_600_000;
const bench = { ...buildBenchmark(year, all, summaryHours), period: { start: periodStart, end: summaryEnd } };
await fs.writeFile(path.join(process.cwd(), ".cache", "epias", `sector-${year}.json`), JSON.stringify(bench));
console.log(`BİTTİ: toplanan ${all.length}, kıyaslamaya alınan ${bench.plants.length}, elenen ${bench.excluded}, bu turda hata ${failed}`);
for (const t of TYPES) {
  const d = bench.byType[t];
  if (!d) continue;
  console.log(`${t}: ${d.unitImbalanceTl.count} santral · dengesizlik TL/MWh medyan ${d.unitImbalanceTl.median.toFixed(0)} (P25 ${d.unitImbalanceTl.p25.toFixed(0)}, P75 ${d.unitImbalanceTl.p75.toFixed(0)}) · KÜPST medyan ${d.unitKupstTl.median.toFixed(0)}`);
}
await prisma.$disconnect();
