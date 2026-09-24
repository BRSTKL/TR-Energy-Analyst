/**
 * TR-Energy Analyst - Santral Üretim Verisi Ayrıştırıcı (Generation Parser)
 * 
 * Üreticilerin EPİAŞ EYS, Şeffaflık Platformu, SCADA veya kendi Excel/CSV
 * tablolarından aldıkları saatlik üretim ve tahmin verilerini tip güvenli
 * ve doğrulanmış verilere dönüştürür.
 */

import ExcelJS from "exceljs";
import { loadWorkbookResilient } from "./xlsx-load";

export interface RawGenerationInput {
  date: string | Date;
  hour?: string | number;
  forecastMwh: number;
  actualMwh: number;
  plantName?: string;
}

export interface ParsedGenerationRow {
  timestamp: Date;
  forecastMwh: number;
  actualMwh: number;
  plantName?: string;
  imbalanceMwh: number;
}

export interface GenerationParseResult {
  rows: ParsedGenerationRow[];
  totalRowsParsed: number;
  validRowsCount: number;
  skippedRowsCount: number;
  dateRange: {
    start: Date;
    end: Date;
    startStr: string;
    endStr: string;
  } | null;
  detectedPlants: string[];
  warnings: string[];
}

export interface GenerationColumnMapping {
  date: string;
  hour?: string;
  forecast: string;
  actual: string;
  plant?: string;
}

export const GENERATION_COLUMN_ALIASES: Record<keyof GenerationColumnMapping, string[]> = {
  date: [
    "tarih",
    "date",
    "zaman",
    "timestamp",
    "gün",
    "gun",
    "uzlaştırma tarihi",
    "uzlastirma tarihi",
    "tarih saat",
    "tarih/saat",
    "datetime",
  ],
  hour: [
    "saat",
    "hour",
    "time",
    "zaman dilimi",
    "saat dilimi",
    "periyot",
    "dönem",
    "donem",
    "uzlaştırma saati",
    "uzlastirma saati",
  ],
  forecast: [
    "kgöp",
    "kgop",
    "tahmin",
    "forecast",
    "göp",
    "gop",
    "planlanan",
    "üretim tahmini",
    "uretim tahmini",
    "tahmini üretim",
    "tahmini uretim",
    "kgöp (mwh)",
    "kgop (mwh)",
    "tahmin (mwh)",
    "forecast (mwh)",
    "kgöp mwh",
    "tahmin mwh",
    "gün öncesi üretim tahmini",
    "gun oncesi uretim tahmini",
  ],
  actual: [
    "gerçekleşen",
    "gerceklesen",
    "üretim",
    "uretim",
    "actual",
    "realized",
    "uev",
    "fiziki üretim",
    "fiziki uretim",
    "gerçekleşen üretim",
    "gerceklesen uretim",
    "gerçekleşen (mwh)",
    "gerceklesen (mwh)",
    "üretim (mwh)",
    "uretim (mwh)",
    "uev (mwh)",
    "actual (mwh)",
    "realized (mwh)",
    "gerçekleşen mwh",
    "üretim mwh",
  ],
  plant: [
    "santral",
    "santral adı",
    "santral adi",
    "plant",
    "plant name",
    "tesis",
    "tesis adı",
    "tesis adi",
    "santral türü",
    "santral kodu",
  ],
};

/**
 * Bu ifadeleri içeren başlıklar tahmin sütunudur; tarih veya gerçekleşen sütunu olarak seçilmez.
 */
const FORECAST_HEADER_MARKERS = [
  "tahmin",
  "forecast",
  "kgöp",
  "kgop",
  "planlanan",
  "gün öncesi",
  "gun oncesi",
];

/**
 * Excel hücre değerini güvenli bir şekilde metin veya sayıya çevirir
 */
export function extractCellValue(cellValue: any): any {
  if (cellValue === null || cellValue === undefined) return null;
  if (typeof cellValue === "object") {
    if (cellValue instanceof Date) return cellValue;
    if ("result" in cellValue) return cellValue.result;
    // Önbellekte sonucu olmayan formül hücresi (örn. { sharedFormula: "B27" }) -> değer yok
    if ("formula" in cellValue || "sharedFormula" in cellValue) return null;
    if ("text" in cellValue) return cellValue.text;
    if ("richText" in cellValue && Array.isArray(cellValue.richText)) {
      return cellValue.richText.map((t: any) => t.text || "").join("");
    }
  }
  return cellValue;
}

