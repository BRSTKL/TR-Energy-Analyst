import { describe, it, expect } from "vitest";
import {
  detectTechnology,
  mergePlantSeries,
  normalizePlantName,
  parseKgupItems,
  parseUevmItems,
  searchPowerPlants,
  guessTechnologyFromName,
  suggestCapacityMw,
  sumSeries,
} from "../lib/epias-plant/plant-data";

const day = (d: string, h: number) => `${d}T${String(h).padStart(2, "0")}:00:00+03:00`;
// Belgedeki KgupDataDto biçimi: date (+03:00), time "HH:00", kaynak alanları ve toplam
const kgupItem = (d: string, h: number, v: number) => ({ date: day(d, 0), time: `${String(h).padStart(2, "0")}:00`, ruzgar: v, toplam: v });
// InjectionQuantityDto: date, hour (0-23), kaynak alanları ve total
const uevmItem = (d: string, h: number, v: number) => ({ date: day(d, 0), hour: h, wind: v, sun: 0, total: v });

describe("EPİAŞ santral verisi", () => {
  it("Santral adını Türkçe karakterlerden bağımsız arar ve en iyi eşleşmeyi öne alır", () => {
    const plants = [
      { id: 1, name: "BAHÇE RES-2" },
      { id: 2, name: "Bahçe RES" },
      { id: 3, name: "Sarıkaya HES" },
    ];
    expect(normalizePlantName("Bahçe RES-2")).toBe("bahce res 2");
    expect(searchPowerPlants(plants, "bahce res").map((p) => p.id)).toEqual([2, 1]);
    expect(searchPowerPlants(plants, "SARIKAYA").map((p) => p.id)).toEqual([3]);
    expect(searchPowerPlants(plants, "a")).toEqual([]);
  });

  it("EIC koduyla veya EPİAŞ ekranındaki tam adla da bulur", () => {
    const plants = [
      { id: 7663, name: "BALABANLI RES-40W000000007663Y", eic: "40W000000007663Y", shortName: "BALABANLI RES" },
      { id: 8, name: "Başka RES", eic: "40W000000000008X" },
    ];
    expect(searchPowerPlants(plants, "40W000000007663Y").map((p) => p.id)).toEqual([7663]);
    expect(searchPowerPlants(plants, "BALABANLI RES-40W000000007663Y").map((p) => p.id)).toEqual([7663]);
    expect(searchPowerPlants(plants, "40W000000000008X").map((p) => p.id)).toEqual([8]);
  });

  it("KGÜP ve UEVM kayıtlarını duvar saatine çevirir", () => {
    const k = parseKgupItems([kgupItem("2025-06-10", 13, 42.5)]);
    const u = parseUevmItems([uevmItem("2025-06-10", 13, 40.1)]);
    const t = Date.UTC(2025, 5, 10, 13);
    expect(k.values.get(t)).toBe(42.5);
    expect(u.values.get(t)).toBe(40.1);
  });

  it("Toplam alanı yoksa kaynak alanlarını toplar; okunamayan kaydı atlar ve sayar", () => {
    const u = parseUevmItems([
      { date: day("2025-06-10", 0), hour: 1, dam: 10, river: 5 },
      { date: "bozuk", hour: 2, total: 3 },
      { date: day("2025-06-10", 0), hour: 3 },
    ]);
    expect(u.values.get(Date.UTC(2025, 5, 10, 1))).toBe(15);
    expect(u.skipped).toBe(2);
  });

  it("Birden fazla UEVÇB'nin KGÜP'ünü saat saat toplar", () => {
    const s = sumSeries([parseKgupItems([kgupItem("2025-06-10", 0, 10)]), parseKgupItems([kgupItem("2025-06-10", 0, 5)])]);
    expect(s.values.get(Date.UTC(2025, 5, 10, 0))).toBe(15);
  });

  it("Santral türünü baskın kaynaktan bulur; karışık kaynakta karar vermez", () => {
    expect(detectTechnology({ wind: 900, sun: 10 }).type).toBe("RES");
    expect(detectTechnology({ dam: 500, river: 450, wind: 20 }).type).toBe("HES");
    expect(detectTechnology({ naturalGas: 1000 }).type).toBeNull();
    expect(detectTechnology({ wind: 500, sun: 500 }).type).toBeNull();
    expect(suggestCapacityMw([12.2, 94.3, 3])).toBe(95);
  });

  it("Yalnızca ikisinin de olduğu saatleri birleştirir ve eksik ayları uyarır", () => {
    const kg: object[] = [];
    const uv: object[] = [];
    for (const d of ["2025-01-01", "2025-02-01"])
      for (let h = 0; h < 24; h++) {
        kg.push(kgupItem(d, h, 20 + h));
        if (d === "2025-01-01") uv.push(uevmItem(d, h, 19 + h));
      }
    const m = mergePlantSeries(parseKgupItems(kg as any), parseUevmItems(uv as any), "2025-01-01", "2025-02-01");
    expect(m.rows).toHaveLength(24);
    expect(m.rows[0]).toMatchObject({ forecastMwh: 20, actualMwh: 19, imbalanceMwh: -1 });
    expect(m.checks.some((c) => c.level === "warning" && c.message.includes("UEVM eksik aylar: Ocak 2025, Şubat 2025"))).toBe(true);
  });

  it("Plan ile gerçekleşen tutmazsa farklı santral uyarısı verir", () => {
    const kg: object[] = [];
    const uv: object[] = [];
    for (let h = 0; h < 24; h++) {
      kg.push(kgupItem("2025-03-01", h, 100));
      uv.push(uevmItem("2025-03-01", h, 10 + (h % 3)));
    }
    const m = mergePlantSeries(parseKgupItems(kg as any), parseUevmItems(uv as any), "2025-03-01", "2025-03-01");
    expect(m.checks.some((c) => c.message.includes("aynı santrale ait olmayabilir"))).toBe(true);
  });

  it("Hiç ortak saat yoksa hata üretir", () => {
    const m = mergePlantSeries(parseKgupItems([]), parseUevmItems([]), "2025-03-01", "2025-03-01");
    expect(m.checks[0].level).toBe("error");
  });
});

describe("Santral türünü addan tahmin", () => {
  it("yenilenebilir ve diğer türleri ayırır, anlaşılamayanı belirsiz bırakır", () => {
    expect(guessTechnologyFromName("AKKÖY RES(ENERJİSA)")).toBe("RES");
    expect(guessTechnologyFromName("K3_OSMANGAZİ_RÜZGAR")).toBe("RES");
    expect(guessTechnologyFromName("DOĞANÇAY REG. ve HES(ENERJİSA ENR.)")).toBe("HES");
    expect(guessTechnologyFromName("Karapınar GES")).toBe("GES");
    expect(guessTechnologyFromName("BANDIRMA II DGKÇS")).toBe("OTHER");
    expect(guessTechnologyFromName("2BZ ÇUBUK BES")).toBe("OTHER");
    expect(guessTechnologyFromName("ENERJISA BANDIRMA SANTRALI")).toBeNull();
    expect(guessTechnologyFromName("TRESKON")).toBeNull();
  });
});
