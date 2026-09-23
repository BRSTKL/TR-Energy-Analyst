import { describe, it, expect } from "vitest";
import {
  buildSheetPreview,
  detectHeaderRow,
  sheetHeaders,
  SheetGrid,
} from "@/lib/import/workbook-preview";
import { applyPlantMapping, validateMappingSet, PlantImportMapping } from "@/lib/import/column-mapping";
import { suggestMappings, normalizeName, typeNumberKey } from "@/lib/import/suggest-mapping";

const d = (day: number) => new Date(Date.UTC(2025, 0, day));

/** Düzen A: santral başına sayfa (Gain dosyası gibi) */
const layoutA: SheetGrid[] = [
  {
    sheetName: "RES_1",
    grid: [
      ["Tarih", "Saat", "Gün Öncesi Üretim Tahmini (MWh)", "Gerçekleşen Üretim  (MWh)"],
      [d(1), 0, 3, 14.68],
      [d(1), 1, 5.2, 2.89],
      [d(1), 2, 4.9, 5.57],
    ],
  },
  {
    sheetName: "HES_1",
    grid: [
      ["Tarih", "Saat", "Gün Öncesi Üretim Tahmini (MWh)", "Gerçekleşen Üretim  (MWh)"],
      [d(1), 0, 3.1, 3.81],
      [d(1), 1, 4, 3.95],
      [d(1), 2, 4, 0.09],
    ],
  },
];

/** Düzen B: tek sayfada santral başına kolonlar, üstte rapor başlığı */
const layoutB: SheetGrid[] = [
  {
    sheetName: "Portföy",
    grid: [
      ["2025 Portföy Üretim Raporu"],
      [],
      ["Tarih", "Saat", "RES_1 Tahmin", "RES_1 Gerçekleşen", "HES_1 Tahmin", "HES_1 Gerçekleşen"],
      ["01.01.2025", 1, 3000, 14680, 3100, 3810],
      ["01.01.2025", 2, 5200, 2890, 4000, 3950],
    ],
  },
];

const plants = [
  { id: "p-res", name: "RES_1", type: "RES", capacityMw: 47 },
  { id: "p-hes", name: "HES_1", type: "HES", capacityMw: 15 },
];

const mappingA = (overrides: Partial<PlantImportMapping> = {}): PlantImportMapping => ({
  plantId: "p-res",
  sheetName: "RES_1",
  headerRow: 0,
  dateColumn: "Tarih",
  hourColumn: "Saat",
  forecastColumn: "Gün Öncesi Üretim Tahmini (MWh)",
  actualColumn: "Gerçekleşen Üretim (MWh)",
  unit: "MWh",
  hourFormat: "auto",
  ...overrides,
});

describe("Dosya önizleme (workbook-preview)", () => {
  it("Rapor başlığının altındaki gerçek başlık satırını bulmalıdır", () => {
    expect(detectHeaderRow(layoutA[0].grid)).toBe(0);
    expect(detectHeaderRow(layoutB[0].grid)).toBe(2);
  });

  it("Başlıkları boşlukları sadeleştirip benzersiz yapmalıdır", () => {
    expect(sheetHeaders([["A", "", "A", "Gerçekleşen   Üretim"]], 0)).toEqual([
      "A",
      "Kolon 2",
      "A (2)",
      "Gerçekleşen Üretim",
    ]);
  });

  it("Kolon tiplerini ve örnek değerleri çıkarmalıdır", () => {
    const p = buildSheetPreview(layoutA[0]);
    expect(p.rowCount).toBe(3);
    expect(p.columns.map((c) => c.type)).toEqual(["date", "number", "number", "number"]);
    expect(p.columns[0].samples[0]).toBe("2025-01-01");
  });
});

describe("Eşleştirmeyi uygulama (applyPlantMapping)", () => {
  it("Düzen A: seçilen sayfa ve kolonlardan saatlik satırları üretmelidir", () => {
    const r = applyPlantMapping(layoutA, mappingA(), plants[0]);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.stats.rows).toBe(3);
    expect(r.rows[0]).toMatchObject({ forecastMwh: 3, actualMwh: 14.68, plantName: "RES_1" });
    expect(r.rows[0].timestamp.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(r.stats.totalActualMwh).toBeCloseTo(14.68 + 2.89 + 5.57, 10);
  });

  it("Düzen B: aynı sayfadan santral kolonlarını, kWh → MWh ve 1-24 saatle okumalıdır", () => {
    const r = applyPlantMapping(
      layoutB,
      {
        plantId: "p-hes",
        sheetName: "Portföy",
        headerRow: 2,
        dateColumn: "Tarih",
        hourColumn: "Saat",
        forecastColumn: "HES_1 Tahmin",
        actualColumn: "HES_1 Gerçekleşen",
        unit: "kWh",
        hourFormat: "1-24",
      },
      plants[1]
    );
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.rows.map((x) => [x.timestamp.getUTCHours(), x.forecastMwh, x.actualMwh])).toEqual([
      [0, 3.1, 3.81],
      [1, 4, 3.95],
    ]);
  });

  it("Tahmin ve gerçekleşen için aynı kolon seçilirse hata vermelidir", () => {
    const r = applyPlantMapping(
      layoutA,
      mappingA({ actualColumn: "Gün Öncesi Üretim Tahmini (MWh)" }),
      plants[0]
    );
    expect(r.issues[0]).toMatchObject({ level: "error" });
    expect(r.issues[0].message).toContain("aynı kolon");
    expect(r.rows).toHaveLength(0);
  });

  it("Olmayan sayfa veya kolon için açıklayıcı hata vermelidir", () => {
    expect(applyPlantMapping(layoutA, mappingA({ sheetName: "YOK" }), plants[0]).issues[0].message).toContain(
      "sayfası dosyada bulunamadı"
    );
    expect(
      applyPlantMapping(layoutA, mappingA({ forecastColumn: "Başka Kolon" }), plants[0]).issues[0].message
    ).toContain("bulunamadı");
  });

  it("Tekrar eden saatleri hata, kurulu güç aşımını uyarı olarak bildirmelidir", () => {
    const grid: SheetGrid[] = [
      {
        sheetName: "S",
        grid: [
          ["Tarih", "Saat", "Tahmin", "Gerçekleşen"],
          [d(1), 0, 1, 1],
          [d(1), 0, 1, 60],
        ],
      },
    ];
    const r = applyPlantMapping(
      grid,
      mappingA({ sheetName: "S", forecastColumn: "Tahmin", actualColumn: "Gerçekleşen" }),
      { name: "X", capacityMw: 47 }
    );
    expect(r.stats.duplicateHours).toBe(1);
    expect(r.issues.some((i) => i.level === "error" && i.message.includes("birden fazla"))).toBe(true);
    expect(r.issues.some((i) => i.level === "warning" && i.message.includes("kurulu gücü"))).toBe(true);
  });
});