/**
 * Türkçe ve evrensel sayı formatlarını (örn. "1.250,50", "1250.50") sayıya çevirir
 */
export function parseNumberTurkish(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  if (typeof val === "string") {
    const cleanStr = val.trim().replace(/\s/g, "");
    if (!cleanStr) return null;

    // Hem nokta hem virgül varsa: "1.250,50" -> 1250.50
    if (cleanStr.includes(",") && cleanStr.includes(".")) {
      const normalized = cleanStr.replace(/\./g, "").replace(",", ".");
      const n = parseFloat(normalized);
      return isNaN(n) ? null : n;
    }
    // Sadece virgül varsa: "1250,50" -> 1250.50
    if (cleanStr.includes(",")) {
      const normalized = cleanStr.replace(",", ".");
      const n = parseFloat(normalized);
      return isNaN(n) ? null : n;
    }
    const n = parseFloat(cleanStr);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Tarih ve saat değerlerini Date nesnesine dönüştürür.
 * 0-23 ve 1-24 saat dilimlerini destekler.
 */
export function parseTimestamp(rawDate: any, rawHour?: any): Date | null {
  if (!rawDate) return null;

  let baseDate: Date;

  if (rawDate instanceof Date) {
    baseDate = new Date(rawDate);
  } else if (typeof rawDate === "number") {
    // Excel seri tarih numarası (örn. 45000)
    // Excel epoch: 1899-12-30
    baseDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
  } else {
    const str = String(rawDate).trim();
    // "DD.MM.YYYY" veya "DD/MM/YYYY" formatı
    const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(.*)$/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      baseDate = new Date(Date.UTC(year, month, day));

      // Eğer saat tarih stringinin içindeyse (örn: "01.01.2025 14:00")
      const timePart = dmyMatch[4]?.trim();
      if (timePart && (rawHour === undefined || rawHour === null)) {
        const timeMatch = timePart.match(/(\d{1,2}):?(\d{2})?/);
        if (timeMatch) {
          const h = parseInt(timeMatch[1], 10);
          baseDate.setUTCHours(h, 0, 0, 0);
          return baseDate;
        }
      }
    } else {
      // ISO tarih/saat ("2025-01-01", "2025-01-01 14:00", "2025-01-01T14:00:00+03:00"):
      // saat dilimi eki yok sayılır, yazılan duvar saati alınır. new Date() ile okunsaydı
      // "+03:00" ekli EPİAŞ zamanları 3 saat kayardı.
      const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2}))?)?/);
      if (isoMatch) {
        const [, y, m, d, h] = isoMatch;
        baseDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), h ? Number(h) : 0));
        if (h !== undefined && (rawHour === undefined || rawHour === null || rawHour === "")) {
          return baseDate;
        }
      } else {
        const parsed = new Date(str);
        if (isNaN(parsed.getTime())) return null;
        baseDate = parsed;
      }
    }
  }

  if (isNaN(baseDate.getTime())) return null;

  // Saat parametresi varsa uygula
  if (rawHour !== undefined && rawHour !== null && rawHour !== "") {
    let hourNum: number | null = null;

    if (typeof rawHour === "number") {
      hourNum = rawHour;
    } else if (rawHour instanceof Date) {
      // Excel'de saat biçimli hücre (örn. 14:00) ExcelJS tarafından Date olarak döner
      hourNum = rawHour.getUTCHours();
    } else if (typeof rawHour === "string") {
      const cleanHour = rawHour.trim();
      // "14:00" veya "14:00 - 15:00" formatı
      const match = cleanHour.match(/^(\d{1,2})(?::\d{2})?/);
      if (match) {
        hourNum = parseInt(match[1], 10);
      }
    }

    if (hourNum !== null && !isNaN(hourNum)) {
      // Türkiye elektrik piyasasında 1-24 formatı yaygındır (1. saat = 00:00 - 01:00)
      // Eğer saat 24 ise bir sonraki günün 00:00 saati veya 23:00 olabilir
      if (hourNum === 24) {
        hourNum = 23; // 24. saat = 23:00 periyodu
      }
      baseDate.setUTCHours(hourNum, 0, 0, 0);
    }
  }

  return baseDate;
}

