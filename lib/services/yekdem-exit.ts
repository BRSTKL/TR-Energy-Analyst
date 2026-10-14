/**
 * TR-Energy Analyst - YEKDEM çıkışları için veri: iki EPİAŞ YEKDEM listesini santrallere bağlar
 *
 * - Kimlikli liste (renewables/data/licensed-powerplant-list): .cache/epias/yekdem-<yıl>.json, 2014'ten bugüne
 *   (listYekdemPlantIds). Önbellek önce okunur; yenileme: scripts/yekdem-exit-sync.mts (VPN).
 * - Katılımcı listesi (renewables/data/renewables-participant): .cache/epias/yekdem-participants.json, 2016–2025;
 *   santrale kurulu güç kuralıyla aynı ad + teknoloji + şirket eşleşmesiyle bağlanır, eşleşen tesisin lisanslı kurulu
 *   gücü de buradan gelir.
 * Sınıflandırma lib/analysis/yekdem-exit.ts'tedir.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { classifyYekdemExit, isYekdemExiting, type YekdemExit, type YekdemExitStatus } from "@/lib/analysis/yekdem-exit";
import { buildCapacityIndex, buildParticipantYearIndex, matchInstalledCapacity, participantYears } from "@/lib/epias-plant/installed-capacity";
import { participantsByYear } from "@/lib/services/installed-capacity";
import { listYekdemPlantIds } from "@/lib/services/epias-plants";

/** Kimlikli listenin ilk yılı (öncesinde EPİAŞ boş döner) */
export const FIRST_ID_LIST_YEAR = 2014;

export interface YekdemPlantRef {
  epiasPlantId: number;
  name: string;
  /** "RES" | "GES" | "HES" | ... (kurulu güç eşleşmesinin teknoloji kontrolü için) */
  type: string;
  organizationName: string | null;
}

export interface PlantYekdemExit extends YekdemExit {
  /** Katılımcı listesindeki lisanslı kurulu güç (eşleştiyse) */
  licensedMw: number | null;
  /** Eşleşen katılımcı kaydı (denetim için) */
  participant: { facilityName: string; orgName: string } | null;
}

export interface YekdemExitIndex {
  /** Kimlikli listenin en son yayımlanmış yılı (sınıflandırmanın "bu yıl"ı) */
  currentYear: number;
  of: (plant: YekdemPlantRef) => PlantYekdemExit;
  /** Liste alınamayan yıllar (önbellekteki hâliyle devam edildi) */
  errors: string[];
}

const idFile = (year: number) => path.join(process.cwd(), ".cache", "epias", `yekdem-${year}.json`);

/**
 * Yılın kimlikli listesi. Sayfalar VPN'siz de açılsın diye önce önbellek okunur (yenilenmesi proje kaydı ve
 * scripts/yekdem-exit-sync.mts ile olur); dosya yoksa EPİAŞ'tan alınır, alınamazsa null.
 */
async function idListOf(year: number, errors: string[], optional = false): Promise<Set<number> | null> {
  try {
    const ids = new Set<number>(JSON.parse(await fs.readFile(idFile(year), "utf8")));
    if (ids.size) return ids;
  } catch {
    // önbellekte yok
  }
  try {
    return await listYekdemPlantIds(year);
  } catch (e) {
    if (!optional) errors.push(`YEKDEM ${year} santral listesi alınamadı (${e instanceof Error ? e.message : "bağlantı"})`);
    return null;
  }
}

let cached: { at: number; promise: Promise<YekdemExitIndex> } | null = null;

export function loadYekdemExitIndex(now = new Date()): Promise<YekdemExitIndex> {
  if (cached && Date.now() - cached.at < 3_600_000) return cached.promise;
  const promise = (async () => {
    const errors: string[] = [];
    const thisYear = now.getUTCFullYear();
    const idYears = new Map<number, Set<number>>();
    // Gelecek yılın listesi yıl sonunda yayımlanır: yalnız Kasım–Aralık'ta aranır, yoksa hata sayılmaz
    const lastYear = now.getUTCMonth() >= 10 ? thisYear + 1 : thisYear;
    for (let y = FIRST_ID_LIST_YEAR; y <= lastYear; y++) {
      const list = await idListOf(y, errors, y > thisYear);
      if (list?.size) idYears.set(y, list);
    }
    const currentYear = Math.max(...Array.from(idYears.keys()));
    if (!Number.isFinite(currentYear)) throw new Error("YEKDEM santral listesi yok; EPİAŞ'a bağlanıp (VPN) yeniden deneyin.");

    // Katılımcı listesi önbellekten (kurulu güç işiyle aynı dosya; EPİAŞ'a gitmez)
    const participants = await participantsByYear();
    const index = buildCapacityIndex(participants);
    const byYear = buildParticipantYearIndex(participants);

    const memo = new Map<number, PlantYekdemExit>();
    const of = (plant: YekdemPlantRef): PlantYekdemExit => {
      const hit = memo.get(plant.epiasPlantId);
      if (hit) return hit;
      const ids = Array.from(idYears.entries())
        .filter(([, set]) => set.has(plant.epiasPlantId))
        .map(([y]) => y);
      // Ad eşleşmesi: kurulu güç kuralıyla aynı (üretim kontrolü yok: peakMw 0)
      const match = matchInstalledCapacity({ name: plant.name, type: plant.type, organizationName: plant.organizationName, peakMw: 0, hours: 0 }, index);
      const entry = match.source === "EPIAS_YEKDEM" ? match.entry ?? null : null;
      const names = entry ? participantYears(entry, byYear) : [];
      const out: PlantYekdemExit = {
        ...classifyYekdemExit({ idYears: ids, nameYears: names }, currentYear),
        licensedMw: entry?.mw ?? null,
        participant: entry ? { facilityName: entry.facilityName, orgName: entry.orgName } : null,
      };
      memo.set(plant.epiasPlantId, out);
      return out;
    };
    return { currentYear, of, errors };
  })();
  cached = { at: Date.now(), promise };
  promise.catch(() => (cached = null));
  return promise;
}

export interface YekdemExitSummaryRow {
  status: YekdemExitStatus;
  plants: number;
  mw: number;
}

/** Duruma göre santral sayısı ve kurulu güç (lisanslı güç yoksa verilen yedek güç) */
export function summarizeExits<T extends { exit: PlantYekdemExit; fallbackMw: number }>(rows: T[]): YekdemExitSummaryRow[] {
  const out = new Map<YekdemExitStatus, YekdemExitSummaryRow>();
  for (const r of rows) {
    const s = out.get(r.exit.status) ?? { status: r.exit.status, plants: 0, mw: 0 };
    s.plants++;
    s.mw += r.exit.licensedMw ?? r.fallbackMw;
    out.set(r.exit.status, s);
  }
  return Array.from(out.values());
}

export { isYekdemExiting };
