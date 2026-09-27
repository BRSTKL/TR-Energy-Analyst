import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  parseNumberTurkish,
  parseTimestamp,
  detectColumnMapping,
  parseCsvText,
  parseGenerationFile,
  detectOneBasedHours,
} from "@/lib/parsers/generation-parser";

describe("Santral Üretim Verisi Ayrıştırıcı (Generation Parser) Testleri", () => {
  describe("1. parseNumberTurkish", () => {
    it("Türkçe binlik noktalı ve ondalık virgüllü stringleri doğru çözmelidir", () => {
      expect(parseNumberTurkish("1.250,50")).toBe(1250.5);
      expect(parseNumberTurkish("10.000,00")).toBe(10000);
    });

    it("Sadece virgüllü ondalık sayıları çözmelidir", () => {
      expect(parseNumberTurkish("45,75")).toBe(45.75);
      expect(parseNumberTurkish("0,5")).toBe(0.5);
    });

    it("Standart noktalı float ve integer sayıları çözmelidir", () => {
      expect(parseNumberTurkish("1250.50")).toBe(1250.5);
      expect(parseNumberTurkish(42.5)).toBe(42.5);
      expect(parseNumberTurkish(100)).toBe(100);
    });

    it("Boş veya geçersiz değerlerde null döndürmelidir", () => {
      expect(parseNumberTurkish("")).toBeNull();
      expect(parseNumberTurkish(null)).toBeNull();
      expect(parseNumberTurkish(undefined)).toBeNull();
      expect(parseNumberTurkish("geçersiz")).toBeNull();
    });
  });

  describe("2. parseTimestamp", () => {
    it("DD.MM.YYYY ve saat stringini UTC Date olarak çözmelidir", () => {
      const d = parseTimestamp("15.06.2025", "14:00");
      expect(d).not.toBeNull();
      expect(d?.getUTCFullYear()).toBe(2025);
      expect(d?.getUTCMonth()).toBe(5); // Haziran = index 5
      expect(d?.getUTCDate()).toBe(15);
      expect(d?.getUTCHours()).toBe(14);
    });

    it("1-24 arası elektrik piyasası saat formatını desteklemelidir", () => {
      const d1 = parseTimestamp("15.06.2025", 1);
      expect(d1?.getUTCHours()).toBe(1);

      const d24 = parseTimestamp("15.06.2025", 24);
      expect(d24?.getUTCHours()).toBe(23);
    });

    it("Tarih içinde birleşik saat stringi ('01.01.2025 09:00') varsa ayrıştırmalıdır", () => {
      const d = parseTimestamp("01.01.2025 09:00");
      expect(d).not.toBeNull();
      expect(d?.getUTCHours()).toBe(9);
      expect(d?.getUTCDate()).toBe(1);
    });
  });

  describe("3. detectColumnMapping", () => {
    it("Tipik EPİAŞ / EYS Türkçe sütun başlıklarını tanımalıdır", () => {
      const headers = ["Tarih", "Saat", "KGÜP (MWh)", "Gerçekleşen (MWh)", "Santral Adı"];
      const { mapping, missingRequired } = detectColumnMapping(headers);

      expect(missingRequired).toHaveLength(0);
      expect(mapping.date).toBe("Tarih");
      expect(mapping.hour).toBe("Saat");
      expect(mapping.forecast).toBe("KGÜP (MWh)");
      expect(mapping.actual).toBe("Gerçekleşen (MWh)");
      expect(mapping.plant).toBe("Santral Adı");
    });

    it("Alternatif SCADA sütun başlıklarını tanımalıdır", () => {
      const headers = ["Date", "Hour", "Forecast", "Actual"];
      const { mapping, missingRequired } = detectColumnMapping(headers);

      expect(missingRequired).toHaveLength(0);
      expect(mapping.date).toBe("Date");
      expect(mapping.forecast).toBe("Forecast");
      expect(mapping.actual).toBe("Actual");
    });

    it("'Gün Öncesi Üretim Tahmini' başlığını gerçekleşen sütunu olarak seçmemelidir", () => {
      // "üretim" gerçekleşen alias'ı kısmi eşleşmeyle tahmin sütununu yakalıyordu
      const headers = ["Tarih", "Saat", "Gün Öncesi Üretim Tahmini (MWh)", "Gerçekleşen Üretim  (MWh)"];
      const { mapping, missingRequired } = detectColumnMapping(headers);

      expect(missingRequired).toHaveLength(0);
      expect(mapping.date).toBe("Tarih");
      expect(mapping.forecast).toBe("Gün Öncesi Üretim Tahmini (MWh)");
      expect(mapping.actual).toBe("Gerçekleşen Üretim  (MWh)");
    });

    it("Bir sütunu birden fazla alana eşlememelidir", () => {
      const headers = ["Tarih", "Saat", "Üretim Tahmini", "Üretim"];
      const { mapping } = detectColumnMapping(headers);

      expect(mapping.forecast).toBe("Üretim Tahmini");
      expect(mapping.actual).toBe("Üretim");
    });

    it("Zorunlu sütunlar eksik olduğunda hata listesi dönmelidir", () => {
      const headers = ["Tarih", "Fiyat", "Sıcaklık"];
      const { missingRequired } = detectColumnMapping(headers);

      expect(missingRequired).toContain("Tahmin / KGÜP MWh");
      expect(missingRequired).toContain("Gerçekleşen / Üretim MWh");
    });
  });

  describe("4. parseCsvText", () => {
    it("Noktalı virgüllü ve tırnaklı CSV metnini doğru ayrıştırmalıdır", () => {
      const csv = `Tarih;Saat;KGÜP;Gerçekleşen
01.01.2025;00:00;45,0;42,5
01.01.2025;01:00;40,0;48,0`;

      const rows = parseCsvText(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]["Tarih"]).toBe("01.01.2025");
      expect(rows[0]["KGÜP"]).toBe("45,0");
      expect(rows[0]["Gerçekleşen"]).toBe("42,5");
    });

    it("Standart virgüllü CSV metnini doğru ayrıştırmalıdır", () => {
      const csv = `Date,Hour,Forecast,Actual
2025-01-01,00:00,50,45
2025-01-01,01:00,60,65`;

      const rows = parseCsvText(csv);
      expect(rows).toHaveLength(2);
      expect(rows[1]["Forecast"]).toBe("60");
    });
  });

  describe("5. parseGenerationFile (Uçtan Uca)", () => {
    it("CSV buffer'ından geçerli ve sıralı ParsedGenerationRow kayıtları üretmelidir", async () => {
      const csv = `Tarih;Saat;KGÜP;Gerçekleşen
01.01.2025;01:00;40;45
01.01.2025;00:00;30;25`;

      const buffer = Buffer.from(csv, "utf-8");
      const result = await parseGenerationFile(buffer, "uretim.csv");

      expect(result.validRowsCount).toBe(2);
      expect(result.dateRange?.startStr).toBe("2025-01-01");
      // Kronolojik sıralama: 00:00 önce gelmeli
      expect(result.rows[0].timestamp.getUTCHours()).toBe(0);
      expect(result.rows[0].forecastMwh).toBe(30);
      expect(result.rows[0].actualMwh).toBe(25);
      expect(result.rows[0].imbalanceMwh).toBe(-5);

      expect(result.rows[1].timestamp.getUTCHours()).toBe(1);
      expect(result.rows[1].imbalanceMwh).toBe(5);
    });

    it("ExcelJS ile üretilen .xlsx dosyasını başarıyla ayrıştırmalıdır", async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Üretim Verisi");

      sheet.addRow(["Tarih", "Saat", "KGÜP (MWh)", "Gerçekleşen (MWh)", "Santral"]);
      sheet.addRow(["2025-05-10", "10:00", 35.5, 32.0, "Ege RES"]);
      sheet.addRow(["2025-05-10", "11:00", 40.0, 44.5, "Ege RES"]);

      const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
      const result = await parseGenerationFile(buffer, "uretim.xlsx");

      expect(result.validRowsCount).toBe(2);
      expect(result.detectedPlants).toContain("Ege RES");
      expect(result.rows[0].forecastMwh).toBe(35.5);
      expect(result.rows[0].actualMwh).toBe(32.0);
      expect(result.rows[0].imbalanceMwh).toBe(-3.5);
    });

    it("Her sayfası ayrı santral olan çok sayfalı Excel dosyasını sayfa adlarıyla ayrıştırmalıdır", async () => {
      const workbook = new ExcelJS.Workbook();
      for (const [name, f, a] of [["RES_1", 3, 14.68], ["HES_1", 3.1, 3.81]] as const) {
        const sheet = workbook.addWorksheet(name);
        sheet.addRow(["Tarih", "Saat", "Gün Öncesi Üretim Tahmini (MWh)", "Gerçekleşen Üretim  (MWh)"]);
        sheet.addRow([new Date(Date.UTC(2025, 0, 1)), 0, f, a]);
        sheet.addRow([new Date(Date.UTC(2025, 0, 1)), 1, f + 1, a + 1]);
      }

      const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
      const result = await parseGenerationFile(buffer, "portfoy.xlsx");

      expect(result.validRowsCount).toBe(4);
      expect(result.detectedPlants).toEqual(["RES_1", "HES_1"]);
      const res1 = result.rows.filter((r) => r.plantName === "RES_1");
      expect(res1[0].forecastMwh).toBe(3);
      expect(res1[0].actualMwh).toBe(14.68);
    });

    it("Sonucu önbellekte olmayan saat formüllerini önceki satırdan türetmelidir", async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("RES_1");
      sheet.addRow(["Tarih", "Saat", "Tahmin", "Gerçekleşen"]);
      const d1 = new Date(Date.UTC(2025, 0, 1));
      const d2 = new Date(Date.UTC(2025, 0, 2));
      sheet.addRow([d1, 22, 1, 1]);
      sheet.addRow([d1, 23, 1, 1]);
      // Yeni günün ilk saati: hesaplanmamış formül (=B2), ardından yine sonucu olmayan paylaşımlı formül
      sheet.addRow([d2, { formula: "B2" }, 1, 1]);
      sheet.addRow([d2, { formula: "B3" }, 1, 1]);
      sheet.addRow([d2, 2, 1, 1]);

      const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
      const result = await parseGenerationFile(buffer, "formul.xlsx");

      expect(result.rows.map((r) => r.timestamp.toISOString())).toEqual([
        "2025-01-01T22:00:00.000Z",
        "2025-01-01T23:00:00.000Z",
        "2025-01-02T00:00:00.000Z",
        "2025-01-02T01:00:00.000Z",
        "2025-01-02T02:00:00.000Z",
      ]);
      expect(result.warnings.some((w) => w.includes("türetildi"))).toBe(true);
    });

    it("1-24 formatındaki dosyada 1. saati 00:00, 24. saati 23:00 olarak eşlemelidir", async () => {
      const lines = ["Tarih;Saat;KGÜP;Gerçekleşen"];
      for (let h = 1; h <= 24; h++) lines.push(`01.01.2025;${h};${h};${h}`);

      const result = await parseGenerationFile(Buffer.from(lines.join("\n"), "utf-8"), "saat.csv");

      expect(result.validRowsCount).toBe(24);
      expect(result.rows[0].timestamp.getUTCHours()).toBe(0);
      expect(result.rows[0].forecastMwh).toBe(1);
      expect(result.rows[23].timestamp.getUTCHours()).toBe(23);
      expect(result.rows[23].forecastMwh).toBe(24);
      expect(new Set(result.rows.map((r) => r.timestamp.getTime())).size).toBe(24);
    });

    it("detectOneBasedHours yalnızca 24 içeren ve 0 içermeyen saat kümelerinde true dönmelidir", () => {
      expect(detectOneBasedHours([1, 2, 24])).toBe(true);
      expect(detectOneBasedHours([0, 1, 23])).toBe(false);
      expect(detectOneBasedHours([1, 2, 23])).toBe(false);
      expect(detectOneBasedHours(["00:00", "24:00"])).toBe(false);
    });

    it("Negatif MWh değerlerini güvenli şekilde 0'a çekip uyarı eklemelidir", async () => {
      const csv = `Tarih,Saat,Tahmin,Gerçekleşen
2025-01-01,00:00,-10,50`;

      const buffer = Buffer.from(csv, "utf-8");
      const result = await parseGenerationFile(buffer, "test.csv");

      expect(result.validRowsCount).toBe(1);
      expect(result.rows[0].forecastMwh).toBe(0); // -10 -> 0
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  it("Tahmin sütunu hem resmi KGÜP hem eski KGÖP yazımıyla tanınır", () => {
    for (const header of ["KGÜP (MWh)", "KGÖP (MWh)", "kgup"]) {
      const { missingRequired } = detectColumnMapping(["Tarih", header, "Gerçekleşen (MWh)"]);
      expect(missingRequired).toEqual([]);
    }
  });
});