/**
 * Tablodaki başlık satırını arar ve sütun indekslerini eşleştirir
 */
export function detectColumnMapping(headers: string[]): {
  mapping: GenerationColumnMapping;
  missingRequired: string[];
} {
  const normalizedHeaders = headers.map((h) =>
    String(h || "")
      .trim()
      .toLowerCase()
      .replace(/[\r\n\t_]/g, " ")
  );

  // Bir sütun yalnızca tek bir alana eşlenebilir. Aksi halde "Gün Öncesi Üretim Tahmini"
  // başlığı hem tahmin hem de ("üretim" kısmi eşleşmesiyle) gerçekleşen sütunu olarak seçilir.
  const usedIndexes = new Set<number>();

  const findHeaderIndex = (aliases: string[], excludeIfContains: string[] = []): string | undefined => {
    const isCandidate = (i: number) =>
      !usedIndexes.has(i) && !excludeIfContains.some((e) => normalizedHeaders[i].includes(e));

    const pick = (i: number) => {
      usedIndexes.add(i);
      return headers[i];
    };

    // 1. Tam eşleşme ara
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const h = normalizedHeaders[i];
      if (isCandidate(i) && aliases.some((a) => a.toLowerCase() === h)) {
        return pick(i);
      }
    }
    // 2. Kısmi içeren ara
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const h = normalizedHeaders[i];
      if (isCandidate(i) && aliases.some((a) => h.includes(a.toLowerCase()))) {
        return pick(i);
      }
    }
    return undefined;
  };

  const dateCol = findHeaderIndex(GENERATION_COLUMN_ALIASES.date, FORECAST_HEADER_MARKERS);
  const hourCol = findHeaderIndex(GENERATION_COLUMN_ALIASES.hour);
  const forecastCol = findHeaderIndex(GENERATION_COLUMN_ALIASES.forecast);
  const actualCol = findHeaderIndex(GENERATION_COLUMN_ALIASES.actual, FORECAST_HEADER_MARKERS);
  const plantCol = findHeaderIndex(GENERATION_COLUMN_ALIASES.plant);

  const missingRequired: string[] = [];
  if (!dateCol) missingRequired.push("Tarih (Date)");
  if (!forecastCol) missingRequired.push("Tahmin / KGÖP MWh");
  if (!actualCol) missingRequired.push("Gerçekleşen / Üretim MWh");

  return {
    mapping: {
      date: dateCol || "",
      hour: hourCol,
      forecast: forecastCol || "",
      actual: actualCol || "",
      plant: plantCol,
    },
    missingRequired,
  };
}

/**
 * CSV metnini satır ve sütunlarına ayırır (Virgül ve noktalı virgül desteği)
 */
export function parseCsvText(csvText: string): Record<string, any>[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // Ayırıcıyı belirle (Virgül mü, noktalı virgül mü?)
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ",";
  if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ";";
  else if (tabCount > commaCount && tabCount > semicolonCount) delimiter = "\t";

  const splitLine = (line: string): string[] => {
    // Tırnak içindeki ayırıcıları koruyarak böl
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ""));
    return result;
  };

  const headers = splitLine(lines[0]);
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && !values[0])) continue;

    const rowObj: Record<string, any> = {};
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = values[j] !== undefined ? values[j] : null;
    }
    rows.push(rowObj);
  }

  return rows;
}

/**
 * Excel Buffer'ından ilk çalışma sayfasındaki verileri satır objelerine dönüştürür
 */
export async function parseExcelBuffer(buffer: Buffer): Promise<Record<string, any>[]> {
  const sheets = await parseExcelSheets(buffer);
  return sheets[0]?.rows ?? [];
}

/**
 * Excel Buffer'ındaki tüm çalışma sayfalarını (boş olmayanları) ayrı ayrı satır objelerine dönüştürür.
 * Her santralin ayrı sayfada tutulduğu dosyalar (örn. RES_1, RES_2, HES_1) için kullanılır.
 */
