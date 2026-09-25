/**
 * TR-Energy Analyst - EPİAŞ'tan santral bazında KGÜP ve UEVM çekme (I/O)
 *
 * Zincir (EPİAŞ Şeffaflık 2.0 servis belgesine göre):
 *   1. GET  /generation/data/injection-quantity-powerplant-list   → UEVM yayımlanan santraller (id, ad, EIC)
 *   2. POST /markets/data/uevcb-list-by-power-plant-id           → santralin uzlaştırma birimleri (UEVÇB)
 *   3. POST /generation/data/dpp-first-version veya /dpp { region: "TR1", uevcbId } → KGÜP ilk/son versiyon
 *      (her UEVÇB için; toplanır)
 *   4. POST /generation/data/injection-quantity { powerplantId }  → UEVM
 *
 * Canlı doğrulama (BALABANLI RES, Mayıs–Aralık 2025): 1–4 (KGÜP ilk ve son versiyon dahil) gerçek servisle çalıştı;
 * dpp-first-version da canlı denendi: KGÜP ilk versiyon ve UEVM elle indirilen dosyalarla saat saat aynı.
 * Cevap biçimi beklenenden farklıysa plant-data.ts okunamayan kayıtları sayar ve kontroller uyarı gösterir.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { epiasRequest, formatToEpiasIso } from "@/lib/services/epias-service";
import type { EpiasOrganization, EpiasPowerPlant, KgupVersion } from "@/lib/epias-plant/plant-data";

export interface EpiasUevcb {
  id: number;
  name: string;
  eic?: string | null;
}

const CACHE_TTL_MS = 12 * 3_600_000;
let plantCache: { at: number; plants: EpiasPowerPlant[] } | null = null;

/** UEVM yayımlanan santral listesi (12 saat önbellekli) */
export async function listUevmPowerPlants(forceRefresh = false): Promise<EpiasPowerPlant[]> {
  if (!forceRefresh && plantCache && Date.now() - plantCache.at < CACHE_TTL_MS) return plantCache.plants;
  const json = await epiasRequest<{ items?: any[] }>("/generation/data/injection-quantity-powerplant-list");
  const plants: EpiasPowerPlant[] = (json.items ?? [])
    .filter((p) => p && p.id !== undefined && p.name)
    .map((p) => ({ id: Number(p.id), name: String(p.name).trim(), eic: p.eic ?? null, shortName: p.shortName ?? null }));
  if (plants.length === 0) throw new Error("EPİAŞ santral listesi boş döndü.");
  plantCache = { at: Date.now(), plants };
  return plants;
}

let orgCache: { at: number; key: string; orgs: EpiasOrganization[] } | null = null;

/** Verilen aralıkta tanımlı piyasa katılımcıları (şirketler; 12 saat önbellekli) */
export async function listOrganizations(startDay: string, endDay: string): Promise<EpiasOrganization[]> {
  const key = `${startDay}|${endDay}`;
  if (orgCache && orgCache.key === key && Date.now() - orgCache.at < CACHE_TTL_MS) return orgCache.orgs;
  const json = await epiasRequest<{ items?: any[] }>("/generation/data/organization-list", {
    startDate: formatToEpiasIso(startDay, false),
    endDate: formatToEpiasIso(endDay, true),
  });
  const orgs: EpiasOrganization[] = (json.items ?? [])
    .filter((o) => o && o.organizationId !== undefined && o.organizationName)
    .map((o) => ({
      id: Number(o.organizationId),
      name: String(o.organizationName).trim(),
      shortName: o.organizationShortName ?? null,
      eic: o.organizationEtsoCode ?? null,
    }));
  if (orgs.length === 0) throw new Error("EPİAŞ şirket listesi boş döndü.");
  orgCache = { at: Date.now(), key, orgs };
  return orgs;
}

/**
 * Şirketin santralleri. Canlı doğrulandı (SOMA ENERJİ → SOMA RES, kimlik 760): dönen santral kimlikleri UEVM
 * santral listesindeki kimliklerle aynıdır.
 */
export async function listPlantsByOrganization(organizationId: number, startDay: string, endDay: string): Promise<EpiasPowerPlant[]> {
  const json = await epiasRequest<{ items?: any[] }>("/markets/data/power-plant-list-by-organization-id", {
    organizationId,
    startDate: formatToEpiasIso(startDay, false),
    endDate: formatToEpiasIso(endDay, true),
  });
  return (json.items ?? [])
    .filter((p) => p && p.id !== undefined && p.name)
    .map((p) => ({ id: Number(p.id), name: String(p.name).trim(), eic: p.eic ?? null, shortName: p.shortName ?? null }));
}

