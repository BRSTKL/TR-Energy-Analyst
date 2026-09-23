/**
 * TR-Energy Analyst - Dosya Önizleme (Kolon Eşleştirme Ekranı için)
 *
 * Yüklenen Excel / CSV dosyasını veritabanına hiçbir şey yazmadan okur ve her sayfa için
 * başlık satırını, kolonları (tip tahmini ve örnek değerlerle) ve ilk satırları döndürür.
 * Kullanıcı bu önizlemeye bakarak her santral için hangi sayfa ve kolonların kullanılacağını seçer.
 */

import {
  extractCellValue,
  parseCsvText,
  parseExcelGrids,
  parseNumberTurkish,
  parseTimestamp,
} from "@/lib/parsers/generation-parser";

export interface SheetGrid {
  sheetName: string;
  grid: any[][];
}

export type ColumnType = "date" | "number" | "text" | "empty";

export interface ColumnPreview {
  index: number;
  /** Benzersiz başlık (boşsa "Kolon N", tekrar ediyorsa "Başlık (2)") */
  header: string;
  type: ColumnType;
  samples: string[];
}

export interface SheetPreview {
  sheetName: string;
  /** Başlık satırının ızgaradaki 0 tabanlı indeksi */
  headerRow: number;
  /** Başlık satırından sonraki boş olmayan satır sayısı */
  rowCount: number;
  columns: ColumnPreview[];
  sampleRows: string[][];
}

const HEADER_SEARCH_ROWS = 20;
const TYPE_SAMPLE_ROWS = 200;

const isEmpty = (v: any) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Excel veya CSV dosyasını sayfa başına ham hücre ızgarasına çevirir. */
export async function readWorkbookGrids(buffer: Buffer, filename: string): Promise<SheetGrid[]> {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "txt") {
    const objects = parseCsvText(buffer.toString("utf-8"));
    const headers = objects.length > 0 ? Object.keys(objects[0]) : [];
    const grid = [headers, ...objects.map((o) => headers.map((h) => o[h]))];
    return grid.length > 1 ? [{ sheetName: filename.replace(/\.[^.]+$/, ""), grid }] : [];
  }
  const sheets = await parseExcelGrids(buffer);
  return sheets.map((s) => ({ sheetName: s.sheetName, grid: s.grid.map((row) => row.map(extractCellValue)) }));
}

/** Hücre değerini ekranda gösterilecek metne çevirir (tarihler Türkiye duvar saati olarak). */
export function displayCell(v: any): string {
  if (isEmpty(v)) return "";
  if (v instanceof Date) {
    const iso = v.toISOString();
    return v.getUTCHours() === 0 && v.getUTCMinutes() === 0 ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
  }
  return String(v);
}

/**
 * Tablonun başlık satırını bulur: ilk 20 satırda, en az iki dolu hücresi olan ve dolu hücrelerinin
 * çoğunluğu sayı/tarih olmayan metinlerden oluşan ilk satır. Bulunamazsa 0.
 */
export function detectHeaderRow(grid: any[][]): number {
  for (let r = 0; r < Math.min(HEADER_SEARCH_ROWS, grid.length); r++) {
    const filled = (grid[r] || []).filter((v) => !isEmpty(v));
    if (filled.length < 2) continue;
    const textual = filled.filter((v) => typeof v === "string" && parseNumberTurkish(v) === null);
    if (textual.length >= Math.ceil(filled.length / 2)) return r;
  }
  return 0;
}

/**
 * Başlık satırındaki metinleri benzersiz kolon adlarına çevirir. Eşleştirme kolonları bu adlarla saklar;
 * böylece kolon sırası değişse de şablon aynı kolonu bulur.
 */
export function sheetHeaders(grid: any[][], headerRow: number): string[] {
  const headerCells = grid[headerRow] || [];
  const width = Math.max(headerCells.length, ...grid.slice(headerRow + 1, headerRow + 50).map((r) => r.length));
  const seen = new Map<string, number>();
  const headers: string[] = [];
  for (let i = 0; i < width; i++) {
    const base = displayCell(headerCells[i]).replace(/\s+/g, " ").trim() || `Kolon ${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    headers.push(count === 1 ? base : `${base} (${count})`);
  }
  return headers;
}

function inferColumnType(values: any[]): ColumnType {
  const filled = values.filter((v) => !isEmpty(v));
  if (filled.length === 0) return "empty";
  let dates = 0;
  let numbers = 0;
  for (const v of filled) {
    if (v instanceof Date) dates++;
    else if (typeof v === "number") numbers++;
    else if (typeof v === "string" && /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/.test(v.trim()) && parseTimestamp(v)) dates++;
    else if (parseNumberTurkish(v) !== null) numbers++;
  }
  if (dates >= filled.length * 0.8) return "date";
  if (numbers >= filled.length * 0.8) return "number";
  return "text";
}

/** Başlık satırından sonraki, tamamen boş olmayan veri satırları */
export function dataRows(grid: any[][], headerRow: number): any[][] {
  return grid.slice(headerRow + 1).filter((row) => row.some((v) => !isEmpty(v)));
}

export function buildSheetPreview(sheet: SheetGrid, headerRow = detectHeaderRow(sheet.grid)): SheetPreview {
  const headers = sheetHeaders(sheet.grid, headerRow);
  const rows = dataRows(sheet.grid, headerRow);
  const typeSample = rows.slice(0, TYPE_SAMPLE_ROWS);

  return {
    sheetName: sheet.sheetName,
    headerRow,
    rowCount: rows.length,
    columns: headers.map((header, index) => ({
      index,
      header,
      type: inferColumnType(typeSample.map((r) => r[index])),
      samples: rows
        .slice(0, 5)
        .map((r) => displayCell(r[index]))
        .filter((s) => s !== ""),
    })),
    sampleRows: rows.slice(0, 8).map((r) => headers.map((_, i) => displayCell(r[i]))),
  };
}
