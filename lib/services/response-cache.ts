/**
 * TR-Energy Analyst - Proje hesaplarının önbelleği (PLAN 10.2)
 *
 * Sayfalar her açılışta aynı ağır hesabı yapıyordu (61 santrallik portföyde sonuç 5 sn, DSG 15 sn, ana sayfa 20 sn).
 * Hesap sonucu bellekte tutulur; projenin "veri sürümü" değişince kendiliğinden geçersiz olur. Sürüm şunlardan oluşur:
 *   - proje, santraller ve fiyat profilinin son güncellenme anı ve sayıları
 *   - projenin veritabanı kayıtlarının sayısı (dosyadan yüklenen santraller)
 *   - dönemdeki piyasa verisinin son senkronu ve resmi fiyatlı saat sayısı
 *   - havuzdan okunan santrallerin havuz dosyalarının değişme anı
 *   - sektör karnesi ve toplayıcı kıyası önbellek dosyalarının değişme anı
 * Yanlış (eski) rakam göstermemek için sürüm her istekte hesaplanır (hafif: birkaç sorgu ve dosya stat'ı).
 *
 * İki katman: bellek (süreç içi) ve disk (`.cache/responses/<proje>/<anahtarın özeti>.json.gz`; yalnız proje rotalarının JSON
 * cevapları, `persist`). Disk katmanı iki iş görür: (1) önbellek ısıtma ayrı bir süreçte hesaplar (scripts/warm-cache.mts),
 * ziyaretçiye bakan süreç sonucu diskten okur ve ağır hesap sırasında meşgul olmaz; (2) sunucu yeniden başlayınca veri ve
 * kod sürümü aynıysa hesap yeniden yapılmaz. Kod sürümü üretimde derleme kimliğidir (`.next/BUILD_ID`): yeni yüklemeden
 * sonra eski kodun diskteki sonucu kullanılmaz.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { prisma } from "@/lib/prisma";
import { poolDir } from "@/lib/pool/pool-store";
import { projectPeriod } from "@/lib/services/project-records";

// 15 proje × ≈ 17 hesap ≈ 255 kayıt, üstüne santral / parametre seçimleri (hata ayıklama testi 16.10.2026: 120 kayıtta bütün
// projeler gezilince ağır hesaplar düşüp yeniden yapılıyordu). En az kullanılan atılır; kayıtlar çoğunlukla ≤ 1 MB.
const MAX_ENTRIES = 400;
// Geliştirme sunucusu modülleri yeniden yükler ve rotalar ayrı paketlenebilir: önbellek süreç genelinde tek olsun
const g = globalThis as unknown as {
  __trResponseCache?: Map<string, { version: string; value: unknown }>;
  __trResponseInflight?: Map<string, Promise<unknown>>;
};
const store = (g.__trResponseCache ??= new Map());
/** Aynı anda gelen aynı istekler tek hesap yapar */
const inflight = (g.__trResponseInflight ??= new Map());

/**
 * Geliştirmede hesap kodunun sürümü: lib/ ve app/api/ altındaki dosyaların en son değişme anı (5 sn bellekte). Sunucu
 * açıkken motor değişince önbellek eski rakamı vermesin (DSG son plana geçince sayfa ilk planlı sonucu gösteriyordu).
 * Üretim derlemesinde kod çalışırken değişmez: derleme kimliği (`.next/BUILD_ID`) kullanılır, süreç boyunca bir kez okunur.
 */
let codeStamp = { at: 0, value: 0 };
let buildId: Promise<string> | null = null;
async function codeVersion(): Promise<number | string> {
  if (process.env.NODE_ENV === "production")
    return (buildId ??= fs.readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").then(
      (v) => v.trim() || "0",
      () => "0"
    ));
  if (Date.now() - codeStamp.at < 5000) return codeStamp.value;
  let max = 0;
  const walk = async (dir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(ts|tsx)$/.test(e.name)) max = Math.max(max, await mtime(full));
    }
  };
  await Promise.all([walk(path.join(process.cwd(), "lib")), walk(path.join(process.cwd(), "app", "api"))]);
  codeStamp = { at: Date.now(), value: max };
  return max;
}

