import { describe, it, expect } from "vitest";
import { kindFromName, resolveHydroKind } from "@/lib/sector/hydro-kind";

const gem = [
  { project: "Demirköprü hydroelectric plant", technology: "conventional storage" },
  { project: "Seyhan 1 hydroelectric plant", technology: "conventional storage" },
  { project: "Kesikköprü hydroelectric plant", technology: "run-of-river" },
  { project: "Çifte hydroelectric plant", technology: "conventional storage" },
  { project: "Çifte hydroelectric plant", technology: "run-of-river" },
  { project: "Bilinmez hydroelectric plant", technology: "unknown" },
  { project: "Kandil hydroelectric plant", technology: "conventional storage" },
  { project: "Göktaş I hydroelectric plant", technology: "conventional storage" },
  { project: "Göktaş II hydroelectric plant", technology: "conventional storage" },
  { project: "Darıca 2 hydroelectric plant", technology: "conventional storage" },
  { project: "Eşen I hydroelectric plant", technology: "conventional storage" },
  { project: "Eşen II hydroelectric plant", technology: "run-of-river" },
];

describe("Hidro alt türü kayıttan", () => {
  it("ad temizliği: şirket öneki, parantez, çok üniteli santral; farklı türde üniteler sınıflanmamış", () => {
    expect(resolveHydroKind("ENERJİSA KANDİL HES", gem, [])).toMatchObject({ kind: "RESERVOIR", source: "GEM" });
    expect(resolveHydroKind("DARICA II HES(ORYA ENR", gem, [])).toMatchObject({ kind: "RESERVOIR", source: "GEM" });
    expect(resolveHydroKind("GÖKTAŞ HES", gem, [])).toMatchObject({ kind: "RESERVOIR", source: "GEM" });
    expect(resolveHydroKind("EŞEN I ve EŞEN II HES", gem, []).kind).toBeNull();
    // Ünite numarası olan santral başka üniteye genişletilmez
    expect(resolveHydroKind("GÖKTAŞ III HES", gem, []).kind).toBeNull();
  });

  it("ad eki: baraj → barajlı, regülatör / reg. → nehir tipi", () => {
    expect(kindFromName("GÜRSÖĞÜT BARAJI ve HES")).toBe("RESERVOIR");
    expect(kindFromName("Pirinçli Reg. ve HES")).toBe("RUN_OF_RIVER");
    expect(kindFromName("SÖĞÜTLÜ REGÜLATÖRÜ VE HES-40W000000000123X")).toBe("RUN_OF_RIVER");
    expect(kindFromName("DEMİRKÖPRÜ HES")).toBeNull();
  });

  it("önce GEM (EÜAŞ barajları desende nehir tipi görünüyordu)", () => {
    expect(resolveHydroKind("DEMİRKÖPRÜ HES", gem, [])).toMatchObject({ kind: "RESERVOIR", source: "GEM" });
    expect(resolveHydroKind("SEYHAN I", gem, [])).toMatchObject({ kind: "RESERVOIR", source: "GEM" });
    expect(resolveHydroKind("KESİKKÖPRÜ HES", gem, [])).toMatchObject({ kind: "RUN_OF_RIVER", source: "GEM" });
  });

  it("GEM çelişkili ya da bilinmiyorsa ad, sonra EPDK lisansı; hiçbiri yoksa sınıflanmamış", () => {
    expect(resolveHydroKind("ÇİFTE HES", gem, []).kind).toBeNull();
    expect(resolveHydroKind("BİLİNMEZ HES", gem, []).kind).toBeNull();
    expect(resolveHydroKind("MAVİ HES", gem, ["MAVİ REG. VE HES"])).toMatchObject({ kind: "RUN_OF_RIVER", source: "EPDK" });
    expect(resolveHydroKind("KASIMLAR BARAJI ve HES", gem, [])).toMatchObject({ kind: "RESERVOIR", source: "NAME" });
    expect(resolveHydroKind("YAZI HES", gem, ["BAŞKA HES"])).toEqual({ kind: null, source: null });
  });
});
