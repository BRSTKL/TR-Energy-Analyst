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
 * Sunucu yeniden başlarsa önbellek boşalır; ilk istek yeniden hesaplar.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { poolDir } from "@/lib/pool/pool-store";
import { projectPeriod } from "@/lib/services/project-records";

const MAX_ENTRIES = 120;
const store = new Map<string, { version: string; value: unknown }>();
/** Aynı anda gelen aynı istekler tek hesap yapar */
const inflight = new Map<string, Promise<unknown>>();

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

/**
 * Projenin bir hesabını önbellekten döndürür; sürüm değiştiyse ya da yoksa hesaplar. `key` aynı projede farklı
 * hesapları ayırır (ör. "results", "dsg?plants=…"). Proje yoksa compute yine çağrılır (404 cevabı ona aittir).
 */
export async function cachedForProject<T>(projectId: string, key: string, compute: () => Promise<T>): Promise<T> {
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
  const p = compute()
    .then((value) => {
      store.delete(k);
      store.set(k, { version, value });
      if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value!);
      return value;
    })
    .finally(() => inflight.delete(flightKey));
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
      const body = await cachedForProject(ctx.params.id, key, async () => {
        const res = await handler(request, ctx);
        const json = await res.json();
        if (res.status !== 200) throw new UncachedResponse(res.status, json);
        return json;
      });
      return Response.json(body);
    } catch (e) {
      if (e instanceof UncachedResponse) return Response.json(e.body, { status: e.status });
      throw e;
    }
  };
}
