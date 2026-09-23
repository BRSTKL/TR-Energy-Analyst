/**
 * TR-Energy Analyst - Kolon Eşleştirmesini Uygulama
 *
 * Kullanıcının her santral için seçtiği sayfa ve kolonları (PlantImportMapping) dosyaya uygular ve
 * saatlik üretim satırlarını, özet istatistikleri ve doğrulama sorunlarını döndürür. Saf fonksiyondur;
 * veritabanına yazmaz. Önizleme (canlı doğrulama) ve kaydetme aynı fonksiyonu kullanır.
 *
 * Kolonlar pozisyonla değil başlık adıyla saklanır; kolon sırası değişen dosyalarda şablon yine çalışır.
 */

import {
  ParsedGenerationRow,
  parseGenerationRows,
} from "@/lib/parsers/generation-parser";
import { SheetGrid, dataRows, sheetHeaders } from "@/lib/import/workbook-preview";

export interface PlantImportMapping {
  plantId: string;
  sheetName: string;
  /** Başlık satırının ızgaradaki 0 tabanlı indeksi */
  headerRow: number;
  dateColumn: string;
  /** Saat ayrı kolonda değilse (tarih kolonunda "01.01.2025 14:00" gibi) null */
  hourColumn: string | null;
  forecastColumn: string;
  actualColumn: string;
  unit: "MWh" | "kWh";
  hourFormat: "auto" | "0-23" | "1-24";
}

export interface ImportIssue {
  level: "error" | "warning";
  message: string;
}

export interface PlantImportStats {
  rows: number;
  skippedRows: number;
  startDate: string | null;
  endDate: string | null;
  totalForecastMwh: number;
  totalActualMwh: number;
  peakActualMwh: number;
  duplicateHours: number;
  missingHours: number;
}

export interface PlantImportResult {
  plantId: string;
  rows: ParsedGenerationRow[];
  stats: PlantImportStats;
  issues: ImportIssue[];
  /** Ekranda gösterilecek ilk ayrıştırılmış satırlar */
  preview: Array<{ timestamp: string; forecastMwh: number; actualMwh: number }>;
}

const HOUR_MS = 3600 * 1000;

/** Kurulu güç aşımını birim/MW hatası saymadan önce tanınan pay */
const CAPACITY_TOLERANCE = 1.05;

const emptyStats = (): PlantImportStats => ({
  rows: 0,
  skippedRows: 0,
  startDate: null,
  endDate: null,
  totalForecastMwh: 0,
  totalActualMwh: 0,
  peakActualMwh: 0,
  duplicateHours: 0,
  missingHours: 0,
});

