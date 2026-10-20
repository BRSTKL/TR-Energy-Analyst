/**
 * TR-Energy Analyst - Güneş santrallerinde değişim uyarıları (Aşama 22.7 bağlaması; kural lib/forecast/change-detection.ts)
 *
 * Günlük akış (lib/solar-engine/pipeline.ts) tahmin kaydını yazdıktan sonra proje güneş santralleri için hesaplar ve
 * `.cache/forecast/change-warnings.json`'a yazar; Üretim tahmini sayfası (projectLiveForecast) buradan okur (sayfa açılışında
 * 150 günlük veri okunmasın). Yalnız uyarı: hiçbir kayıt değişmez (kurulu güç ve konum kendi kurallarıyla yazılır).
 *
 * Bağlanan uyarılar (20.10.2026 gerçek veri taraması, scripts/change-detection-scan.mts):
 * - (a) kapasite değişimi: yalnız kayıtlı (resmî ya da elle) kurulu güçle "over"; "under" her santralde. Taramada 0 uyarı.
 * - (b) uzun arıza: yalnız sürüyorsa ya da son 7 gün içinde bittiyse (eski olay tahmini etkilemez). Taramada 4 eski olay.
 * - (c) konum tutarsızlığı BAĞLANMADI: 6 uyarının 5'i 2025–2026 lisanslı yeni santrallerde 25–45 dk "geç" (boylamdan
 *   bağımsız; yalnız UEVM ile de aynı): konum hatası değil, üretimin öğleden sonraya kayması (depolama ya da santral tipi).
 *   Bir santralde (ME-SE GES) 391 dk erken: veri sorunu, ayrı incelenir. Eşik ve santral tipi ayrımı yapılmadan bağlanmaz.
 */

import fs from "node:fs";
import path from "node:path";
import { isRecordedCapacity } from "@/lib/epias-plant/installed-capacity";
import { capacityChange, longOutage, type ChangeWarning } from "@/lib/forecast/change-detection";
import { loadSolarHours } from "@/lib/solar-engine/data/production-data";

const DAY = 86_400_000;
const FILE = path.join(process.cwd(), ".cache", "forecast", "change-warnings.json");
/** Okunan geçmiş (gün): kapasite penceresi 30 + karşılaştırma 90, uzun arıza referansı 60 */
const HISTORY_DAYS = 150;
/** Biten arıza bu kadar gün içinde bittiyse gösterilir */
const RECENT_OUTAGE_DAYS = 7;

export interface PlantChangeWarnings {
  epiasPlantId: number;
  /** Elde olan son üretim günü (UEVM ya da geçici üretim) */
  dataThrough: string | null;
  warnings: ChangeWarning[];
}

export interface ChangeWarningsFile {
  generatedAt: string;
  plants: PlantChangeWarnings[];
}

/** Bir santralin uyarıları; `now` duvar saati değil gerçek an (ms) */
export async function solarChangeWarnings(
  plant: { epiasPlantId: number; capacityMw: number | null; capacitySource: string | null },
  now = Date.now()
): Promise<PlantChangeWarnings> {
  const to = Math.floor((now + 3 * 3_600_000) / DAY) * DAY;
  const data = await loadSolarHours(plant.epiasPlantId, to - HISTORY_DAYS * DAY, to, { provisional: true });
  const last = data?.hours.filter((h) => h.uevm !== null).at(-1)?.t;
  if (!data || last === undefined) return { epiasPlantId: plant.epiasPlantId, dataThrough: null, warnings: [] };
  const asOf = Math.floor(last / DAY) * DAY + DAY;
  const obs = data.hours.filter((h) => h.t < asOf).map((h) => ({ t: h.t, uevm: h.uevm, ghi: h.satGhi ?? null }));
  const warnings: ChangeWarning[] = [];
  const recorded = isRecordedCapacity(plant.capacitySource) && plant.capacityMw ? plant.capacityMw : null;
  const cap = capacityChange(obs, recorded, asOf);
  if (cap) warnings.push(cap);
  const out = longOutage(obs, data.site);
  if (out && (out.ongoing || out.values.to >= asOf - RECENT_OUTAGE_DAYS * DAY)) {
    const { ongoing: _o, ...w } = out;
    warnings.push(w);
  }
  return { epiasPlantId: plant.epiasPlantId, dataThrough: new Date(last).toISOString().slice(0, 10), warnings };
}

export function writeChangeWarnings(plants: PlantChangeWarnings[], now = Date.now()): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ generatedAt: new Date(now).toISOString(), plants } satisfies ChangeWarningsFile));
}

/** Son hesaplanan uyarılar (santral kimliği → uyarılar); dosya yoksa boş */
export function readChangeWarnings(): { generatedAt: string | null; byPlant: Map<number, PlantChangeWarnings> } {
  try {
    const f = JSON.parse(fs.readFileSync(FILE, "utf8")) as ChangeWarningsFile;
    return { generatedAt: f.generatedAt, byPlant: new Map(f.plants.map((p) => [p.epiasPlantId, p])) };
  } catch {
    return { generatedAt: null, byPlant: new Map() };
  }
}