async function mtime(file: string): Promise<number> {
  try {
    return (await fs.stat(file)).mtimeMs;
  } catch {
    return 0;
  }
}

export async function projectVersion(projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      plants: { select: { id: true, updatedAt: true, epiasPlantId: true, poolBacked: true } },
      pricingProfiles: { select: { updatedAt: true } },
    },
  });
  if (!project) return null;
  const period = await projectPeriod(project);
  const parts: Array<string | number> = [
    await codeVersion(),
    project.updatedAt.getTime(),
    project.plants.length,
    Math.max(0, ...project.plants.map((p) => p.updatedAt.getTime())),
    Math.max(0, ...project.pricingProfiles.map((p) => p.updatedAt.getTime())),
    period ? `${period.start}|${period.end}` : "-",
  ];
  const dbPlants = project.plants.filter((p) => !p.poolBacked).map((p) => p.id);
  if (dbPlants.length) {
    const agg = await prisma.generationRecord.aggregate({ where: { plantId: { in: dbPlants } }, _count: { _all: true }, _max: { updatedAt: true } });
    parts.push(agg._count._all, agg._max.updatedAt?.getTime() ?? 0);
  }
  if (period) {
    const range = { gte: new Date(`${period.start}T00:00:00Z`), lte: new Date(`${period.end}T23:00:00Z`) };
    const [m, official] = await Promise.all([
      prisma.marketData.aggregate({ where: { timestamp: range }, _count: { _all: true }, _max: { syncedAt: true } }),
      prisma.marketData.count({ where: { timestamp: range, imbalancePosPrice: { not: null } } }),
    ]);
    parts.push(m._count._all, m._max.syncedAt?.getTime() ?? 0, official);
    const years = new Set<number>();
    for (let y = Number(period.start.slice(0, 4)); y <= Number(period.end.slice(0, 4)); y++) years.add(y);
    let poolMax = 0;
    for (const p of project.plants) {
      if (!p.poolBacked || p.epiasPlantId === null) continue;
      for (const y of Array.from(years)) poolMax = Math.max(poolMax, await mtime(path.join(poolDir(), String(p.epiasPlantId), `${y}.json.gz`)));
    }
    parts.push(poolMax);
    const cache = path.join(process.cwd(), ".cache", "epias");
    for (const y of Array.from(years)) {
      parts.push(await mtime(path.join(cache, `sector-${y}.json`)), await mtime(path.join(cache, `aggregator-benchmark-${y}.json`)));
    }
  }
  return parts.join(":");
}

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** Disk katmanının klasörü; testlerde kapalı (RESPONSE_CACHE_DIR verilmedikçe) */
function diskDir(): string | null {
  if (process.env.RESPONSE_CACHE_DIR) return process.env.RESPONSE_CACHE_DIR;
  if (process.env.NODE_ENV === "test") return null;
  return path.join(process.cwd(), ".cache", "responses");
}

function diskFile(projectId: string, key: string): string | null {
  const dir = diskDir();
  if (!dir || !/^[\w-]+$/.test(projectId)) return null;
  return path.join(dir, projectId, `${createHash("sha1").update(key).digest("hex")}.json.gz`);
}

/** Diskteki sonuç; yoksa, bozuksa ya da sürümü / anahtarı farklıysa undefined. Okunan dosyanın tarihi yenilenir (temizlik buna bakar) */
async function readDisk(projectId: string, key: string, version: string): Promise<{ value: unknown } | undefined> {
  const file = diskFile(projectId, key);
  if (!file) return undefined;
  try {
    const saved = JSON.parse((await gunzipAsync(await fs.readFile(file))).toString("utf8")) as { version: string; key: string; value: unknown };
    if (saved.version !== version || saved.key !== key) return undefined;
    const now = new Date();
    fs.utimes(file, now, now).catch(() => {});
    return { value: saved.value };
  } catch {
    return undefined;
  }
}