export function applyPlantMapping(
  sheets: SheetGrid[],
  mapping: PlantImportMapping,
  plant: { name: string; capacityMw: number }
): PlantImportResult {
  const fail = (message: string): PlantImportResult => ({
    plantId: mapping.plantId,
    rows: [],
    stats: emptyStats(),
    issues: [{ level: "error", message }],
    preview: [],
  });

  const sheet = sheets.find((s) => s.sheetName === mapping.sheetName);
  if (!sheet) return fail(`"${mapping.sheetName}" sayfası dosyada bulunamadı.`);

  const headers = sheetHeaders(sheet.grid, mapping.headerRow);
  const indexOf = (column: string | null) => (column === null ? -1 : headers.indexOf(column));

  const required: Array<[string, string]> = [
    ["Tarih", mapping.dateColumn],
    ["Tahmin", mapping.forecastColumn],
    ["Gerçekleşen", mapping.actualColumn],
  ];
  for (const [role, column] of required) {
    if (!column) return fail(`${role} kolonu seçilmedi.`);
    if (indexOf(column) === -1) return fail(`${role} kolonu "${column}" "${mapping.sheetName}" sayfasında bulunamadı.`);
  }
  if (mapping.hourColumn && indexOf(mapping.hourColumn) === -1) {
    return fail(`Saat kolonu "${mapping.hourColumn}" "${mapping.sheetName}" sayfasında bulunamadı.`);
  }

  const chosen = [mapping.dateColumn, mapping.hourColumn, mapping.forecastColumn, mapping.actualColumn].filter(
    (c): c is string => !!c
  );
  if (mapping.forecastColumn === mapping.actualColumn) {
    return fail("Tahmin ve gerçekleşen için aynı kolon seçilemez.");
  }
  if (new Set(chosen).size !== chosen.length) {
    return fail("Bir kolon birden fazla alana seçilemez.");
  }

  // Satırları kolon indeksine göre anahtarlayarak mevcut satır ayrıştırıcıya ver
  const key = (column: string) => String(indexOf(column));
  const rowObjects = dataRows(sheet.grid, mapping.headerRow).map((row) => {
    const obj: Record<string, any> = {};
    row.forEach((v, i) => (obj[String(i)] = v));
    return obj;
  });

  const parsed = parseGenerationRows(
    rowObjects,
    {
      date: key(mapping.dateColumn),
      hour: mapping.hourColumn ? key(mapping.hourColumn) : undefined,
      forecast: key(mapping.forecastColumn),
      actual: key(mapping.actualColumn),
    },
    {
      plantName: plant.name,
      hourFormat: mapping.hourFormat,
      valueScale: mapping.unit === "kWh" ? 0.001 : 1,
      rowNumberOffset: mapping.headerRow + 2,
    }
  );

  const rows = [...parsed.rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const issues: ImportIssue[] = parsed.warnings.map((message) => ({ level: "warning" as const, message }));

  if (rows.length === 0) {
    return {
      plantId: mapping.plantId,
      rows: [],
      stats: { ...emptyStats(), skippedRows: parsed.skippedCount },
      issues: [{ level: "error", message: "Seçilen kolonlarda geçerli tarih ve sayısal üretim verisi bulunamadı." }, ...issues],
      preview: [],
    };
  }

  const uniqueHours = new Set(rows.map((r) => r.timestamp.getTime())).size;
  const duplicateHours = rows.length - uniqueHours;
  const start = rows[0].timestamp;
  const end = rows[rows.length - 1].timestamp;
  const expectedHours = Math.round((end.getTime() - start.getTime()) / HOUR_MS) + 1;
  const missingHours = Math.max(0, expectedHours - uniqueHours);

  let totalForecastMwh = 0;
  let totalActualMwh = 0;
  let peakActualMwh = 0;
  for (const r of rows) {
    totalForecastMwh += r.forecastMwh;
    totalActualMwh += r.actualMwh;
    if (r.actualMwh > peakActualMwh) peakActualMwh = r.actualMwh;
  }

  if (duplicateHours > 0) {
    issues.unshift({
      level: "error",
      message: `${duplicateHours} saat birden fazla kez var. Tarih/saat kolonlarını veya saat formatını kontrol edin.`,
    });
  }
  if (parsed.skippedCount > 0) {
    issues.push({ level: "warning", message: `${parsed.skippedCount} satır okunamadığı için atlanacak.` });
  }
  if (missingHours > 0) {
    issues.push({ level: "warning", message: `Dönem içinde ${missingHours} saat eksik.` });
  }
  if (plant.capacityMw > 0 && peakActualMwh > plant.capacityMw * CAPACITY_TOLERANCE) {
    issues.push({
      level: "warning",
      message:
        `En yüksek saatlik üretim (${peakActualMwh.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} MWh) ` +
        `kurulu gücü (${plant.capacityMw} MW) aşıyor. Kurulu gücü veya birimi (MWh / kWh) kontrol edin.`,
    });
  }

  return {
    plantId: mapping.plantId,
    rows,
    stats: {
      rows: rows.length,
      skippedRows: parsed.skippedCount,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalForecastMwh,
      totalActualMwh,
      peakActualMwh,
      duplicateHours,
      missingHours,
    },
    issues,
    preview: rows.slice(0, 5).map((r) => ({
      timestamp: r.timestamp.toISOString(),
      forecastMwh: r.forecastMwh,
      actualMwh: r.actualMwh,
    })),
  };
}

/**
 * Eşleştirmeler arası çakışmaları bulur: iki santral aynı sayfadaki aynı tahmin veya gerçekleşen kolonunu kullanamaz.
 */
export function validateMappingSet(
  mappings: PlantImportMapping[],
  plantNames: Record<string, string>
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const used = new Map<string, string>();

  for (const m of mappings) {
    for (const column of [m.forecastColumn, m.actualColumn]) {
      const k = `${m.sheetName}::${column}`;
      const other = used.get(k);
      if (other && other !== m.plantId) {
        issues.push({
          level: "error",
          message: `"${m.sheetName}" sayfasındaki "${column}" kolonu hem ${plantNames[other] ?? other} hem ${
            plantNames[m.plantId] ?? m.plantId
          } için seçildi.`,
        });
      } else {
        used.set(k, m.plantId);
      }
    }
  }
  return issues;
}