/** Santralin uzlaştırma birimleri (KGÜP bu birimler için bildirilir) */
export async function listUevcbsForPlant(powerPlantId: number, onDay: string): Promise<EpiasUevcb[]> {
  const json = await epiasRequest<{ items?: any[] }>("/markets/data/uevcb-list-by-power-plant-id", {
    powerPlantId,
    startDate: formatToEpiasIso(onDay, false),
  });
  return (json.items ?? [])
    .filter((u) => u && u.id !== undefined)
    .map((u) => ({ id: Number(u.id), name: String(u.name ?? u.id), eic: u.eic ?? null }));
}

/**
 * Sayfalı bir servisin tüm kayıtlarını toplar. İlk istek sayfa bilgisi olmadan atılır; cevap toplam kayıt
 * sayısından azını döndürdüyse sonraki sayfalar istenir.
 */
async function fetchAllPages(path: string, body: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const first = await epiasRequest<{ items?: any[]; page?: { total?: number; size?: number } }>(path, body);
  const items = [...(first.items ?? [])];
  const total = first.page?.total;
  const size = first.page?.size || items.length;
  if (!total || items.length >= total || size <= 0) return items;
  for (let n = 2; items.length < total && n <= 100; n++) {
    const next = await epiasRequest<{ items?: any[] }>(path, { ...body, page: { number: n, size } });
    if (!next.items?.length) break;
    items.push(...next.items);
  }
  return items;
}

/** Bir UEVÇB'nin KGÜP kayıtları ([start, end] gün dahil) */
export async function fetchKgup(uevcbId: number, startDay: string, endDay: string, version: KgupVersion = "FIRST") {
  return fetchAllPages(version === "FIRST" ? "/generation/data/dpp-first-version" : "/generation/data/dpp", {
    region: "TR1",
    uevcbId,
    startDate: formatToEpiasIso(startDay, false),
    endDate: formatToEpiasIso(endDay, true),
  });
}

/** Bir santralin UEVM kayıtları ([start, end] gün dahil) */
export async function fetchUevm(powerPlantId: number, startDay: string, endDay: string) {
  return fetchAllPages("/generation/data/injection-quantity", {
    powerplantId: powerPlantId,
    startDate: formatToEpiasIso(startDay, false),
    endDate: formatToEpiasIso(endDay, true),
  });
}

// ------------------------------------------------------------------------------------------------
// Santralin sahibi (şirket) ve YEKDEM durumu
// ------------------------------------------------------------------------------------------------

export interface PlantOwner {
  organizationId: number;
  organizationName: string;
}

const INDEX_TTL_MS = 30 * 24 * 3_600_000;
const indexFile = (year: number) => path.join(process.cwd(), ".cache", "epias", `plant-owners-${year}.json`);

interface OwnerIndexFile {
  /** [santral kimliği, sahip] */
  entries: Array<[number, PlantOwner]>;
  /** Santral listesi alınabilen şirketler */
  scanned: number[];
  /** Taranamayan şirket sayısı (0 ise dizin tam) */
  pending: number;
}

export interface PlantOwnerIndex {
  owners: Map<number, PlantOwner>;
  /** Taranamayan şirket sayısı: 0 değilse bir santralin sahibi henüz bulunmamış olabilir */
  pending: number;
}

const ownerIndexes = new Map<number, Promise<PlantOwnerIndex>>();

/**
 * Santral kimliği → şirket dizini. EPİAŞ'ta santralden şirkete giden bir servis yok; bu yüzden yıl içinde tanımlı
 * tüm şirketlerin santral listesi (power-plant-list-by-organization-id) taranır ve diske yazılır
 * (.cache/epias, 30 gün geçerli). Tarama kaldığı yerden devam eder: bağlantı koparsa yalnızca taranamayan şirketler
 * bir sonraki çağrıda yeniden denenir. EPİAŞ yoğun paralel isteği reddettiği için az paralellikle, bekleyerek çalışır.
 */
