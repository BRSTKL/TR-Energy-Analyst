/**
 * TR-Energy Analyst - Kolon Eşleştirme Önerileri
 *
 * Eşleştirme ekranı boş açılmasın diye her santral için bir başlangıç önerisi üretir.
 * Öneriler yalnızca başlangıç değeridir; kullanıcı onaylamadan hiçbir şey yazılmaz.
 * Güvenle eşleşemeyen santraller için öneri üretilmez (tahmin yürütülmez).
 *
 * Öncelik: kayıtlı şablon > sayfa adı (düzen A: santral başına sayfa) > kolon başlığı (düzen B: aynı sayfada
 * santral başına kolonlar).
 */

import { detectColumnMapping } from "@/lib/parsers/generation-parser";
import { PlantImportMapping } from "@/lib/import/column-mapping";
import { SheetPreview } from "@/lib/import/workbook-preview";

export type SuggestionSource = "template" | "sheet-exact" | "sheet-similar" | "single-sheet" | "column-names" | "none";

export interface MappingSuggestion {
  plantId: string;
  mapping: PlantImportMapping | null;
  source: SuggestionSource;
  /** Kullanıcıya gösterilecek açıklama */
  reason: string;
}

export interface SuggestPlant {
  id: string;
  name: string;
  type: string;
}

const FORECAST_MARKERS = ["tahmin", "forecast", "kgop", "planlanan", "gunoncesi"];

/** Türkçe karakterleri sadeleştirip harf ve rakam dışındaki her şeyi atar: "Karaburun RES-1" → "karaburunres1" */
export function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

/** Teknoloji + numara anahtarı: "RES_1", "Karaburun RES-1", "res 01" → "res1"; yoksa null */
export function typeNumberKey(value: string): string | null {
  const match = normalizeName(value).match(/(res|hes|ges)0*(\d+)$/);
  return match ? `${match[1]}${match[2]}` : null;
}

function sheetScore(plant: SuggestPlant, sheetName: string): { score: number; source: SuggestionSource } {
  const p = normalizeName(plant.name);
  const s = normalizeName(sheetName);
  if (!p || !s) return { score: 0, source: "none" };
  if (p === s) return { score: 3, source: "sheet-exact" };
  const pk = typeNumberKey(plant.name);
  if (pk && pk === typeNumberKey(sheetName)) return { score: 2, source: "sheet-similar" };
  if (s.length >= 3 && (p.includes(s) || s.includes(p))) return { score: 2, source: "sheet-similar" };
  return { score: 0, source: "none" };
}

function baseMapping(plantId: string, sheet: SheetPreview): PlantImportMapping | null {
  const headers = sheet.columns.map((c) => c.header);
  const { mapping, missingRequired } = detectColumnMapping(headers);
  if (missingRequired.length > 0) return null;
  return {
    plantId,
    sheetName: sheet.sheetName,
    headerRow: sheet.headerRow,
    dateColumn: mapping.date,
    hourColumn: mapping.hour ?? null,
    forecastColumn: mapping.forecast,
    actualColumn: mapping.actual,
    unit: "MWh",
    hourFormat: "auto",
  };
}

/** Düzen B: aynı sayfada "<Santral> Tahmin" / "<Santral> Gerçekleşen" kolonları */
function columnNameMapping(plant: SuggestPlant, sheet: SheetPreview): PlantImportMapping | null {
  const keys = [normalizeName(plant.name), typeNumberKey(plant.name)].filter((k): k is string => !!k && k.length >= 3);
  if (keys.length === 0) return null;

  const plantColumns = sheet.columns.filter((c) => {
    const h = normalizeName(c.header);
    return keys.some((k) => h.includes(k)) && c.type === "number";
  });
  const isForecast = (header: string) => FORECAST_MARKERS.some((m) => normalizeName(header).includes(m));
  const forecast = plantColumns.filter((c) => isForecast(c.header));
  const actual = plantColumns.filter((c) => !isForecast(c.header));
  if (forecast.length !== 1 || actual.length !== 1) return null;

  const others = sheet.columns.filter((c) => !plantColumns.includes(c)).map((c) => c.header);
  const { mapping } = detectColumnMapping(others);
  if (!mapping.date) return null;

  return {
    plantId: plant.id,
    sheetName: sheet.sheetName,
    headerRow: sheet.headerRow,
    dateColumn: mapping.date,
    hourColumn: mapping.hour ?? null,
    forecastColumn: forecast[0].header,
    actualColumn: actual[0].header,
    unit: "MWh",
    hourFormat: "auto",
  };
}

