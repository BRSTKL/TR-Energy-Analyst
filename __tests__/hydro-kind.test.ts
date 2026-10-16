import { describe, it, expect } from "vitest";
import { kindFromName, resolveHydroKind } from "@/lib/sector/hydro-kind";

const gem = [
  { project: "Demirköprü hydroelectric plant", technology: "conventional storage" },
  { project: "Seyhan 1 hydroelectric plant", technology: "conventional storage" },
  { project: "Kesikköprü hydroelectric plant", technology: "run-of-river" },
  { project: "Çifte hydroelectric plant", technology: "conventional storage" },
  { project: "Çifte hydroelectric plant", technology: "run-of-river" },
  { project: "Bilinmez hydroelectric plant", technology: "unknown" },
];

describe("Hidro alt türü kayıttan", () => {
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
