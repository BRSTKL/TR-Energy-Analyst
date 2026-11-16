import { describe, it, expect } from "vitest";
import { describeGap, findDataGaps } from "@/lib/analysis/data-completeness";

const hours = (from: string, to: string) => {
  const out: number[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T23:00:00Z`); t += 3_600_000) out.push(t);
  return out;
};

describe("Veri bütünlüğü", () => {
  it("eksik ayı bulur, tam santrali raporlamaz", () => {
    const full = hours("2025-06-01", "2025-08-31");
    const noJuly = full.filter((t) => new Date(t).getUTCMonth() !== 6);
    const gaps = findDataGaps([
      { plantName: "Tam", timestamps: full },
      { plantName: "Boreas", timestamps: noJuly },
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].plantName).toBe("Boreas");
    expect(gaps[0].gapMonths).toEqual([{ month: "2025-07", hours: 0, expectedHours: 744 }]);
    expect(gaps[0].hours).toBe(full.length - 744);
    expect(describeGap(gaps[0])).toBe("Boreas: Temmuz 2025 yok");
  });

  it("kısmi ayı saat sayısıyla, yinelenen saatleri bir kez sayar", () => {
    const full = hours("2025-01-01", "2025-01-31");
    const partial = [...hours("2025-01-01", "2025-01-10"), ...hours("2025-01-01", "2025-01-02")];
    const gaps = findDataGaps([
      { plantName: "A", timestamps: full },
      { plantName: "B", timestamps: partial },
    ]);
    expect(gaps[0].gapMonths[0]).toEqual({ month: "2025-01", hours: 240, expectedHours: 744 });
    expect(describeGap(gaps[0])).toBe("B: Ocak 2025 eksik (240/744 saat)");
    expect(findDataGaps([])).toEqual([]);
  });

  it("proje dönemi verilince bütün santrallerde birden eksik olan ay da bulunur (bugünü geçmeden)", () => {
    // Akenerji, 16.11.2026: dönem Ocak–Eylül, hiçbir santralde Eylül yok; veri aralığına bakan kontrol bunu görmüyordu
    const toAug = hours("2026-01-01", "2026-08-31");
    const plants = [
      { plantName: "A", timestamps: toAug },
      { plantName: "B", timestamps: toAug },
    ];
    expect(findDataGaps(plants)).toEqual([]);
    const now = new Date("2026-11-16T12:00:00Z");
    const gaps = findDataGaps(plants, undefined, { start: "2026-01-01", end: "2026-09-30" }, now);
    expect(gaps.map(describeGap)).toEqual(["A: Eylül 2026 yok", "B: Eylül 2026 yok"]);
    // Dönem bugünden sonra bitiyorsa yalnız bugüne kadarki saatler beklenir
    const upToNow = hours("2026-01-01", "2026-11-15");
    expect(findDataGaps([{ plantName: "C", timestamps: upToNow }], undefined, { start: "2026-01-01", end: "2026-12-31" }, now)).toEqual([]);
  });
});

describe("dönem içinde devreye giren santral", () => {
  it("ilk veriden önceki aylar eksik sayılmaz, yeni santral ayrıca bildirilir", async () => {
    const { findDataGaps, findLateStarts, describeLateStart } = await import("@/lib/analysis/data-completeness");
    const H = 3_600_000;
    const range = (a: number, b: number) => Array.from({ length: (b - a) / H }, (_, i) => a + i * H);
    const old = range(Date.UTC(2026, 0, 1), Date.UTC(2026, 3, 1));
    const fresh = range(Date.UTC(2026, 2, 4), Date.UTC(2026, 3, 1));
    const plants = [{ plantName: "ESKİ", timestamps: old }, { plantName: "YENİ", timestamps: fresh }];
    expect(findDataGaps(plants)).toEqual([]);
    const late = findLateStarts(plants);
    expect(late).toEqual([{ plantName: "YENİ", firstDay: "2026-03-04" }]);
    expect(describeLateStart(late[0])).toBe("YENİ (4 Mart 2026)");
  });
});
