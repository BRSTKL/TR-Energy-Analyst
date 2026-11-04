import { describe, it, expect } from "vitest";
import { monthlyNewPlants, monthKey, RADAR_FROM, selectNewPlants, totalsOf, type FirstSeen, type NewPlant } from "@/lib/analysis/new-plants";

const at = (y: number, m: number, d = 1) => Date.UTC(y, m - 1, d);
const f = (id: number, name: string, firstMs: number, peakMwh = 10, type: FirstSeen["type"] = "RES", poolStartMs = Date.UTC(2025, 0, 1)): FirstSeen => ({ id, name, type, firstMs, peakMwh, poolStartMs });

describe("selectNewPlants", () => {
  it("ilk üretimi radar başından önce olanlar, lisanssız toplamlar ve hiç üretmeyenler elenir", () => {
    const list = [
      f(1, "YENİ RES", at(2025, 5, 3)),
      f(2, "ESKİ RES", at(2025, 1, 1)),
      f(3, "K3_AKEDAŞ_GÜNEŞ", at(2025, 3, 1)),
      f(4, "LÜM_İLETİM_FORD_GÜNEŞ", at(2025, 5, 1)),
      f(5, "ERKİM-LÜY-GÜNEŞ", at(2025, 4, 1)),
      f(6, "HİÇ ÜRETMEDİ GES", at(2025, 6, 1), 0),
      f(7, "RADAR BAŞI GES", RADAR_FROM, 5, "GES"),
    ];
    expect(selectNewPlants(list).map((p) => p.id)).toEqual([7, 1]);
  });
  it("ilk üretim kendi dosyasının ilk saatiyse (başlangıç bilinmiyor) elenir; sonrasındaysa girer", () => {
    const y26 = Date.UTC(2026, 0, 1);
    const list = [f(1, "DOSYA BAŞI RES", y26, 10, "RES", y26), f(2, "DOSYA İÇİ RES", y26 + 5 * 86_400_000, 10, "RES", y26)];
    expect(selectNewPlants(list).map((p) => p.id)).toEqual([2]);
  });
  it("ilk üretim sırasıyla", () => {
    const r = selectNewPlants([f(2, "B", at(2026, 3)), f(1, "A", at(2025, 8))]);
    expect(r.map((p) => p.id)).toEqual([1, 2]);
  });
});

const np = (id: number, firstMs: number, mw: number, recorded: boolean, type: NewPlant["type"] = "RES"): NewPlant => ({
  ...f(id, `S${id}`, firstMs, 1, type),
  owner: null,
  mw,
  capacitySource: recorded ? "EPDK_LICENSE" : "PEAK_ESTIMATE",
  capacityLabel: "x",
  recorded,
});

describe("monthlyNewPlants / totalsOf", () => {
  const plants = [np(1, at(2025, 3, 5), 50, true), np(2, at(2025, 3, 20), 20, false, "GES"), np(3, at(2025, 6, 1), 10, true, "HES")];
  it("boşluksuz aylar; tür, kayıtlı ve tahmini MW ayrı", () => {
    const rows = monthlyNewPlants(plants, "2025-02", "2025-07");
    expect(rows.map((r) => r.month)).toEqual(["2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07"]);
    expect(rows[0]).toMatchObject({ plants: 0, totalMw: 0 });
    expect(rows[1]).toMatchObject({ plants: 2, recordedMw: 50, estimatedMw: 20, totalMw: 70, mwByType: { RES: 50, GES: 20, HES: 0 } });
    expect(rows[4]).toMatchObject({ plants: 1, mwByType: { RES: 0, GES: 0, HES: 10 } });
  });
  it("aralık dışı ay sayılmaz; yıl sınırı", () => {
    expect(monthlyNewPlants(plants, "2025-11", "2026-02").map((r) => r.month)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthlyNewPlants(plants, "2025-04", "2025-05").reduce((s, r) => s + r.plants, 0)).toBe(0);
  });
  it("toplamlar", () => {
    expect(totalsOf(plants)).toEqual({ plants: 3, mw: 80, recordedMw: 60, estimatedMw: 20 });
  });
  it("monthKey", () => {
    expect(monthKey(at(2026, 1, 31))).toBe("2026-01");
  });
});
