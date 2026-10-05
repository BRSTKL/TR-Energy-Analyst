import { describe, expect, it } from "vitest";
import { normalizeProjectName, PROJECT_NAME_MAX } from "@/lib/projects/name";

describe("proje adı", () => {
  it("boşlukları sadeleştirir, boş ve çok uzun adı reddeder", () => {
    expect(normalizeProjectName("  Gain   Toplayıcılık  Portföyü 2026 ")).toEqual({ ok: true, value: "Gain Toplayıcılık Portföyü 2026" });
    expect(normalizeProjectName("   ").ok).toBe(false);
    expect(normalizeProjectName(42).ok).toBe(false);
    expect(normalizeProjectName("a".repeat(PROJECT_NAME_MAX)).ok).toBe(true);
    expect(normalizeProjectName("a".repeat(PROJECT_NAME_MAX + 1)).ok).toBe(false);
  });
});

import { displayDescription, replaceDescriptionText } from "@/lib/projects/description";

describe("proje açıklaması düzenleme", () => {
  it("kullanıcı metni değişir, eski EPİAŞ teknik notu korunur", () => {
    const old = "Gain Enerji RES/GES/HES Portföy- 2026\nEPİAŞ: KORU RES: KGÜP ilk versiyon (plan) ve UEVM (gerçekleşen). Santral kimliği 9083, UEVÇB 3223551.";
    const next = replaceDescriptionText(old, "  Gain Toplayıcılık, 38 santral ");
    expect(displayDescription(next)).toBe("Gain Toplayıcılık, 38 santral");
    expect(next).toContain("Santral kimliği 9083");
    expect(replaceDescriptionText("Eski metin", "  ")).toBeNull();
  });
});
