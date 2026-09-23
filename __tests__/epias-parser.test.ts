import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  parsePrice,
  detectMarketColumns,
  parseMarketGrid,
  parseMarketFile,
  mergeMarketRows,
  normalizeSystemDirection,
} from "@/lib/parsers/epias-parser";

describe("EPİAŞ Piyasa Verisi Ayrıştırıcı (epias-parser)", () => {
  describe("parsePrice", () => {
    it("Türkçe fiyat biçimlerini çözmelidir", () => {
      expect(parsePrice("3.400,00")).toBe(3400);
      expect(parsePrice("2450,5")).toBe(2450.5);
      expect(parsePrice(1799.98)).toBe(1799.98);
      expect(parsePrice("2.450,50 TL")).toBe(2450.5);
    });

    it("Yalnızca binlik ayraçlı fiyatı ('1.250') 1250 olarak okumalıdır", () => {
      expect(parsePrice("1.250")).toBe(1250);
      expect(parsePrice("12.345.678")).toBe(12345678);
      expect(parsePrice("1.25")).toBe(1.25);
    });

    it("Boş veya geçersiz değerde null dönmelidir (0 değil)", () => {
      expect(parsePrice("")).toBeNull();
      expect(parsePrice(null)).toBeNull();
      expect(parsePrice("-")).toBeNull();
    });
  });

  describe("detectMarketColumns", () => {
    it("PTF raporunda USD/EUR sütunlarını değil TL sütununu seçmelidir", () => {
      const m = detectMarketColumns(["Tarih", "Saat", "PTF (USD/MWh)", "PTF (TL/MWh)", "PTF (EUR/MWh)"]);
      expect(m.date).toBe(0);
      expect(m.hour).toBe(1);
      expect(m.ptf).toBe(3);
    });

    it("Tüm alanları tek tabloda tanımalı ve bir sütunu iki alana eşlememelidir", () => {
      const m = detectMarketColumns([
        "Tarih",
        "Saat",
        "PTF (TL/MWh)",
        "Sistem Marjinal Fiyatı (TL/MWh)",
        "Sistem Yönü",
        "GİP AÖF (TL/MWh)",
      ]);
      expect(m).toEqual({ date: 0, hour: 1, ptf: 2, smf: 3, systemDirection: 4, gipPrice: 5 });
    });

    it("GİP raporundaki 'Ağırlıklı Ortalama Fiyat' başlığını tanımalıdır", () => {
      const m = detectMarketColumns(["Tarih", "Ağırlıklı Ortalama Fiyat (TL/MWh)", "İşlem Hacmi (MWh)"]);
      expect(m.gipPrice).toBe(1);
    });
  });

  describe("normalizeSystemDirection", () => {
    it("'Enerji Açığı' metnini açık olarak tanımalıdır", () => {
      expect(normalizeSystemDirection("Enerji Açığı")).toBe("DEFICIT");
      expect(normalizeSystemDirection("ENERJİ AÇIĞI")).toBe("DEFICIT");
      expect(normalizeSystemDirection("Enerji Fazlası")).toBe("SURPLUS");
    });
  });

  describe("parseMarketGrid", () => {
    it("Rapor üstündeki açıklama satırlarını atlayıp başlık satırını bulmalıdır", () => {
      const grid = [
        ["Piyasa Takas Fiyatı (PTF) Raporu"],
        ["Oluşturulma: 23.09.2026"],
        [],
        ["Tarih", "Saat", "PTF (TL/MWh)"],
        ["01.01.2025", "00:00", "2.494,00"],
        ["01.01.2025", "01:00", "1.799,98"],
        ["Toplam", null, "4.293,98"],
      ];
      const r = parseMarketGrid(grid);
      expect(r.columnsFound).toEqual(["ptf"]);
      expect(r.rows).toHaveLength(2);
      expect(r.rows[0].timestamp.toISOString()).toBe("2025-01-01T00:00:00.000Z");
      expect(r.rows[0].ptf).toBe(2494);
      expect(r.rows[1].ptf).toBe(1799.98);
    });

    it("'+03:00' ekli ISO zamanları kaydırmadan Türkiye duvar saati olarak okumalıdır", () => {
      const r = parseMarketGrid([
        ["Tarih", "SMF (TL/MWh)"],
        ["2025-01-01T00:00:00+03:00", 1847],
        ["2025-06-15T14:00:00+03:00", 3400],
      ]);
      expect(r.rows[0].timestamp.toISOString()).toBe("2025-01-01T00:00:00.000Z");
      expect(r.rows[1].timestamp.getUTCHours()).toBe(14);
    });

    it("Tarih ve saati birleşik 'DD.MM.YYYY HH:mm' sütunundan okumalıdır", () => {
      const r = parseMarketGrid([
        ["Tarih", "Sistem Yönü"],
        ["01.01.2025 23:00", "Enerji Açığı"],
      ]);
      expect(r.rows[0].timestamp.toISOString()).toBe("2025-01-01T23:00:00.000Z");
      expect(r.rows[0].systemDirection).toBe("DEFICIT");
    });

    it("1-24 saat formatında 1. saati 00:00 olarak eşlemelidir", () => {
      const grid: any[][] = [["Tarih", "Saat", "PTF"]];
      for (let h = 1; h <= 24; h++) grid.push(["01.01.2025", h, 2000 + h]);
      const r = parseMarketGrid(grid);
      expect(r.rows[0].timestamp.getUTCHours()).toBe(0);
      expect(r.rows[0].ptf).toBe(2001);
      expect(r.rows[23].timestamp.getUTCHours()).toBe(23);
    });

    it("Boş fiyat hücresini 0 yerine eksik (undefined) bırakmalıdır", () => {
      const r = parseMarketGrid([
        ["Tarih", "Saat", "PTF"],
        ["01.01.2025", 0, ""],
      ]);
      expect(r.rows[0].ptf).toBeUndefined();
    });

    it("Tablo bulunamazsa açıklayıcı hata vermelidir", () => {
      expect(() => parseMarketGrid([["Başlık"], ["a", "b"]])).toThrow(/Piyasa verisi tablosu bulunamadı/);
    });
  });

  describe("mergeMarketRows", () => {
    it("Ayrı PTF, SMF, Yön ve GİP dosyalarını saat bazında birleştirmelidir", () => {
      const t0 = new Date("2025-01-01T00:00:00.000Z");
      const t1 = new Date("2025-01-01T01:00:00.000Z");
      const { complete, incompleteHours } = mergeMarketRows([
        [{ timestamp: t0, ptf: 2494 }, { timestamp: t1, ptf: 1800 }],
        [{ timestamp: t0, smf: 2600 }, { timestamp: t1, smf: 1700 }],
        [{ timestamp: t0, systemDirection: "SURPLUS" }],
        [{ timestamp: t0, gipPrice: 2550 }],
      ]);

      expect(incompleteHours).toHaveLength(0);
      expect(complete).toHaveLength(2);
      // Dosyadaki yön, SMF > PTF kıyaslamasından önceliklidir
      expect(complete[0]).toEqual({
        timestamp: t0,
        ptf: 2494,
        smf: 2600,
        systemDirection: "SURPLUS",
        gipPrice: 2550,
      });
      // Yön dosyası yoksa SMF < PTF -> fazla; GİP yoksa null
      expect(complete[1].systemDirection).toBe("SURPLUS");
      expect(complete[1].gipPrice).toBeNull();
    });

    it("PTF veya SMF'si eksik saatleri yazılacaklar listesine almamalıdır", () => {
      const t0 = new Date("2025-01-01T00:00:00.000Z");
      const { complete, incompleteHours } = mergeMarketRows([[{ timestamp: t0, ptf: 2494 }]]);
      expect(complete).toHaveLength(0);
      expect(incompleteHours).toEqual([t0]);
    });
  });

  describe("parseMarketFile", () => {
    it("Excel dosyasındaki tabloyu ayrıştırmalıdır", async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("PTF");
      sheet.addRow(["PTF Raporu"]);
      sheet.addRow(["Tarih", "Saat", "PTF (TL/MWh)", "PTF (USD/MWh)"]);
      sheet.addRow([new Date(Date.UTC(2025, 0, 1)), 0, 2494, 70.5]);
      sheet.addRow([new Date(Date.UTC(2025, 0, 1)), 1, 1799.98, 50.9]);

      const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
      const r = await parseMarketFile(buffer, "ptf.xlsx");

      expect(r.columnsFound).toEqual(["ptf"]);
      expect(r.rows.map((x) => [x.timestamp.toISOString(), x.ptf])).toEqual([
        ["2025-01-01T00:00:00.000Z", 2494],
        ["2025-01-01T01:00:00.000Z", 1799.98],
      ]);
    });

    it("Noktalı virgüllü CSV dosyasını ayrıştırmalıdır", async () => {
      const csv = "Tarih;Saat;SMF (TL/MWh)\n01.01.2025;00:00;1.847,00\n01.01.2025;01:00;2.210,01";
      const r = await parseMarketFile(Buffer.from(csv, "utf-8"), "smf.csv");
      expect(r.rows.map((x) => x.smf)).toEqual([1847, 2210.01]);
    });
  });
});