export function plantOwnerIndex(year: number, forceRefresh = false): Promise<PlantOwnerIndex> {
  const cached = ownerIndexes.get(year);
  if (cached && !forceRefresh) return cached;
  const build = (async (): Promise<PlantOwnerIndex> => {
    const file = indexFile(year);
    let saved: OwnerIndexFile | null = null;
    if (!forceRefresh) {
      try {
        const stat = await fs.stat(file);
        if (Date.now() - stat.mtimeMs < INDEX_TTL_MS) saved = JSON.parse(await fs.readFile(file, "utf8"));
      } catch {
        // dosya yok veya okunamadı: baştan taranır
      }
    }
    if (saved && saved.pending === 0) return { owners: new Map(saved.entries), pending: 0 };

    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const orgs = await listOrganizations(start, end);
    const owners = new Map<number, PlantOwner>(saved?.entries ?? []);
    const scanned = new Set<number>(saved?.scanned ?? []);
    const todo = orgs.filter((o) => !scanned.has(o.id));
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const org = todo[next++];
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            for (const p of await listPlantsByOrganization(org.id, start, end)) {
              owners.set(p.id, { organizationId: org.id, organizationName: org.name });
            }
            scanned.add(org.id);
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 1500 * attempt));
          }
        }
      }
    };
    await Promise.all(Array.from({ length: 2 }, worker));

    const pending = orgs.filter((o) => !scanned.has(o.id)).length;
    const out: OwnerIndexFile = { entries: Array.from(owners.entries()), scanned: Array.from(scanned), pending };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(out));
    return { owners, pending };
  })();
  ownerIndexes.set(year, build);
  // Eksik kalan dizin önbellekte tutulmaz: sonraki çağrı kalan şirketleri tarar
  build.then((r) => r.pending > 0 && ownerIndexes.delete(year)).catch(() => ownerIndexes.delete(year));
  return build;
}

/**
 * Yıl içinde YEKDEM'den yararlanan santraller (renewables/data/licensed-powerplant-list, period = yılın ilk günü).
 * Canlı doğrulandı: 2025 için 768 santral; KORU RES ve MUT RES listede, BALABANLI RES yok.
 */
export async function listYekdemPlantIds(year: number): Promise<Set<number>> {
  // Bu servis diğerlerinden farklı olarak { items } değil doğrudan dizi döndürür
  const json = await epiasRequest<any[] | { items?: any[] }>("/renewables/data/licensed-powerplant-list", {
    period: formatToEpiasIso(`${year}-01-01`, false),
  });
  const items = Array.isArray(json) ? json : (json.items ?? []);
  const ids = new Set(items.map((p) => Number(p.powerPlantId)).filter((n) => Number.isFinite(n)));
  // Boş liste "hiçbiri YEKDEM'de değil" demek değildir (ör. biçim değişikliği, dönem henüz yayımlanmamış): bilinmiyor
  if (ids.size === 0) throw new Error("EPİAŞ YEKDEM santral listesi boş döndü; YEKDEM durumu belirlenemedi.");
  return ids;
}

export interface PlantMeta {
  epiasPlantId: number;
  organizationId: number | null;
  organizationName: string | null;
  yekdem: boolean | null;
}

/**
 * Santrallerin sahibi ve YEKDEM durumu. Biri alınamazsa (bağlantı) ilgili alanlar null döner; kayıt yine yapılır.
 */
export async function resolvePlantMeta(ids: number[], year: number): Promise<{ items: PlantMeta[]; errors: string[] }> {
  const errors: string[] = [];
  const [owners, yekdem] = await Promise.all([
    plantOwnerIndex(year)
      .then((idx) => {
        if (idx.pending > 0 && ids.some((id) => !idx.owners.has(id))) {
          errors.push(`${idx.pending} şirketin santral listesi henüz alınamadı; bazı santrallerin sahibi bulunamamış olabilir. Tekrar denendiğinde kalan şirketler taranır.`);
        }
        return idx.owners;
      })
      .catch((e) => {
        errors.push(e instanceof Error ? e.message : "Şirket bilgisi alınamadı.");
        return null;
      }),
    listYekdemPlantIds(year).catch((e) => {
      errors.push(e instanceof Error ? e.message : "YEKDEM listesi alınamadı.");
      return null;
    }),
  ]);
  return {
    items: ids.map((id) => ({
      epiasPlantId: id,
      organizationId: owners?.get(id)?.organizationId ?? null,
      organizationName: owners?.get(id)?.organizationName ?? null,
      yekdem: yekdem ? yekdem.has(id) : null,
    })),
    errors,
  };
}
