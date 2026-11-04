import { describe, it, expect } from "vitest";
import { searchPlants, type DirectoryEntry } from "@/lib/analysis/plant-search";

const L: DirectoryEntry[] = [
  { id: 1, name: "ÇAL RES", type: "RES", owner: "Zorlu Enerji" },
  { id: 2, name: "ZORLU ÇAL GES", type: "GES", owner: "Başka Şirket" },
  { id: 3, name: "KARACA HES", type: "HES", owner: "Çal Enerji A.Ş." },
  { id: 4, name: "BALABANLI RES", type: "RES", owner: null },
];

describe("searchPlants", () => {
  it("Türkçe harf ve büyük küçük harf fark etmez", () => {
    expect(searchPlants(L, "cal").items.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(searchPlants(L, "ÇAL").items.map((e) => e.id)).toEqual([1, 2, 3]);
  });
  it("sıra: adı başlayan, adında geçen, yalnız sahibinde geçen", () => {
    expect(searchPlants(L, "cal").items.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(searchPlants(L, "zorlu").items.map((e) => e.id)).toEqual([2, 1]);
  });
  it("her kelime bulunmalı; ad ve sahip birlikte aranır", () => {
    expect(searchPlants(L, "zorlu res").items.map((e) => e.id)).toEqual([1]);
    expect(searchPlants(L, "karaca enerji").items.map((e) => e.id)).toEqual([3]);
  });
  it("tür süzgeci ve sayısal kimlik", () => {
    expect(searchPlants(L, "", "RES").items.map((e) => e.id)).toEqual([4, 1]);
    expect(searchPlants(L, "3").items.map((e) => e.id)).toEqual([3]);
  });
  it("sınır ve toplam", () => {
    const r = searchPlants(L, "", "ALL", 2);
    expect(r.total).toBe(4);
    expect(r.items).toHaveLength(2);
  });
  it("eşleşme yoksa boş", () => {
    expect(searchPlants(L, "yokböyle")).toEqual({ total: 0, items: [] });
  });
});