/** Kayıtlı şablon bu dosyaya uygulanabiliyor mu (sayfa ve kolonlar mevcut mu)? */
function templateFits(template: PlantImportMapping, sheets: SheetPreview[]): boolean {
  const sheet = sheets.find((s) => s.sheetName === template.sheetName);
  if (!sheet) return false;
  const headers = new Set(sheet.columns.map((c) => c.header));
  return [template.dateColumn, template.forecastColumn, template.actualColumn, template.hourColumn]
    .filter((c): c is string => !!c)
    .every((c) => headers.has(c));
}

export function suggestMappings(
  plants: SuggestPlant[],
  sheets: SheetPreview[],
  templates: Record<string, PlantImportMapping> = {}
): MappingSuggestion[] {
  const result = new Map<string, MappingSuggestion>();
  const usedSheets = new Set<string>();

  // 1. Kayıtlı şablon
  for (const plant of plants) {
    const t = templates[plant.id];
    if (t && templateFits(t, sheets)) {
      result.set(plant.id, {
        plantId: plant.id,
        mapping: { ...t, plantId: plant.id },
        source: "template",
        reason: "Önceki yüklemede kaydedilen eşleştirme",
      });
      usedSheets.add(t.sheetName);
    }
  }

  // 2. Sayfa adı: en yüksek puanlı (santral, sayfa) çiftleri önce eşlenir; bir sayfa tek santrale gider
  const usableSheets = sheets.filter((s) => baseMapping("", s) !== null);
  const candidates: Array<{ plant: SuggestPlant; sheet: SheetPreview; score: number; source: SuggestionSource }> = [];
  for (const plant of plants) {
    if (result.has(plant.id)) continue;
    for (const sheet of usableSheets) {
      const { score, source } = sheetScore(plant, sheet.sheetName);
      if (score > 0) candidates.push({ plant, sheet, score, source });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (result.has(c.plant.id) || usedSheets.has(c.sheet.sheetName)) continue;
    result.set(c.plant.id, {
      plantId: c.plant.id,
      mapping: baseMapping(c.plant.id, c.sheet),
      source: c.source,
      reason:
        c.source === "sheet-exact"
          ? `Sayfa adı santral adıyla aynı: "${c.sheet.sheetName}"`
          : `Sayfa adı santral adına benziyor: "${c.sheet.sheetName}" (kontrol edin)`,
    });
    usedSheets.add(c.sheet.sheetName);
  }

  // 3. Tek santral + tek kullanılabilir sayfa
  const remaining = plants.filter((p) => !result.has(p.id));
  const freeSheets = usableSheets.filter((s) => !usedSheets.has(s.sheetName));
  if (plants.length === 1 && remaining.length === 1 && freeSheets.length === 1) {
    result.set(remaining[0].id, {
      plantId: remaining[0].id,
      mapping: baseMapping(remaining[0].id, freeSheets[0]),
      source: "single-sheet",
      reason: `Dosyadaki tek sayfa: "${freeSheets[0].sheetName}" (kontrol edin)`,
    });
  }

  // 4. Düzen B: aynı sayfada santral adını taşıyan kolonlar
  for (const plant of plants) {
    if (result.has(plant.id)) continue;
    for (const sheet of sheets) {
      const m = columnNameMapping(plant, sheet);
      if (m) {
        result.set(plant.id, {
          plantId: plant.id,
          mapping: m,
          source: "column-names",
          reason: `"${sheet.sheetName}" sayfasında santral adını taşıyan kolonlar (kontrol edin)`,
        });
        break;
      }
    }
  }

  return plants.map(
    (p) =>
      result.get(p.id) ?? {
        plantId: p.id,
        mapping: null,
        source: "none",
        reason: "Dosyada bu santrale güvenle eşleşen sayfa veya kolon bulunamadı; elle seçin.",
      }
  );
}
