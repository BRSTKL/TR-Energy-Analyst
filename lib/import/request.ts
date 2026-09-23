/**
 * TR-Energy Analyst - Kolon Eşleştirme API'lerinin ortak istek işleme mantığı
 * (POST /api/projects/[id]/import/preview ve /commit)
 */

import { prisma } from "@/lib/prisma";
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
}

export interface ImportContext {
  projectId: string;
  projectName: string;
  plants: ImportPlant[];
  profile: ImbalancePricingProfile;
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
      plants: { select: { id: true, name: true, type: true, capacityMw: true, _count: { select: { records: true } } } },
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

  const plants = project.plants.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    capacityMw: p.capacityMw,
    recordCount: p._count.records,
  }));

  const profile: ImbalancePricingProfile = toPricingProfile(project.pricingProfiles?.[0]);

  return {
    projectId: project.id,
    projectName: project.name,
    plants,
    profile,
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
  hasErrors: boolean;
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

  return { results, setIssues, unusedSheets, unmappedPlants, hasErrors };
}

/** İstemciye gönderilecek sonuç: satırların kendisi değil, özet ve ilk satırlar */
export function serializeResults(results: PlantImportResult[]) {
  return Object.fromEntries(
    results.map((r) => [r.plantId, { stats: r.stats, issues: r.issues, preview: r.preview }])
  );
}
