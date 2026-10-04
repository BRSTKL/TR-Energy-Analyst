/**
 * TR-Energy Analyst Excel Export Modülü (ExcelJS)
 *
 * KRİTİK KURAL:
 * Hesaplanan sütunlar (dengesizlik MWh, pozitif/negatif dengesizlik fiyatı,
 * dengesizlik tutarı, GÖP tutarı, toplam gelir, birim gelir, fiktif gelir,
 * dengesizlik maliyeti, birim maliyet) SABİT DEĞER OLARAK DEĞİL,
 * worksheet.getCell().value = { formula: '...' } şeklinde
 * GERÇEK DİNAMİK EXCEL FORMÜLÜ OLARAK YAZILIR.
 *
 * Aylık Özet sayfası ise 'Saatlik Veriler' sayfasına referans veren
 * SUMIFS formülleri ile dinamik toplanır.
 */

import ExcelJS from "exceljs";
import { PassThrough } from "node:stream";
import {
  DEFAULT_IMBALANCE_PROFILE,
  ImbalancePricingProfile,
  OfficialImbalancePrices,
  resolveImbalanceProfile,
  toPricingProfile,
} from "@/lib/calculations/types";
import { imbalancePrices } from "@/lib/calculations/engine";

export interface HourlyExportRow extends OfficialImbalancePrices {
  timestamp: Date | string;
  yearMonth: string; // YYYY-MM
  hourStr: string;   // 09:00
  plantName: string;
  plantType: string;
  forecastMwh: number;
  actualMwh: number;
  ptf: number;
  smf: number;
  systemDirection: "DEFICIT" | "SURPLUS" | "BALANCED";
}

export interface ExcelExportProjectData {
  projectName: string;
  pricingProfile?: ImbalancePricingProfile;
  hourlyRecords: HourlyExportRow[];
  uniqueMonths: string[]; // ["2026-01", "2026-02", "2026-03"]
  uniquePlants: Array<{ plantName: string; plantType: string }>;
  /** Uzlaştırma birimi bazında netleşmiş dengesizlik maliyeti (₺); verilirse "Açıklama" sayfasına yazılır */
  settledCostTl?: number | null;
  /** Uzlaştırma biriminin tanımı (ör. "Atam Toplayıcı portföyü", "şirket bazında") */
  settlementLabel?: string;
}

export function normalizeExcelProjectData(
  input: ExcelExportProjectData | any
): ExcelExportProjectData {
  if (Array.isArray(input.hourlyRecords)) {
    return input as ExcelExportProjectData;
  }

  const hourlyRecords: HourlyExportRow[] = [];
  const monthsSet = new Set<string>();
  const plantsMap = new Map<string, { plantName: string; plantType: string }>();

  const plants = input.plants || [];
  for (const plant of plants) {
    plantsMap.set(plant.name, {
      plantName: plant.name,
      plantType: plant.type,
    });

    const records = plant.records || [];
    for (const record of records) {
      if (!record.marketData) continue;

      const date = new Date(record.timestamp);
      const yearMonth = date.toISOString().substring(0, 7);
      const hourStr = `${String(date.getUTCHours()).padStart(2, "0")}:00`;

      monthsSet.add(yearMonth);

      hourlyRecords.push({
        timestamp: record.timestamp,
        yearMonth,
        hourStr,
        plantName: plant.name,
        plantType: plant.type,
        forecastMwh: record.forecastMwh,
        actualMwh: record.actualMwh,
        ptf: record.marketData.ptf,
        smf: record.marketData.smf,
        systemDirection: record.marketData.systemDirection,
      });
    }
  }

  hourlyRecords.sort((a, b) => {
    const timeDiff =
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.plantName.localeCompare(b.plantName);
  });

  // Veritabanı satırı da gelebilir: mod alanını normalize et (eksikse mevzuat modu)
  const pricingProfile = toPricingProfile(
    input.pricingProfile ||
      (Array.isArray(input.pricingProfiles) ? input.pricingProfiles[0] : undefined)
  );

  return {
    projectName: input.name || input.projectName || "Enerji Portföyü",
    pricingProfile,
    hourlyRecords,
    uniqueMonths: Array.from(monthsSet).sort(),
    uniquePlants: Array.from(plantsMap.values()),
  };
}

