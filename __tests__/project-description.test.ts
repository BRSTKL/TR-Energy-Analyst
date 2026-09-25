import { describe, it, expect } from "vitest";
import { splitProjectDescription } from "@/lib/projects/description";

describe("Proje açıklaması: teknik notların ayrılması", () => {
  it("çok santralli biçimdeki notları santral adıyla ayırır, kullanıcı metnini korur", () => {
    const d =
      "Borusan Res\nEPİAŞ: BALABANLI RES: KGÜP ilk versiyon (plan) ve UEVM (gerçekleşen). Santral kimliği 7663, UEVÇB 1235449.\n" +
      "EPİAŞ: HARMANLIK RES: KGÜP son versiyon (plan) ve UEVM (gerçekleşen). Santral kimliği 8780, UEVÇB 3223632, 3223633.";
    const r = splitProjectDescription(d);
    expect(r.text).toBe("Borusan Res");
    expect(r.notes).toEqual([
      { plantName: "BALABANLI RES", kgupVersion: "FIRST", powerPlantId: 7663, uevcbIds: [1235449] },
      { plantName: "HARMANLIK RES", kgupVersion: "FINAL", powerPlantId: 8780, uevcbIds: [3223632, 3223633] },
    ]);
  });

  it("tek santralli eski biçimi ve boş açıklamayı tanır", () => {
    const r = splitProjectDescription("EPİAŞ açık verisi: KGÜP (plan) ve UEVM (gerçekleşen). Santral kimliği 7663, UEVÇB 1235449.");
    expect(r.text).toBe("");
    expect(r.notes).toEqual([{ plantName: null, kgupVersion: null, powerPlantId: 7663, uevcbIds: [1235449] }]);
    expect(splitProjectDescription(null)).toEqual({ text: "", notes: [] });
    expect(splitProjectDescription("RES ve GES portföyü").text).toBe("RES ve GES portföyü");
  });
});
