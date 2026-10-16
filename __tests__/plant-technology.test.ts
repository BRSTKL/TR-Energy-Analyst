import { describe, it, expect } from "vitest";
import { buildTechIndex, fuelTechnology, resolveTechnology, stripEic } from "@/lib/sector/plant-technology";

const index = buildTechIndex([
  { plant: "OYMAPINAR HES", tech: "HES" },
  { plant: "IĞDIR DGES", tech: "GES" },
  { plant: "PAMUK GES", tech: "GES" },
  { plant: "PAMUK HES", tech: "HES" },
  { plant: "ALBAY ÇİĞİLTEPE RES", tech: "RES" },
]);

describe("Sektör taramasında tür (2b)", () => {
  it("EIC eki atılır", () => expect(stripEic("OYMAPINAR-40W0000000003394")).toBe("OYMAPINAR"));

  it("ad türü belirlemiyorsa EPDK lisansı (sıkı eşleşme); ad belirliyorsa ad", () => {
    expect(resolveTechnology("OYMAPINAR-40W0000000003394", index)).toMatchObject({ type: "HES", source: "EPDK" });
    expect(resolveTechnology("IĞDIR DGES-40W0000050140240", index)).toMatchObject({ type: "GES", source: "EPDK" });
    expect(resolveTechnology("ALBAY ÇİĞLİTEPE RES", index)).toMatchObject({ type: "RES", source: "NAME" });
  });

  it("termik santraller yer adından yenilenebilir sayılmaz (kuru çalışmadaki yanlışlar)", () => {
    const idx = buildTechIndex([{ plant: "SOMA RES", tech: "RES" }, { plant: "KIRIKKALE HES", tech: "HES" }, { plant: "İSTANBUL RES", tech: "RES" }]);
    expect(resolveTechnology("SOMA B TERMİK SANTRALİ", idx).type).toBe("OTHER");
    expect(resolveTechnology("T.Ş.F.A.Ş. Ankara Şeker Fabrikası", idx).type).toBe("OTHER");
    expect(resolveTechnology("TÜPRAŞ KIRIKKALE RAFİNERİSİ TPP SANTRALİ", idx).type).toBe("OTHER");
    expect(resolveTechnology("İSTANBUL DOĞAL GAZ KOMBİNE ÇEVRİM SANTRALİ (A)", idx).type).toBe("OTHER");
    // Gevşek eşleşme olmaz: "SOMA A ve B" yalnız yer adı ortak
    expect(resolveTechnology("SOMA A ve B", idx).type).toBeNull();
    expect(resolveTechnology("MARDİN ENERJİ SANTRALİ", buildTechIndex([{ plant: "RA GÜNEŞ MARDİN GES", tech: "GES" }])).type).toBeNull();
    expect(resolveTechnology("Reşadiye Hidroelektrik Santrali-40W000000000589I", null).type).toBe("HES");
    expect(resolveTechnology("İVRİZHES", null).type).toBe("HES");
    expect(resolveTechnology("ENGİL GT", buildTechIndex([{ plant: "ENGİL", tech: "HES" }])).type).toBe("OTHER");
  });

  it("EPDK'da iki türe çıkan ad belirsiz: kaynak kırılımı, o da yoksa ad", () => {
    expect(resolveTechnology("PAMUK", index)).toMatchObject({ type: null });
    expect(resolveTechnology("PAMUK", index, { river: 900, sun: 10 })).toMatchObject({ type: "HES", source: "FUEL" });
    expect(resolveTechnology("KARAKUZ HES", index)).toMatchObject({ type: "HES", source: "NAME" });
  });

  it("kaynak kırılımı: yenilenebilir tür üretimin en az yarısı", () => {
    expect(fuelTechnology({ dam: 300, river: 300, naturalGas: 100 })).toBe("HES");
    expect(fuelTechnology({ naturalGas: 900, sun: 100 })).toBeNull();
    expect(fuelTechnology({})).toBeNull();
  });
});
