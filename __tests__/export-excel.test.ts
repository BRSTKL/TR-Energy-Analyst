import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportToExcel, ExcelExportProjectData } from "../lib/export/excel";

describe("Excel Export Modülü (ExcelJS)", () => {
  const mockData: ExcelExportProjectData = {
    projectName: "Test Portföy Projesi",
    uniqueMonths: ["2026-01", "2026-02"],
    uniquePlants: [
      { plantName: "Karaburun RES", plantType: "RES" },
      { plantName: "Toroslar GES", plantType: "GES" },
    ],
    hourlyRecords: [
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        yearMonth: "2026-01",
        hourStr: "00:00",
        plantName: "Karaburun RES",
        plantType: "RES",
        forecastMwh: 45.0,
        actualMwh: 42.5,
        ptf: 2350.0,
        smf: 2500.0,
        systemDirection: "DEFICIT",
      },
      {
        timestamp: "2026-01-01T01:00:00.000Z",
        yearMonth: "2026-01",
        hourStr: "01:00",
        plantName: "Karaburun RES",
        plantType: "RES",
        forecastMwh: 40.0,
        actualMwh: 48.0,
        ptf: 2200.0,
        smf: 1950.0,
        systemDirection: "SURPLUS",
      },
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        yearMonth: "2026-01",
        hourStr: "00:00",
        plantName: "Toroslar GES",
        plantType: "GES",
        forecastMwh: 0.0,
        actualMwh: 0.0,
        ptf: 2350.0,
        smf: 2500.0,
        systemDirection: "DEFICIT",
      },
    ],
  };

  it("Excel çalışma kitabını başarıyla üretmeli ve iki ana sayfa içermelidir", async () => {
    const buffer = await exportToExcel(mockData);
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(1000);

    // Üretilen buffer'ı yeni bir ExcelJS Workbook'una geri yükle
    const workbook = new ExcelJS.Workbook();
    // ExcelJS writeBuffer returns ArrayBuffer / Buffer, load accepts Buffer or ArrayBuffer
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.length).toBe(2);
    expect(workbook.getWorksheet("Saatlik Veriler")).toBeDefined();
    expect(workbook.getWorksheet("Aylık Özet")).toBeDefined();
  });

  it("KRİTİK KURAL: Saatlik Veriler sayfasındaki hesaplanan sütunlar statik sayı DEĞİL, GERÇEK DİNAMİK EXCEL FORMÜLÜ olmalıdır", async () => {
    const buffer = await exportToExcel(mockData);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet("Saatlik Veriler")!;
    expect(sheet).toBeDefined();

    // Satır 2 (İlk veri satırı)
    const row2 = sheet.getRow(2);

    // 1-10: Statik Girdiler Kontrolü
    expect(row2.getCell(1).value).toBe("2026-01-01"); // A: Tarih
    expect(row2.getCell(2).value).toBe("2026-01"); // B: Dönem
    expect(row2.getCell(3).value).toBe("00:00"); // C: Saat
    expect(row2.getCell(4).value).toBe("Karaburun RES"); // D: Santral
    expect(row2.getCell(5).value).toBe("RES"); // E: Tür
    expect(row2.getCell(6).value).toBe(45.0); // F: Tahmin
    expect(row2.getCell(7).value).toBe(42.5); // G: Gerçekleşen
    expect(row2.getCell(8).value).toBe(2350.0); // H: PTF
    expect(row2.getCell(9).value).toBe(2500.0); // I: SMF
    expect(row2.getCell(10).value).toBe("DEFICIT"); // J: Sistem Yönü

    // 11-20: TÜRETİLMİŞ / HESAPLANAN FORMÜL HÜCRELERİ
    // Hiçbiri doğrudan number olmamalı, formula objesi olmalı
    const formulaColumns = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    for (const colIdx of formulaColumns) {
      const cellVal = row2.getCell(colIdx).value;
      expect(typeof cellVal).not.toBe("number");
      expect(cellVal).toBeTypeOf("object");
      expect(cellVal).not.toBeNull();
      expect((cellVal as any).formula).toBeDefined();
      expect(typeof (cellVal as any).formula).toBe("string");
    }

    // Spesifik Formül Doğrulamaları
    // K: Dengesizlik [MWh] = G2 - F2
    const imbalanceCell = row2.getCell(11).value as { formula: string };
    expect(imbalanceCell.formula).toBe("G2-F2");

    // L: Pozitif Fiyat
    const posPriceCell = row2.getCell(12).value as { formula: string };
    expect(posPriceCell.formula).toContain("IF(J2=\"SURPLUS\"");
    expect(posPriceCell.formula).toContain("MIN(H2,I2)");

    // M: Negatif Fiyat
    const negPriceCell = row2.getCell(13).value as { formula: string };
    expect(negPriceCell.formula).toContain("IF(J2=\"DEFICIT\"");
    expect(negPriceCell.formula).toContain("MAX(H2,I2)");

    // N: Dengesizlik Tutarı
    const amountCell = row2.getCell(14).value as { formula: string };
    expect(amountCell.formula).toBe("IF(K2>0, K2*L2, IF(K2<0, K2*M2, 0))");

    // O: GÖP Satış Tutarı = F2 * H2
    const gopCell = row2.getCell(15).value as { formula: string };
    expect(gopCell.formula).toBe("F2*H2");

    // P: Toplam Gelir = O2 + N2
    const revenueCell = row2.getCell(16).value as { formula: string };
    expect(revenueCell.formula).toBe("O2+N2");

    // Q: Birim Gelir = IF(G2=0, 0, P2/G2)
    const unitRevenueCell = row2.getCell(17).value as { formula: string };
    expect(unitRevenueCell.formula).toBe("IF(G2=0, 0, P2/G2)");

    // R: Fiktif Gelir = G2 * H2
    const fictiveCell = row2.getCell(18).value as { formula: string };
    expect(fictiveCell.formula).toBe("G2*H2");

    // S: Dengesizlik Maliyeti = R2 - P2
    const costCell = row2.getCell(19).value as { formula: string };
    expect(costCell.formula).toBe("R2-P2");

    // T: Birim Dengesizlik Maliyeti = IF(G2=0, 0, S2/G2)
    const unitCostCell = row2.getCell(20).value as { formula: string };
    expect(unitCostCell.formula).toBe("IF(G2=0, 0, S2/G2)");
  });

  it("Aylık Özet sayfasında Saatlik Veriler sayfasına referans veren SUMIFS ve ağırlıklı birim formülleri olmalıdır", async () => {
    const buffer = await exportToExcel(mockData);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const summarySheet = workbook.getWorksheet("Aylık Özet")!;
    expect(summarySheet).toBeDefined();

    // Satır 2: Karaburun RES - 2026-01
    const row2 = summarySheet.getRow(2);
    expect(row2.getCell(1).value).toBe("2026-01"); // A: Dönem
    expect(row2.getCell(2).value).toBe("Karaburun RES"); // B: Santral
    expect(row2.getCell(3).value).toBe("RES"); // C: Tür

    // D: Toplam Üretim -> SUMIFS
    const actualCell = row2.getCell(4).value as { formula: string };
    expect(actualCell.formula).toBe(
      "SUMIFS('Saatlik Veriler'!G:G, 'Saatlik Veriler'!D:D, B2, 'Saatlik Veriler'!B:B, A2)"
    );

    // E: Toplam GÖP -> SUMIFS
    const gopCell = row2.getCell(5).value as { formula: string };
    expect(gopCell.formula).toBe(
      "SUMIFS('Saatlik Veriler'!O:O, 'Saatlik Veriler'!D:D, B2, 'Saatlik Veriler'!B:B, A2)"
    );

    // F: Toplam Dengesizlik Tutarı -> SUMIFS
    const amountCell = row2.getCell(6).value as { formula: string };
    expect(amountCell.formula).toBe(
      "SUMIFS('Saatlik Veriler'!N:N, 'Saatlik Veriler'!D:D, B2, 'Saatlik Veriler'!B:B, A2)"
    );

    // G: Toplam Gelir -> SUMIFS
    const revenueCell = row2.getCell(7).value as { formula: string };
    expect(revenueCell.formula).toBe(
      "SUMIFS('Saatlik Veriler'!P:P, 'Saatlik Veriler'!D:D, B2, 'Saatlik Veriler'!B:B, A2)"
    );

    // H: Birim Gelir (Ağırlıklı) = IF(D2=0, 0, G2/D2)
    const unitRevenueCell = row2.getCell(8).value as { formula: string };
    expect(unitRevenueCell.formula).toBe("IF(D2=0, 0, G2/D2)");

    // I: Toplam Dengesizlik Maliyeti -> SUMIFS
    const costCell = row2.getCell(9).value as { formula: string };
    expect(costCell.formula).toBe(
      "SUMIFS('Saatlik Veriler'!S:S, 'Saatlik Veriler'!D:D, B2, 'Saatlik Veriler'!B:B, A2)"
    );

    // J: Birim Dengesizlik Maliyeti (Ağırlıklı) = IF(D2=0, 0, I2/D2)
    const unitCostCell = row2.getCell(10).value as { formula: string };
    expect(unitCostCell.formula).toBe("IF(D2=0, 0, I2/D2)");
  });
});
