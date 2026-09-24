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
