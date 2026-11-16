/**
 * TR-Energy Analyst - Kolon Eşleştirme API'lerinin ortak istek işleme mantığı
 * (POST /api/projects/[id]/import/preview ve /commit)
 */

import { prisma } from "@/lib/prisma";
import { plantHourSummaries } from "@/lib/services/project-records";
import { ImbalancePricingProfile, toPricingProfile } from "@/lib/calculations/types";
import { PlantImportMapping, PlantImportResult, applyPlantMapping, validateMappingSet, ImportIssue } from "@/lib/import/column-mapping";
import { SheetGrid, SheetPreview, buildSheetPreview, dataRows, readWorkbookGrids } from "@/lib/import/workbook-preview";

export class ImportRequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface ImportPlant {
  id: string;
  name: string;
  type: string;
  capacityMw: number;
  recordCount: number;
  /** Santral şu an EPİAŞ veri havuzundan okunuyor (dosya yüklenirse yalnız dosyadan okunur) */
  poolBacked: boolean;
}

export interface ImportContext {
  projectId: string;
  projectName: string;
  plants: ImportPlant[];
  profile: ImbalancePricingProfile;
  /** Kullanıcının seçtiği proje dönemi ("YYYY-MM-DD"); eski projelerde null */
  period: { start: string; end: string } | null;
  templates: Record<string, PlantImportMapping>;
  fileName: string;
  sheets: SheetGrid[];
  previews: SheetPreview[];
  /** İstekte gönderilen eşleştirmeler; gönderilmediyse null */
  mappings: PlantImportMapping[] | null;
  form: FormData;
}

const UNITS = ["MWh", "kWh"];
const HOUR_FORMATS = ["auto", "0-23", "1-24"];

function parseMappings(raw: FormDataEntryValue | null, plantIds: Set<string>): PlantImportMapping[] | null {
  if (raw === null || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new ImportRequestError("Eşleştirme verisi okunamadı (geçersiz JSON).");
  }
  if (!Array.isArray(parsed)) throw new ImportRequestError("Eşleştirme verisi bir liste olmalıdır.");

  const seen = new Set<string>();
  return parsed.map((m: any, i: number) => {
    const where = `${i + 1}. eşleştirme`;
    if (typeof m?.plantId !== "string" || !plantIds.has(m.plantId)) {
      throw new ImportRequestError(`${where}: santral bu projeye ait değil.`);
    }
    if (seen.has(m.plantId)) throw new ImportRequestError(`${where}: aynı santral birden fazla kez eşleştirildi.`);
    seen.add(m.plantId);
    for (const field of ["sheetName", "dateColumn", "forecastColumn", "actualColumn"]) {
      if (typeof m[field] !== "string") throw new ImportRequestError(`${where}: "${field}" alanı eksik.`);
    }
    if (!Number.isInteger(m.headerRow) || m.headerRow < 0) {
      throw new ImportRequestError(`${where}: başlık satırı geçersiz.`);
    }
    if (m.hourColumn !== null && typeof m.hourColumn !== "string") {
      throw new ImportRequestError(`${where}: saat kolonu geçersiz.`);
    }
    if (!UNITS.includes(m.unit)) throw new ImportRequestError(`${where}: birim MWh veya kWh olmalıdır.`);
    if (!HOUR_FORMATS.includes(m.hourFormat)) throw new ImportRequestError(`${where}: saat formatı geçersiz.`);
    return {
      plantId: m.plantId,
      sheetName: m.sheetName,
      headerRow: m.headerRow,
      dateColumn: m.dateColumn,
      hourColumn: m.hourColumn,
      forecastColumn: m.forecastColumn,
      actualColumn: m.actualColumn,
      unit: m.unit,
      hourFormat: m.hourFormat,
    };
  });
}

function parseTemplates(raw: string | null): Record<string, PlantImportMapping> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function readImportRequest(request: Request, projectId: string): Promise<ImportContext> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      pricingProfiles: true,
      plants: true,
    },
  });
  if (!project) throw new ImportRequestError(`ID'si '${projectId}' olan proje bulunamadı.`, 404);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ImportRequestError("Lütfen bir Excel (.xlsx) veya CSV dosyası seçin.");

  let sheets: SheetGrid[];
  try {
    sheets = await readWorkbookGrids(Buffer.from(await file.arrayBuffer()), file.name);
  } catch {
    throw new ImportRequestError("Dosya okunamadı. Geçerli bir .xlsx veya .csv dosyası seçin.");
  }
  sheets = sheets.filter((s) => s.grid.length > 0);
  if (sheets.length === 0) throw new ImportRequestError("Dosyada okunabilir sayfa bulunamadı.");

  // Kullanıcının elle değiştirdiği başlık satırları: { "Sayfa Adı": 2 }
  let headerRows: Record<string, number> = {};
  const rawHeaderRows = form.get("headerRows");
  if (rawHeaderRows) {
    try {
      headerRows = JSON.parse(String(rawHeaderRows)) ?? {};
    } catch {
      throw new ImportRequestError("Başlık satırı bilgisi okunamadı.");
    }
  }

  const previews = sheets.map((s) => {
    const override = headerRows[s.sheetName];
    return Number.isInteger(override) && override >= 0 && override < s.grid.length
      ? buildSheetPreview(s, override)
      : buildSheetPreview(s);
  });

  const counts = await plantHourSummaries([project]);
  const plants = project.plants.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    capacityMw: p.capacityMw,
    recordCount: counts.get(p.id)?.count ?? 0,
    poolBacked: p.poolBacked,
  }));

  const profile: ImbalancePricingProfile = toPricingProfile(project.pricingProfiles?.[0]);

  return {
    projectId: project.id,
    projectName: project.name,
    plants,
    profile,
    period: project.periodStart && project.periodEnd ? { start: project.periodStart, end: project.periodEnd } : null,
    templates: parseTemplates(project.importTemplate),
    fileName: file.name,
    sheets,
    previews,
    mappings: parseMappings(form.get("mappings"), new Set(plants.map((p) => p.id))),
    form,
  };
}

