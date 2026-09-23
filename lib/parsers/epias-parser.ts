/**
 * EPİAŞ / Şeffaflık Platformu Piyasa Verisi Ayrıştırıcı (Parser)
 *
 * Şeffaflık Platformu'ndan indirilen PTF, SMF, Sistem Yönü ve Gün İçi Piyasası (GİP AÖF)
 * raporlarını ayrıştırır. Platform her metriği ayrı dosya olarak verdiği için her dosya
 * yalnızca bir kısım sütunu içerebilir; `mergeMarketRows` dosyaları saat bazında birleştirir.
 *
 * Zaman damgaları üretim verisiyle aynı konvansiyondadır: Türkiye duvar saati UTC alanlarında.
 */

import { SystemDirection } from "@/lib/calculations/types";
import {
  extractCellValue,
  parseCsvText,
  parseExcelGrids,
  parseTimestamp,
  toHourNumber,
  detectOneBasedHours,
} from "@/lib/parsers/generation-parser";

/** Dosyadan okunan, bir kısım alanı eksik olabilecek saatlik piyasa satırı */
export interface PartialMarketRow {
  timestamp: Date;
  ptf?: number;
  smf?: number;
  systemDirection?: SystemDirection;
  gipPrice?: number;
}

/** Veritabanına yazılmaya hazır, PTF ve SMF'si tam saatlik piyasa verisi */
export interface ParsedMarketData {
  timestamp: Date;
  ptf: number;
  smf: number;
  systemDirection: SystemDirection;
  gipPrice: number | null;
}

export type MarketValueField = "ptf" | "smf" | "systemDirection" | "gipPrice";

export interface MarketColumnMapping {
  date: number;
  hour?: number;
  ptf?: number;
  smf?: number;
  systemDirection?: number;
  gipPrice?: number;
}

export interface MarketFileParseResult {
  rows: PartialMarketRow[];
  columnsFound: MarketValueField[];
  skippedRowsCount: number;
  warnings: string[];
}

export const MARKET_COLUMN_ALIASES: Record<keyof MarketColumnMapping, string[]> = {
  date: ["tarih", "date", "zaman", "timestamp", "datetime"],
  hour: ["saat", "hour"],
  ptf: ["ptf", "mcp", "piyasa takas fiyatı", "piyasa takas fiyati", "takas fiyatı", "takas fiyati"],
  smf: [
    "smf",
    "smp",
    "sistem marjinal fiyatı",
    "sistem marjinal fiyati",
    "marjinal fiyat",
  ],
  systemDirection: ["sistem yönü", "sistem yonu", "system direction", "yön", "yon", "direction"],
  gipPrice: [
    "gip aöf",
    "gip aof",
    "gip",
    "ağırlıklı ortalama fiyat",
    "agirlikli ortalama fiyat",
    "aöf",
    "aof",
    "wap",
    "gün içi",
    "gun ici",
    "intraday",
  ],
};

/**
 * EPİAŞ raporlarında aynı fiyat TL, USD ve EUR cinsinden yan yana verilir; yalnızca TL sütunu kullanılır.
 */
const FOREIGN_CURRENCY_MARKERS = ["usd", "eur", "$", "€"];

/** Başlık satırının aranacağı en fazla satır sayısı (rapor üstündeki açıklama satırları için) */
const HEADER_SEARCH_ROWS = 20;

const normalizeHeader = (h: any) =>
  String(h ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[\r\n\t_]/g, " ");

/**
 * Sistem yönü metnini ve/veya EPİAŞ yön ID'sini SystemDirection tipine dönüştürür.
 * Yön bilgisi yoksa SMF > PTF ise açık, SMF < PTF ise fazla kabul edilir.
 */
export function normalizeSystemDirection(
  rawDirection?: string,
  directionId?: number,
  ptf = 0,
  smf = 0
): SystemDirection {
  if (directionId === 1) return "DEFICIT";
  if (directionId === 2 || directionId === 3) return "SURPLUS";

  if (rawDirection) {
    const norm = rawDirection
      .trim()
      .toLowerCase()
      .replace(/ğ/g, "g")
      .replace(/ı/g, "i")
      .replace(/ç/g, "c")
      .replace(/ş/g, "s")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u");

    if (norm.includes("acik") || norm.includes("acig") || norm.includes("deficit")) {
      return "DEFICIT";
    }
    if (norm.includes("fazla") || norm.includes("surplus")) {
      return "SURPLUS";
    }
    if (norm.includes("denge") || norm.includes("balanced")) {
      return "BALANCED";
    }
  }

  // Fallback: SMF ve PTF kıyaslaması
  if (smf > ptf) return "DEFICIT";
  if (smf < ptf) return "SURPLUS";
  return "BALANCED";
}