export async function parseExcelSheets(
  buffer: Buffer
): Promise<Array<{ sheetName: string; rows: Record<string, any>[] }>> {
  const workbook = await loadWorkbookResilient(buffer);

  return workbook.worksheets
    .map((worksheet) => ({ sheetName: worksheet.name.trim(), rows: worksheetToRows(worksheet) }))
    .filter((sheet) => sheet.rows.length > 0);
}

/**
 * Excel Buffer'ındaki her sayfayı ham hücre değerleri ızgarası olarak döndürür (başlık varsayımı yapmaz).
 * Başlık satırının tablonun üstündeki açıklama satırlarından sonra geldiği raporlar için kullanılır.
 */
export async function parseExcelGrids(
  buffer: Buffer
): Promise<Array<{ sheetName: string; grid: any[][] }>> {
  const workbook = await loadWorkbookResilient(buffer);

  return workbook.worksheets
    .map((worksheet) => {
      const grid: any[][] = [];
      worksheet.eachRow((row) => {
        const rawValues = Array.isArray(row.values) ? Array.from(row.values).slice(1) : [];
        grid.push(rawValues.map(extractCellValue));
      });
      return { sheetName: worksheet.name.trim(), grid };
    })
    .filter((sheet) => sheet.grid.length > 0);
}

function worksheetToRows(worksheet: ExcelJS.Worksheet): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  let headers: string[] = [];

  worksheet.eachRow((row, rowNumber) => {
    const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];

    if (rowNumber === 1 || headers.length === 0) {
      // Başlık satırı
      const candidateHeaders = rawValues.map((v) => {
        const extracted = extractCellValue(v);
        return extracted !== null && extracted !== undefined ? String(extracted).trim() : "";
      });

      // Eğer ilk satır tamamen boşsa bir sonraki satırı başlık yap
      if (candidateHeaders.some((h) => h.length > 0)) {
        headers = candidateHeaders;
        return;
      }
    }

    if (headers.length === 0) return;

    const rowObj: Record<string, any> = {};
    let hasData = false;

    headers.forEach((header, idx) => {
      if (!header) return;
      const val = extractCellValue(rawValues[idx]);
      rowObj[header] = val;
      if (val !== null && val !== undefined && val !== "") {
        hasData = true;
      }
    });

    if (hasData) {
      rows.push(rowObj);
    }
  });

  return rows;
}

/**
 * Saat hücresini 0-24 aralığında tam sayıya çevirir (sayı, "14:00", "14:00 - 15:00" veya Date).
 * Okunamazsa null döner.
 */
export function toHourNumber(rawHour: any): number | null {
  if (rawHour === null || rawHour === undefined || rawHour === "") return null;
  if (typeof rawHour === "number") return Number.isFinite(rawHour) ? Math.trunc(rawHour) : null;
  if (rawHour instanceof Date) return rawHour.getUTCHours();
  if (typeof rawHour === "string") {
    const match = rawHour.trim().match(/^(\d{1,2})(?::\d{2})?/);
    return match ? parseInt(match[1], 10) : null;
  }
  return null;
}

/**
 * Dosyanın 1-24 saat formatında (1. saat = 00:00-01:00) olup olmadığını dosya düzeyinde tespit eder.
 * Tek bir satıra bakarak karar verilemez: "1" hem 0-23 formatında 01:00'ı hem 1-24 formatında 00:00'ı ifade eder.
 */
export function detectOneBasedHours(rawHours: any[]): boolean {
  const hours = rawHours.map(toHourNumber).filter((h): h is number => h !== null);
  return hours.length > 0 && hours.includes(24) && !hours.includes(0);
}

function dateKeyOf(rawDate: any): string | null {
  if (rawDate === null || rawDate === undefined || rawDate === "") return null;
  if (rawDate instanceof Date) return rawDate.toISOString().slice(0, 10);
  return String(rawDate).trim().split(/\s+/)[0];
}

export interface GenerationRowParseOptions {
  /** Uyarı mesajlarının önüne eklenecek etiket (örn. '"RES_1" sayfası, ') */
  label?: string;
  /** Santral sütunu yoksa satırlara yazılacak santral adı */
  plantName?: string;
  /** Saat formatı; "auto" dosya düzeyinde 1-24 algılaması yapar */
  hourFormat?: "auto" | "0-23" | "1-24";
  /** Tahmin ve gerçekleşen değerlerin çarpanı (kWh → MWh için 0.001) */
  valueScale?: number;
  /** Uyarılardaki satır numarası = dizi indeksi + bu değer (varsayılan 2: başlık satırı 1. satır) */
  rowNumberOffset?: number;
}