/** Sonucu diske yazar (önce geçici dosya, sonra yeniden adlandırma: yarım dosya okunmaz). Hata sessizce yutulur: disk yalnız hızlandırır */
async function writeDisk(projectId: string, key: string, version: string, value: unknown): Promise<void> {
  const file = diskFile(projectId, key);
  if (!file) return;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, await gzipAsync(JSON.stringify({ version, key, value })));
    await fs.rename(tmp, file);
  } catch {
    // disk dolu / izin yok: bellek katmanı yeter
  }
}

/** Disk katmanında `maxAgeDays` gündür okunmamış ve yazılmamış dosyaları siler; silinen dosya sayısını döndürür */
export async function pruneResponseDisk(maxAgeDays = 14, now = Date.now()): Promise<number> {
  const dir = diskDir();
  if (!dir) return 0;
  let removed = 0;
  let projects: string[];
  try {
    projects = await fs.readdir(dir);
  } catch {
    return 0;
  }
  for (const project of projects) {
    let files: string[];
    try {
      files = await fs.readdir(path.join(dir, project));
    } catch {
      continue;
    }
    for (const f of files) {
      const full = path.join(dir, project, f);
      if (now - (await mtime(full)) > maxAgeDays * 86_400_000) {
        await fs.rm(full, { force: true });
        removed++;
      }
    }
  }
  return removed;
}

/**
 * Projenin bir hesabını önbellekten döndürür; sürüm değiştiyse ya da yoksa hesaplar. `key` aynı projede farklı
 * hesapları ayırır (ör. "results", "dsg?plants=…"). Proje yoksa compute yine çağrılır (404 cevabı ona aittir).
 * `persist`: sonuç diske de yazılır ve bellekte yoksa diskten okunur; yalnız JSON'a birebir çevrilebilen değerler için
 * (Map, Date, sınıf örneği içeren değerlerde kullanılmaz).
 */
export async function cachedForProject<T>(projectId: string, key: string, compute: () => Promise<T>, opts: { persist?: boolean } = {}): Promise<T> {
  const version = await projectVersion(projectId);
  if (version === null) return compute();
  const k = `${projectId}|${key}`;
  const hit = store.get(k);
  if (hit && hit.version === version) {
    store.delete(k);
    store.set(k, hit); // en son kullanılan sona
    return hit.value as T;
  }
  const flightKey = `${k}|${version}`;
  const running = inflight.get(flightKey);
  if (running) return running as Promise<T>;
  const remember = (value: T) => {
    store.delete(k);
    store.set(k, { version, value });
    if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value!);
    return value;
  };
  const p = (async () => {
    if (opts.persist) {
      const saved = await readDisk(projectId, key, version);
      if (saved) return remember(saved.value as T);
    }
    const value = remember(await compute());
    if (opts.persist) await writeDisk(projectId, key, version, value);
    return value;
  })().finally(() => inflight.delete(flightKey));
  inflight.set(flightKey, p);
  return p;
}

/** Önbelleği boşaltır (testler ve elle yenileme için) */
export function clearResponseCache() {
  store.clear();
}

class UncachedResponse extends Error {
  constructor(public status: number, public body: unknown) {
    super("uncached");
  }
}

type RouteHandler = (request: Request, ctx: { params: { id: string } }) => Promise<Response>;

/**
 * Proje rotası sarmalayıcısı: başarılı (200) JSON cevabı projenin veri sürümüne göre önbelleğe alır. Anahtar rotanın
 * son yol parçası + sorgu dizesidir (ör. "dsg?plants=a,b"). Hatalı cevaplar önbelleğe girmez.
 */
export function withProjectCache(handler: RouteHandler): RouteHandler {
  return async (request, ctx) => {
    const url = new URL(request.url);
    const key = `${url.pathname.split("/").filter(Boolean).pop()}${url.search}`;
    try {
      const body = await cachedForProject(
        ctx.params.id,
        key,
        async () => {
          const res = await handler(request, ctx);
          const json = await res.json();
          if (res.status !== 200) throw new UncachedResponse(res.status, json);
          return json;
        },
        { persist: true }
      );
      return Response.json(body);
    } catch (e) {
      if (e instanceof UncachedResponse) return Response.json(e.body, { status: e.status });
      throw e;
    }
  };
}