describe("Eşleştirme çakışmaları (validateMappingSet)", () => {
  it("İki santral aynı sayfadaki aynı kolonu kullanamaz", () => {
    const issues = validateMappingSet(
      [mappingA(), mappingA({ plantId: "p-hes" })],
      { "p-res": "RES_1", "p-hes": "HES_1" }
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain("hem RES_1 hem HES_1");
  });
});

describe("Eşleştirme önerileri (suggestMappings)", () => {
  it("Ad normalizasyonu ve teknoloji-numara anahtarı", () => {
    expect(normalizeName("Karaburun RES-1")).toBe("karaburunres1");
    expect(normalizeName("Fırat HES")).toBe("firathes");
    expect(typeNumberKey("Karaburun RES-01")).toBe("res1");
    expect(typeNumberKey("RES_1")).toBe("res1");
    expect(typeNumberKey("Karaburun")).toBeNull();
  });

  it("Düzen A: sayfa adı aynı olan santrali yüksek güvenle, benzeyeni kontrol notuyla önermelidir", () => {
    const previews = layoutA.map((s) => buildSheetPreview(s));
    const s = suggestMappings(
      [
        { id: "p-res", name: "Karaburun RES-1", type: "RES" },
        { id: "p-hes", name: "HES_1", type: "HES" },
      ],
      previews
    );
    expect(s[1]).toMatchObject({ source: "sheet-exact" });
    expect(s[1].mapping).toMatchObject({
      sheetName: "HES_1",
      dateColumn: "Tarih",
      hourColumn: "Saat",
      forecastColumn: "Gün Öncesi Üretim Tahmini (MWh)",
      actualColumn: "Gerçekleşen Üretim (MWh)",
    });
    expect(s[0]).toMatchObject({ source: "sheet-similar" });
    expect(s[0].mapping?.sheetName).toBe("RES_1");
  });

  it("Eşleşmeyen santral için tahmin yürütmemeli ve bir sayfayı iki santrale vermemelidir", () => {
    const previews = layoutA.map((s) => buildSheetPreview(s));
    const s = suggestMappings(
      [
        { id: "a", name: "RES_1", type: "RES" },
        { id: "b", name: "RES_1 Yedek", type: "RES" },
        { id: "c", name: "Marmara", type: "RES" },
      ],
      previews
    );
    expect(s[0].mapping?.sheetName).toBe("RES_1");
    expect(s[1].mapping?.sheetName ?? null).not.toBe("RES_1");
    expect(s[2]).toMatchObject({ source: "none", mapping: null });
  });

  it("Düzen B: santral adını taşıyan kolonları önermelidir", () => {
    const previews = layoutB.map((s) => buildSheetPreview(s));
    const s = suggestMappings(plants, previews);
    expect(s[0]).toMatchObject({ source: "column-names" });
    expect(s[0].mapping).toMatchObject({
      headerRow: 2,
      dateColumn: "Tarih",
      forecastColumn: "RES_1 Tahmin",
      actualColumn: "RES_1 Gerçekleşen",
    });
    expect(s[1].mapping).toMatchObject({ forecastColumn: "HES_1 Tahmin", actualColumn: "HES_1 Gerçekleşen" });
  });

  it("Dosyaya uyan kayıtlı şablonu diğer önerilerden önce kullanmalıdır", () => {
    const previews = layoutA.map((s) => buildSheetPreview(s));
    const template = mappingA({ plantId: "p-hes", sheetName: "RES_1", unit: "kWh" });
    const s = suggestMappings(plants, previews, { "p-hes": template });
    expect(s[1]).toMatchObject({ source: "template" });
    expect(s[1].mapping).toMatchObject({ sheetName: "RES_1", unit: "kWh" });
    // Şablonun kullandığı sayfa başka santrale önerilmez
    expect(s[0].mapping?.sheetName ?? null).not.toBe("RES_1");
  });
});