export interface GenerationRowParseResult {
  rows: ParsedGenerationRow[];
  skippedCount: number;
  warnings: string[];
  oneBasedHours: boolean;
  inferredHourCount: number;
  negativeCount: number;
}

/**
 * Başlıklarına göre anahtarlanmış ham satırları, sütun eşlemesine göre saatlik üretim satırlarına çevirir.
 * Dosya okuyucu (parseGenerationFile) ve kolon eşleştirme ekranı (lib/import) aynı kuralları kullanır:
 * Türkiye duvar saati, dosya düzeyinde 1-24 saat algılama, boş saat hücrelerini önceki satırdan türetme,
 * negatif değerleri 0'a çekme.
 */
export function parseGenerationRows(
  rows: Record<string, any>[],
  mapping: GenerationColumnMapping,
  options: GenerationRowParseOptions = {}
): GenerationRowParseResult {
  const label = options.label ?? "";
  const scale = options.valueScale ?? 1;
  const rowOffset = options.rowNumberOffset ?? 2;
  const hourFormat = options.hourFormat ?? "auto";

  const oneBasedHours = !mapping.hour
    ? false
    : hourFormat === "1-24"
      ? true
      : hourFormat === "0-23"
        ? false
        : detectOneBasedHours(rows.map((r) => r[mapping.hour!]));

  const parsed: ParsedGenerationRow[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;
  let negativeCount = 0;
  let prevDateKey: string | null = null;
  let prevHour: number | null = null;
  let inferredHourCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rawDate = raw[mapping.date];
    let rawHour: any = mapping.hour ? raw[mapping.hour] : undefined;

    if (mapping.hour && rawDate !== null && rawDate !== undefined && rawDate !== "") {
      const dateKey = dateKeyOf(rawDate);
      let hourNum = toHourNumber(rawHour);

      if (hourNum === null) {
        // Boş saat hücresi (örn. önbellekte sonucu olmayan "=B2" formülü):
        // aynı günün önceki satırından bir saat sonrası, yeni günün ilk satırıysa 00:00
        hourNum = dateKey === prevDateKey && prevHour !== null ? prevHour + 1 : 0;
        inferredHourCount++;
      } else if (oneBasedHours) {
        hourNum -= 1;
      }

      prevDateKey = dateKey;
      prevHour = hourNum;
      rawHour = hourNum;
    }

    const timestamp = parseTimestamp(rawDate, rawHour);
    if (!timestamp) {
      skippedCount++;
      if (skippedCount <= 3) {
        warnings.push(`${label}${i + rowOffset}. satırdaki tarih/saat okunamadı, atlandı.`);
      }
      continue;
    }

    const forecastRaw = parseNumberTurkish(raw[mapping.forecast]);
    const actualRaw = parseNumberTurkish(raw[mapping.actual]);

    if (forecastRaw === null || actualRaw === null) {
      skippedCount++;
      if (skippedCount <= 3) {
        warnings.push(
          `${label}${i + rowOffset}. satırda sayısal tahmin veya gerçekleşen değeri bulunamadı, atlandı.`
        );
      }
      continue;
    }

    const forecast = forecastRaw * scale;
    const actual = actualRaw * scale;

    // Negatif MWh kontrolü ve sıfıra çekme
    const cleanForecast = Math.max(0, forecast);
    const cleanActual = Math.max(0, actual);

    if (forecast < 0 || actual < 0) {
      negativeCount++;
      if (negativeCount <= 3) {
        warnings.push(`${label}${i + rowOffset}. satırdaki negatif MWh değeri 0'a eşitlendi.`);
      }
    }

    const plantName =
      mapping.plant && raw[mapping.plant] ? String(raw[mapping.plant]).trim() : options.plantName;

    parsed.push({
      timestamp,
      forecastMwh: cleanForecast,
      actualMwh: cleanActual,
      imbalanceMwh: Number((cleanActual - cleanForecast).toFixed(4)),
      plantName,
    });
  }

  if (oneBasedHours) {
    warnings.push(`${label}saatler 1-24 formatında algılandı (1. saat = 00:00-01:00).`);
  }
  if (inferredHourCount > 0) {
    warnings.push(
      `${label}${inferredHourCount} satırda saat hücresi boştu (hesaplanmamış formül olabilir); saat önceki satırdan türetildi.`
    );
  }

  return { rows: parsed, skippedCount, warnings, oneBasedHours, inferredHourCount, negativeCount };
}