/**
 * Fiyat hücresini sayıya çevirir. Türkçe biçimler: "3.400,00", "2450,5" ve yalnızca binlik ayraçlı "1.250".
 * Fiyatlarda "1.250" ifadesi 1,25 TL değil 1.250 TL/MWh anlamına gelir.
 */
export function parsePrice(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  if (typeof val !== "string") return null;

  const clean = val.trim().replace(/\s/g, "").replace(/(tl|₺)$/i, "");
  if (!clean) return null;

  let normalized = clean;
  if (clean.includes(",") && clean.includes(".")) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (clean.includes(",")) {
    normalized = clean.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(clean)) {
    normalized = clean.replace(/\./g, "");
  }

  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Başlık satırındaki sütunları piyasa alanlarına eşler. Bir sütun yalnızca bir alana eşlenir.
 */
export function detectMarketColumns(headers: any[]): Partial<MarketColumnMapping> {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();

  const find = (aliases: string[], skipForeignCurrency = false): number | undefined => {
    const isCandidate = (i: number) =>
      normalized[i] !== "" &&
      !used.has(i) &&
      !(skipForeignCurrency && FOREIGN_CURRENCY_MARKERS.some((m) => normalized[i].includes(m)));

    for (const matches of [
      (h: string, a: string) => h === a,
      (h: string, a: string) => h.includes(a),
    ]) {
      for (let i = 0; i < normalized.length; i++) {
        if (isCandidate(i) && aliases.some((a) => matches(normalized[i], a))) {
          used.add(i);
          return i;
        }
      }
    }
    return undefined;
  };

  return {
    date: find(MARKET_COLUMN_ALIASES.date),
    hour: find(MARKET_COLUMN_ALIASES.hour),
    // "Sistem Marjinal Fiyatı" içinde "sistem" geçtiği için SMF, yönden önce eşlenir
    smf: find(MARKET_COLUMN_ALIASES.smf, true),
    ptf: find(MARKET_COLUMN_ALIASES.ptf, true),
    gipPrice: find(MARKET_COLUMN_ALIASES.gipPrice, true),
    systemDirection: find(MARKET_COLUMN_ALIASES.systemDirection),
  };
}

const VALUE_FIELDS: MarketValueField[] = ["ptf", "smf", "systemDirection", "gipPrice"];

/**
 * Ham hücre ızgarasından (başlık satırı ilk 20 satır içinde aranır) saatlik piyasa satırlarını ayrıştırır.
 */
export function parseMarketGrid(grid: any[][], label = ""): MarketFileParseResult {
  let headerIndex = -1;
  let mapping: Partial<MarketColumnMapping> = {};

  for (let r = 0; r < Math.min(HEADER_SEARCH_ROWS, grid.length); r++) {
    const candidate = detectMarketColumns(grid[r] || []);
    if (candidate.date !== undefined && VALUE_FIELDS.some((f) => candidate[f] !== undefined)) {
      headerIndex = r;
      mapping = candidate;
      break;
    }
  }

  if (headerIndex === -1 || mapping.date === undefined) {
    throw new Error(
      `${label}Piyasa verisi tablosu bulunamadı. Başlık satırında Tarih ve en az bir fiyat/yön sütunu ` +
        `(PTF, SMF, Sistem Yönü, GİP AÖF) olmalıdır.`
    );
  }

  const dateCol = mapping.date;
  const columnsFound = VALUE_FIELDS.filter((f) => mapping[f] !== undefined);
  const dataRows = grid.slice(headerIndex + 1);
  const oneBasedHours =
    mapping.hour !== undefined ? detectOneBasedHours(dataRows.map((r) => r[mapping.hour!])) : false;

  const rows: PartialMarketRow[] = [];
  const warnings: string[] = [];
  let skippedRowsCount = 0;

  for (const raw of dataRows) {
    const rawDate = raw[dateCol];
    if (rawDate === null || rawDate === undefined || rawDate === "") continue;

    let hour: number | undefined;
    if (mapping.hour !== undefined) {
      const h = toHourNumber(raw[mapping.hour]);
      if (h !== null) hour = oneBasedHours ? h - 1 : h;
    }

    // Alt bilgi satırları ("Toplam", "Ortalama" vb.) tarih olarak okunamaz ve atlanır
    const timestamp = parseTimestamp(rawDate, hour);
    if (!timestamp) {
      skippedRowsCount++;
      continue;
    }

    const row: PartialMarketRow = { timestamp };
    if (mapping.ptf !== undefined) row.ptf = parsePrice(raw[mapping.ptf]) ?? undefined;
    if (mapping.smf !== undefined) row.smf = parsePrice(raw[mapping.smf]) ?? undefined;
    if (mapping.gipPrice !== undefined) row.gipPrice = parsePrice(raw[mapping.gipPrice]) ?? undefined;
    if (mapping.systemDirection !== undefined) {
      const dirText = raw[mapping.systemDirection];
      if (dirText !== null && dirText !== undefined && String(dirText).trim() !== "") {
        row.systemDirection = normalizeSystemDirection(String(dirText));
      }
    }

    rows.push(row);
  }

  if (oneBasedHours) {
    warnings.push(`${label}saatler 1-24 formatında algılandı (1. saat = 00:00-01:00).`);
  }
  if (skippedRowsCount > 0) {
    warnings.push(`${label}tarihi okunamayan ${skippedRowsCount} satır atlandı.`);
  }

  return { rows, columnsFound, skippedRowsCount, warnings };
}

/**
 * Piyasa verisi dosyasını (.xlsx veya .csv) ayrıştırır. Excel'de tablo içeren tüm sayfalar okunur.
 */
export async function parseMarketFile(
  fileBuffer: Buffer,
  filename: string
): Promise<MarketFileParseResult> {
  const ext = filename.split(".").pop()?.toLowerCase();

  let sheets: Array<{ sheetName: string; grid: any[][] }>;
  if (ext === "csv" || ext === "txt") {
    const objects = parseCsvText(fileBuffer.toString("utf-8"));
    const headers = objects.length > 0 ? Object.keys(objects[0]) : [];
    sheets = [{ sheetName: filename, grid: [headers, ...objects.map((o) => headers.map((h) => o[h]))] }];
  } else {
    sheets = await parseExcelGrids(fileBuffer);
  }

  const multiSheet = sheets.length > 1;
  const result: MarketFileParseResult = { rows: [], columnsFound: [], skippedRowsCount: 0, warnings: [] };
  let firstError: Error | null = null;

  for (const sheet of sheets) {
    const label = multiSheet ? `"${sheet.sheetName}" sayfası: ` : "";
    try {
      const parsed = parseMarketGrid(
        sheet.grid.map((row) => row.map(extractCellValue)),
        label
      );
      result.rows.push(...parsed.rows);
      result.skippedRowsCount += parsed.skippedRowsCount;
      result.warnings.push(...parsed.warnings);
      for (const col of parsed.columnsFound) {
        if (!result.columnsFound.includes(col)) result.columnsFound.push(col);
      }
    } catch (err) {
      firstError ??= err as Error;
    }
  }

  if (result.rows.length === 0) {
    throw firstError ?? new Error(`"${filename}" dosyasında piyasa verisi satırı bulunamadı.`);
  }

  return result;
}

/**
 * Ayrı ayrı yüklenen PTF / SMF / Sistem Yönü / GİP dosyalarının satırlarını saat bazında birleştirir.
 * Aynı saat ve alan birden fazla dosyada varsa sonraki dosyadaki değer geçerli olur.
 * PTF veya SMF'si eksik kalan saatler yazılmaz; `incompleteHours` olarak raporlanır.
 */
export function mergeMarketRows(parts: PartialMarketRow[][]): {
  complete: ParsedMarketData[];
  incompleteHours: Date[];
} {
  const byHour = new Map<number, PartialMarketRow>();

  for (const rows of parts) {
    for (const row of rows) {
      const key = row.timestamp.getTime();
      const existing = byHour.get(key) ?? { timestamp: row.timestamp };
      for (const field of VALUE_FIELDS) {
        if (row[field] !== undefined) (existing as any)[field] = row[field];
      }
      byHour.set(key, existing);
    }
  }

  const complete: ParsedMarketData[] = [];
  const incompleteHours: Date[] = [];

  for (const row of byHour.values()) {
    if (row.ptf === undefined || row.smf === undefined) {
      incompleteHours.push(row.timestamp);
      continue;
    }
    complete.push({
      timestamp: row.timestamp,
      ptf: row.ptf,
      smf: row.smf,
      systemDirection:
        row.systemDirection ?? normalizeSystemDirection(undefined, undefined, row.ptf, row.smf),
      gipPrice: row.gipPrice ?? null,
    });
  }

  complete.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  incompleteHours.sort((a, b) => a.getTime() - b.getTime());

  return { complete, incompleteHours };
}
