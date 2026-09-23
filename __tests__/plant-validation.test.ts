import { describe, it, expect } from "vitest";
import { plantNameKey, removePlantFromTemplate, validatePlantInput } from "../lib/plants/validation";

describe("Santral doğrulama (plants/validation)", () => {
  it("Geçerli girdiyi normalize eder (ad kırpılır, tür büyük harfe, güç sayıya çevrilir)", () => {
    const r = validatePlantInput({ name: "  RES_1 ", type: "res", capacityMw: "45.5" }, new Set());
    expect(r).toEqual({ ok: true, value: { name: "RES_1", type: "RES", capacityMw: 45.5 } });
  });

  it("Aynı adı Türkçe büyük/küçük harf kurallarıyla yakalar", () => {
    const taken = new Set([plantNameKey("İZMİR RES")]);
    const r = validatePlantInput({ name: "izmir res", type: "RES", capacityMw: 10 }, taken);
    expect(r.ok).toBe(false);
  });

  it.each([
    [{ name: "", type: "RES", capacityMw: 10 }, "adı zorunlu"],
    [{ name: "A", type: "NÜKLEER", capacityMw: 10 }, "RES, HES veya GES"],
    [{ name: "A", type: "HES", capacityMw: 0 }, "0'dan büyük"],
    [{ name: "A", type: "HES", capacityMw: "abc" }, "0'dan büyük"],
    [null, "adı zorunlu"],
  ])("Geçersiz girdiyi reddeder: %j", (input, expected) => {
    const r = validatePlantInput(input, new Set());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(expected);
  });

  it("Şablondan santrali çıkarır, diğerlerini korur; boşalan şablon null olur", () => {
    const t = JSON.stringify({ a: { sheetName: "RES_1" }, b: { sheetName: "HES_1" } });
    expect(JSON.parse(removePlantFromTemplate(t, "a")!)).toEqual({ b: { sheetName: "HES_1" } });
    expect(removePlantFromTemplate(JSON.stringify({ a: {} }), "a")).toBeNull();
    expect(removePlantFromTemplate(t, "yok")).toBe(t);
    expect(removePlantFromTemplate(null, "a")).toBeNull();
    expect(removePlantFromTemplate("bozuk{", "a")).toBe("bozuk{");
  });
});