/**
 * Ana Ayrıştırma Fonksiyonu: Excel veya CSV buffer'ını işleyip tip güvenli santral kayıtları döndürür.
 *
 * Excel dosyasında birden fazla veri sayfası varsa ve santral sütunu yoksa, her sayfa ayrı bir
 * santral kabul edilir ve sayfa adı santral adı olarak kullanılır.
 */
export async function parseGenerationFile(
  fileBuffer: Buffer,
  filename: string
): Promise<GenerationParseResult> {
  const ext = filename.split(".").pop()?.toLowerCase();
  let sheets: Array<{ sheetName?: string; rows: Record<string, any>[] }> = [];

  if (ext === "csv" || ext === "txt") {
    const text = fileBuffer.toString("utf-8");
    sheets = [{ rows: parseCsvText(text) }];
  } else if (ext === "xlsx" || ext === "xls") {
    sheets = await parseExcelSheets(fileBuffer);
  } else {
    // Uzantı yoksa veya bilinmiyorsa önce Excel dene, hata verirse CSV dene
    try {
      sheets = await parseExcelSheets(fileBuffer);
    } catch {
      const text = fileBuffer.toString("utf-8");
      sheets = [{ rows: parseCsvText(text) }];
    }
  }

  sheets = sheets.filter((s) => s.rows.length > 0);

  if (sheets.length === 0) {
    throw new Error("Yüklenen dosyada okunabilir veri satırı bulunamadı.");
  }

  const multiSheet = sheets.length > 1;
  const warnings: string[] = [];
  const parsedRows: ParsedGenerationRow[] = [];
  const plantNamesSet = new Set<string>();

  let skippedCount = 0;
  let totalRowsParsed = 0;
  let firstMappingError: string | null = null;

  for (const sheet of sheets) {
    const sampleHeaders = Object.keys(sheet.rows[0]);
    const { mapping, missingRequired } = detectColumnMapping(sampleHeaders);

    if (missingRequired.length > 0) {
      const message =
        `Zorunlu sütunlar tespit edilemedi: ${missingRequired.join(", ")}. ` +
        `Mevcut sütunlar: ${sampleHeaders.join(", ")}`;
      if (!multiSheet) throw new Error(message);

      firstMappingError ??= `"${sheet.sheetName}" sayfası: ${message}`;
      warnings.push(`"${sheet.sheetName}" sayfasında üretim sütunları bulunamadı, sayfa atlandı.`);
      continue;
    }

    totalRowsParsed += sheet.rows.length;

    const result = parseGenerationRows(sheet.rows, mapping, {
      label: multiSheet ? `"${sheet.sheetName}" sayfası, ` : "",
      plantName: multiSheet && !mapping.plant ? sheet.sheetName : undefined,
    });

    skippedCount += result.skippedCount;
    warnings.push(...result.warnings);
    for (const row of result.rows) {
      parsedRows.push(row);
      if (row.plantName) plantNamesSet.add(row.plantName);
    }
  }

  if (totalRowsParsed === 0 && firstMappingError) {
    throw new Error(firstMappingError);
  }

  // Kronolojik sırala
  parsedRows.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (parsedRows.length === 0) {
    throw new Error("Dosyadaki satırların hiçbiri geçerli tarih ve üretim verisi içermiyor.");
  }

  const startDate = parsedRows[0].timestamp;
  const endDate = parsedRows[parsedRows.length - 1].timestamp;

  return {
    rows: parsedRows,
    totalRowsParsed,
    validRowsCount: parsedRows.length,
    skippedRowsCount: skippedCount,
    dateRange: {
      start: startDate,
      end: endDate,
      startStr: startDate.toISOString().split("T")[0],
      endStr: endDate.toISOString().split("T")[0],
    },
    detectedPlants: Array.from(plantNamesSet),
    warnings,
  };
}