export async function exportToExcel(
  projectOrData: ExcelExportProjectData | any,
  customProfile?: ImbalancePricingProfile
): Promise<ExcelJS.Buffer> {
  const data = normalizeExcelProjectData(projectOrData);
  const profile = customProfile || data.pricingProfile || DEFAULT_IMBALANCE_PROFILE;
  // Akışlı yazıcı: satırlar tamamlandıkça dosyaya yazılır. Bellekteki çalışma kitabının writeBuffer'ı 61 santralde
  // (354 bin satır × 20 hücre) ~95 sn sürüyordu; sayfaların kurulması 2,5 sn.
  const chunks: Buffer[] = [];
  const stream = new PassThrough();
  stream.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: true, zip: { zlib: { level: 6 } } } as unknown as ExcelJS.stream.xlsx.WorkbookStreamWriterOptions);
  workbook.creator = "TR-Energy Analyst";
  workbook.lastModifiedBy = "TR-Energy Analyst";
  workbook.created = new Date();
  workbook.modified = new Date();

  // -------------------------------------------------------------
  // SAYFA 1: SAATLİK VERİLER
  // -------------------------------------------------------------
  const hourlySheet = workbook.addWorksheet("Saatlik Veriler", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  hourlySheet.columns = [
    { header: "Tarih", key: "date", width: 14 }, // A (1)
    { header: "Dönem", key: "period", width: 12 }, // B (2)
    { header: "Saat", key: "hour", width: 10 }, // C (3)
    { header: "Santral", key: "plant", width: 20 }, // D (4)
    { header: "Tür", key: "type", width: 10 }, // E (5)
    { header: "Tahmin (KGÜP) [MWh]", key: "forecast", width: 22 }, // F (6)
    { header: "Gerçekleşen [MWh]", key: "actual", width: 20 }, // G (7)
    { header: "PTF [₺/MWh]", key: "ptf", width: 16 }, // H (8)
    { header: "SMF [₺/MWh]", key: "smf", width: 16 }, // I (9)
    { header: "Sistem Yönü", key: "direction", width: 16 }, // J (10)
    // TÜRETİLMİŞ / HESAPLANAN SÜTUNLAR (GERÇEK EXCEL FORMÜLÜ)
    { header: "Dengesizlik [MWh]", key: "imbalanceMwh", width: 20 }, // K (11)
    { header: "Pozitif Fiyat [₺/MWh]", key: "posPrice", width: 22 }, // L (12)
    { header: "Negatif Fiyat [₺/MWh]", key: "negPrice", width: 22 }, // M (13)
    { header: "Dengesizlik Tutarı [₺]", key: "imbalanceAmount", width: 22 }, // N (14)
    { header: "GÖP Satış Tutarı [₺]", key: "dayAheadSales", width: 22 }, // O (15)
    { header: "Toplam Gelir [₺]", key: "totalRevenue", width: 20 }, // P (16)
    { header: "Birim Gelir [₺/MWh]", key: "unitRevenue", width: 20 }, // Q (17)
    { header: "Tam Tahmin Geliri [₺]", key: "fictiveRevenue", width: 20 }, // R (18)
    { header: "Dengesizlik Maliyeti [₺]", key: "imbalanceCost", width: 24 }, // S (19)
    { header: "Birim Maliyet [₺/MWh]", key: "unitImbalanceCost", width: 22 }, // T (20)
  ];

  // Başlık Satırı Stili
  const headerRow = hourlySheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    // Statik sütunlar lacivert, formüllü sütunlar koyu teal
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colNumber <= 10 ? "FF1E293B" : "FF0F766E" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "medium" },
      right: { style: "thin" },
    };
  });

  // Sayı biçimi ve hizalama sütun başına bir kez (satır başına 14 hücre biçimi 61 santralde 5 milyon stil nesnesi
  // demekti ve dışa aktarmayı dakikalara çıkarıyordu); satırlar sütunun biçimini devralır
  for (const c of [6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) hourlySheet.getColumn(c).numFmt = "#,##0.00";
  hourlySheet.properties.defaultRowHeight = 20;

  // Saatlik Veri Satırlarını Doldur
  data.hourlyRecords.forEach((record, index) => {
    const rowNum = index + 2; // 1-index + header
    const row = hourlySheet.getRow(rowNum);
    // Mevzuat modunda her satır kendi tarihinin katsayılarıyla yazılır (2026 öncesi sabit %3)
    const rowProfile = resolveImbalanceProfile(profile, record.timestamp);

    const dateStr =
      typeof record.timestamp === "string"
        ? record.timestamp.substring(0, 10)
        : new Date(record.timestamp).toISOString().substring(0, 10);

    // 1-10: Statik Girdiler
    row.getCell(1).value = dateStr; // A: Tarih
    row.getCell(2).value = record.yearMonth; // B: Dönem
    row.getCell(3).value = record.hourStr; // C: Saat
    row.getCell(4).value = record.plantName; // D: Santral
    row.getCell(5).value = record.plantType; // E: Tür
    row.getCell(6).value = record.forecastMwh; // F: Tahmin [MWh]
    row.getCell(7).value = record.actualMwh; // G: Gerçekleşen [MWh]
    row.getCell(8).value = record.ptf; // H: PTF [₺/MWh]
    row.getCell(9).value = record.smf; // I: SMF [₺/MWh]
    row.getCell(10).value = record.systemDirection; // J: Sistem Yönü

    // 11-20: GERÇEK DİNAMİK EXCEL FORMÜLLERİ
    // K: Dengesizlik [MWh] = Gerçekleşen - Tahmin
    row.getCell(11).value = { formula: `G${rowNum}-F${rowNum}` };

    // L / M: Pozitif ve negatif dengesizlik fiyatı [₺/MWh]. Uygulamanın fiyatı (EPİAŞ resmi fiyatı ya da 2026 taban
    // kuralları dahil mevzuat formülü) basit MIN/MAX formülüyle aynıysa şeffaflık için formül, değilse değer yazılır
    // (2026: 15 dakikalık SMF, taban ve negatif fiyat kuralları hücre formülüyle ifade edilemez).
    const engine = imbalancePrices(record, rowProfile);
    const simplePos = Math.min(record.ptf, record.smf) * (record.systemDirection === "SURPLUS" ? rowProfile.positiveSurplusCoef : rowProfile.positiveOtherCoef);
    const simpleNeg = Math.max(record.ptf, record.smf) * (record.systemDirection === "DEFICIT" ? rowProfile.negativeDeficitCoef : rowProfile.negativeOtherCoef);
    row.getCell(12).value =
      Math.abs(engine.positive - simplePos) < 0.005
        ? {
            formula: `IF(J${rowNum}="SURPLUS", MIN(H${rowNum},I${rowNum})*${rowProfile.positiveSurplusCoef}, MIN(H${rowNum},I${rowNum})*${rowProfile.positiveOtherCoef})`,
          }
        : Number(engine.positive.toFixed(4));
    row.getCell(13).value =
      Math.abs(engine.negative - simpleNeg) < 0.005
        ? {
            formula: `IF(J${rowNum}="DEFICIT", MAX(H${rowNum},I${rowNum})*${rowProfile.negativeDeficitCoef}, MAX(H${rowNum},I${rowNum})*${rowProfile.negativeOtherCoef})`,
          }
        : Number(engine.negative.toFixed(4));

    // N: Dengesizlik Tutarı [₺] = IF(Dengesizlik>0, Dengesizlik*PozitifFiyat, IF(Dengesizlik<0, Dengesizlik*NegatifFiyat, 0))
    row.getCell(14).value = {
      formula: `IF(K${rowNum}>0, K${rowNum}*L${rowNum}, IF(K${rowNum}<0, K${rowNum}*M${rowNum}, 0))`,
    };

    // O: GÖP Satış Tutarı [₺] = Tahmin * PTF
    row.getCell(15).value = { formula: `F${rowNum}*H${rowNum}` };

    // P: Toplam Gelir [₺] = GÖP Satış Tutarı + Dengesizlik Tutarı
    row.getCell(16).value = { formula: `O${rowNum}+N${rowNum}` };

    // Q: Birim Gelir [₺/MWh] = IF(Gerçekleşen=0, 0, ToplamGelir/Gerçekleşen)
    row.getCell(17).value = {
      formula: `IF(G${rowNum}=0, 0, P${rowNum}/G${rowNum})`,
    };

    // R: Fiktif Gelir [₺] = Gerçekleşen * PTF
    row.getCell(18).value = { formula: `G${rowNum}*H${rowNum}` };

    // S: Dengesizlik Maliyeti [₺] = Fiktif Gelir - Toplam Gelir
    row.getCell(19).value = { formula: `R${rowNum}-P${rowNum}` };

    // T: Birim Dengesizlik Maliyeti [₺/MWh] = IF(Gerçekleşen=0, 0, DengesizlikMaliyeti/Gerçekleşen)
    row.getCell(20).value = {
      formula: `IF(G${rowNum}=0, 0, S${rowNum}/G${rowNum})`,
    };
    row.commit();
  });
  hourlySheet.commit();

  // -------------------------------------------------------------
  // SAYFA 2: AYLIK ÖZET (SUMIFS TABANLI DİNAMİK PİVOT)
  // -------------------------------------------------------------
  const summarySheet = workbook.addWorksheet("Aylık Özet", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  summarySheet.columns = [
    { header: "Dönem", key: "period", width: 14 }, // A (1)
    { header: "Santral", key: "plant", width: 22 }, // B (2)
    { header: "Tür", key: "type", width: 12 }, // C (3)
    { header: "Toplam Üretim [MWh]", key: "totalActual", width: 24 }, // D (4)
    { header: "Toplam GÖP Satışı [₺]", key: "totalGop", width: 24 }, // E (5)
    { header: "Toplam Dengesizlik Tutarı [₺]", key: "totalImbalanceAmount", width: 28 }, // F (6)
    { header: "Toplam Gelir [₺]", key: "totalRevenue", width: 22 }, // G (7)
    { header: "Birim Gelir [₺/MWh]", key: "unitRevenue", width: 22 }, // H (8)
    { header: "Toplam Dengesizlik Maliyeti [₺]", key: "totalCost", width: 28 }, // I (9)
    { header: "Birim Dengesizlik Maliyeti [₺/MWh]", key: "unitCost", width: 28 }, // J (10)
  ];

  // Özet Başlık Stili
  const summaryHeaderRow = summarySheet.getRow(1);
  summaryHeaderRow.height = 28;
  summaryHeaderRow.eachCell((cell: ExcelJS.Cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" }, // Koyu Mavi
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "medium" },
      right: { style: "thin" },
    };
  });

  // Her santral ve her ay için SUMIFS formüllü satır ekle
  let summaryRowIndex = 2;

  data.uniquePlants.forEach((plant) => {
    data.uniqueMonths.forEach((month) => {
      const row = summarySheet.getRow(summaryRowIndex);

      row.getCell(1).value = month; // A: Dönem (YYYY-MM)
      row.getCell(2).value = plant.plantName; // B: Santral
      row.getCell(3).value = plant.plantType; // C: Tür

      // D: Toplam Üretim [MWh] = SUMIFS('Saatlik Veriler'!G:G, 'Saatlik Veriler'!D:D, B_row, 'Saatlik Veriler'!B:B, A_row)
      row.getCell(4).value = {
        formula: `SUMIFS('Saatlik Veriler'!G:G, 'Saatlik Veriler'!D:D, B${summaryRowIndex}, 'Saatlik Veriler'!B:B, A${summaryRowIndex})`,
      };

      // E: Toplam GÖP Satışı [₺] = SUMIFS('Saatlik Veriler'!O:O, 'Saatlik Veriler'!D:D, B_row, 'Saatlik Veriler'!B:B, A_row)
      row.getCell(5).value = {
        formula: `SUMIFS('Saatlik Veriler'!O:O, 'Saatlik Veriler'!D:D, B${summaryRowIndex}, 'Saatlik Veriler'!B:B, A${summaryRowIndex})`,
      };

      // F: Toplam Dengesizlik Tutarı [₺] = SUMIFS('Saatlik Veriler'!N:N, 'Saatlik Veriler'!D:D, B_row, 'Saatlik Veriler'!B:B, A_row)
      row.getCell(6).value = {
        formula: `SUMIFS('Saatlik Veriler'!N:N, 'Saatlik Veriler'!D:D, B${summaryRowIndex}, 'Saatlik Veriler'!B:B, A${summaryRowIndex})`,
      };

      // G: Toplam Gelir [₺] = SUMIFS('Saatlik Veriler'!P:P, 'Saatlik Veriler'!D:D, B_row, 'Saatlik Veriler'!B:B, A_row)
      row.getCell(7).value = {
        formula: `SUMIFS('Saatlik Veriler'!P:P, 'Saatlik Veriler'!D:D, B${summaryRowIndex}, 'Saatlik Veriler'!B:B, A${summaryRowIndex})`,
      };

      // H: Birim Gelir [₺/MWh] (Ağırlıklı) = IF(D_row=0, 0, G_row/D_row)
      row.getCell(8).value = {
        formula: `IF(D${summaryRowIndex}=0, 0, G${summaryRowIndex}/D${summaryRowIndex})`,
      };

      // I: Toplam Dengesizlik Maliyeti [₺] = SUMIFS('Saatlik Veriler'!S:S, 'Saatlik Veriler'!D:D, B_row, 'Saatlik Veriler'!B:B, A_row)
      row.getCell(9).value = {
        formula: `SUMIFS('Saatlik Veriler'!S:S, 'Saatlik Veriler'!D:D, B${summaryRowIndex}, 'Saatlik Veriler'!B:B, A${summaryRowIndex})`,
      };

      // J: Birim Dengesizlik Maliyeti [₺/MWh] (Ağırlıklı) = IF(D_row=0, 0, I_row/D_row)
      row.getCell(10).value = {
        formula: `IF(D${summaryRowIndex}=0, 0, I${summaryRowIndex}/D${summaryRowIndex})`,
      };

      // Sayı Formatları
      row.getCell(4).numFmt = "#,##0.00";
      row.getCell(5).numFmt = "#,##0.00";
      row.getCell(6).numFmt = "#,##0.00";
      row.getCell(7).numFmt = "#,##0.00";
      row.getCell(8).numFmt = "#,##0.00";
      row.getCell(9).numFmt = "#,##0.00";
      row.getCell(10).numFmt = "#,##0.00";

      row.height = 20;
      row.alignment = { vertical: "middle" };
      row.commit();

      summaryRowIndex++;
    });
  });
  summarySheet.commit();

  // SAYFA 3: AÇIKLAMA - bu dosyadaki maliyet santral bazındadır, uygulamadaki başlık rakamı netleşmiştir
  const noteSheet = workbook.addWorksheet("Açıklama");
  noteSheet.columns = [{ width: 110 }];
  const trNum = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
  const notes = [
    "Bu dosyadaki dengesizlik maliyeti SANTRAL BAZINDADIR: her santral kendi başına uzlaştırılmış sayılır, santraller arası netleşme yoktur.",
    "Uygulamadaki sonuç sayfası, rapor ve karşılaştırma ise dengesizliği uzlaştırma birimi (şirket ya da toplayıcı portföyü) bazında saat saat netleştirir; bu yüzden başlık rakamı bu dosyadaki toplamdan küçüktür.",
    "KÜPST (sapma bedeli) bu dosyada yoktur.",
  ];
  if (data.settledCostTl != null) {
    const plantTotal = data.hourlyRecords.reduce((sum, r) => {
      const e = imbalancePrices(r, resolveImbalanceProfile(profile, r.timestamp));
      const d = r.actualMwh - r.forecastMwh;
      return sum + d * (r.ptf - (d > 0 ? e.positive : e.negative));
    }, 0);
    notes.push(
      `Santral bazında toplam: ${trNum(plantTotal)} ₺ · ${data.settlementLabel ?? "Uzlaştırma biriminde"} netleşmiş toplam: ${trNum(data.settledCostTl)} ₺ (uygulamadaki başlık rakamı).`
    );
  }
  for (const n of notes) {
    const r = noteSheet.addRow([n]);
    r.alignment = { wrapText: true, vertical: "top" };
    r.commit();
  }
  noteSheet.commit();

  await workbook.commit();
  await finished;
  return Buffer.concat(chunks) as unknown as ExcelJS.Buffer;
}