export interface MappingEvaluation {
  results: PlantImportResult[];
  setIssues: ImportIssue[];
  /** Verisi olup hiçbir santrale eşlenmeyen sayfalar */
  unusedSheets: string[];
  /** Hiçbir eşleştirmesi olmayan proje santralleri */
  unmappedPlants: string[];
  /**
   * EPİAŞ havuzundan okunan ve bu dosyayla üzerine yazılacak santraller. Yükleme sonrası santral yalnız dosyadan okunur:
   * dosya dışındaki dönem ayları hesaplardan çıkar, son plan (KGÜP) ve EPİAŞ güncellemesi biter. Kaydetmeden önce onay ister.
   */
  poolReplacements: Array<{ plantId: string; plantName: string; droppedMonths: string[] }>;
  hasErrors: boolean;
}

/** Dönemin (bugünü geçmeden) dosya aralığı [fileStart, fileEnd] içinde tam kalmayan ayları ("YYYY-MM") */
export function monthsOutsideFile(
  period: { start: string; end: string },
  fileStart: string,
  fileEnd: string,
  now: Date = new Date()
): string[] {
  const HOUR = 3_600_000;
  const todayStart = Date.parse(new Date(now.getTime() + 3 * HOUR).toISOString().slice(0, 10) + "T00:00:00Z");
  const pStart = Date.parse(`${period.start}T00:00:00Z`);
  const pEnd = Math.min(Date.parse(`${period.end}T23:00:00Z`), todayStart - HOUR);
  const fStart = Date.parse(fileStart);
  const fEnd = Date.parse(fileEnd);
  const out: string[] = [];
  const first = new Date(pStart);
  for (let i = 0; ; i++) {
    const monthStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1);
    if (monthStart > pEnd) break;
    const mFrom = Math.max(monthStart, pStart);
    const mTo = Math.min(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i + 1, 1) - HOUR, pEnd);
    if (mFrom < fStart || mTo > fEnd) out.push(new Date(monthStart).toISOString().slice(0, 7));
  }
  return out;
}

export function evaluateMappings(ctx: ImportContext, mappings: PlantImportMapping[]): MappingEvaluation {
  const plantById = new Map(ctx.plants.map((p) => [p.id, p]));
  const results = mappings.map((m) => applyPlantMapping(ctx.sheets, m, plantById.get(m.plantId)!));
  const setIssues = validateMappingSet(
    mappings,
    Object.fromEntries(ctx.plants.map((p) => [p.id, p.name]))
  );

  const usedSheets = new Set(mappings.map((m) => m.sheetName));
  const unusedSheets = ctx.previews
    .filter((p) => !usedSheets.has(p.sheetName) && dataRows(ctx.sheets.find((s) => s.sheetName === p.sheetName)!.grid, p.headerRow).length > 0)
    .map((p) => p.sheetName);

  const mappedPlants = new Set(mappings.map((m) => m.plantId));
  const unmappedPlants = ctx.plants.filter((p) => !mappedPlants.has(p.id)).map((p) => p.id);

  const hasErrors =
    setIssues.some((i) => i.level === "error") ||
    results.some((r) => r.issues.some((i) => i.level === "error"));

  const poolReplacements = results
    .filter((r) => plantById.get(r.plantId)?.poolBacked && r.rows.length > 0 && r.stats.startDate && r.stats.endDate)
    .map((r) => ({
      plantId: r.plantId,
      plantName: plantById.get(r.plantId)!.name,
      droppedMonths: ctx.period ? monthsOutsideFile(ctx.period, r.stats.startDate!, r.stats.endDate!) : [],
    }));

  return { results, setIssues, unusedSheets, unmappedPlants, poolReplacements, hasErrors };
}

/** İstemciye gönderilecek sonuç: satırların kendisi değil, özet ve ilk satırlar */
export function serializeResults(results: PlantImportResult[]) {
  return Object.fromEntries(
    results.map((r) => [r.plantId, { stats: r.stats, issues: r.issues, preview: r.preview }])
  );
}
