import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeNavId,
  ALL_NAV_ITEMS,
  hidesShell,
  MOBILE_BAR,
  NAV_GROUPS,
  navItem,
} from "@/components/nav/nav-config";

/** Adres için bir `page.tsx` var mı (uygulama klasörü ve (dashboard) grubu) */
const pageExists = (href: string) => {
  const parts = href.split("/").filter(Boolean);
  const roots = ["app", path.join("app", "(dashboard)")];
  return roots.some((r) =>
    fs.existsSync(path.join(process.cwd(), r, ...parts, "page.tsx"))
  );
};

describe("menü yapılandırması", () => {
  it("her öğe gerçek bir sayfaya çıkar", () => {
    for (const it of ALL_NAV_ITEMS)
      expect(pageExists(it.href), `${it.id} → ${it.href}`).toBe(true);
  });
  it("öğe kimlikleri tekil", () => {
    const ids = ALL_NAV_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("gün sırasına göre gruplar: Bugün, Gün içi, Portföy, Analiz", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      "Bugün",
      "Gün içi",
      "Portföy",
      "Analiz",
    ]);
  });
  it("alt çubukta dört kısayol, hepsi tanımlı", () => {
    expect(MOBILE_BAR).toHaveLength(4);
    for (const id of MOBILE_BAR) expect(navItem(id).href).toBeTruthy();
  });
});

describe("activeNavId", () => {
  it("ana sayfa, teklif öncesi ve günlük pano, piyasa özetinden ayrı", () => {
    expect(activeNavId("/")).toBe("today");
    expect(activeNavId("/market/teklif")).toBe("pre-bid");
    expect(activeNavId("/market/gunluk")).toBe("daily");
    expect(activeNavId("/market")).toBe("market");
  });
  it("proje sayfaları Portföy'e, üretim tahmini Gün içi'ne, EPİAŞ ekleme kendi öğesine", () => {
    expect(activeNavId("/projects")).toBe("projects");
    expect(activeNavId("/projects/abc/results")).toBe("projects");
    expect(activeNavId("/projects/abc/planning")).toBe("projects");
    expect(activeNavId("/projects/abc/forecast")).toBe("forecast");
    expect(activeNavId("/projects/epias")).toBe("epias");
  });
  it("analiz ve alt öğeler; sondaki eğik çizgi önemsiz", () => {
    expect(activeNavId("/sector/aggregators/12")).toBe("sector");
    expect(activeNavId("/compare/")).toBe("compare");
    expect(activeNavId("/ozet")).toBe("summary");
    expect(activeNavId("/methodology")).toBe("methodology");
    expect(activeNavId("/account")).toBe("account");
  });
  it("menüde karşılığı olmayan adres null", () => {
    expect(activeNavId("/login")).toBeNull();
    expect(activeNavId("/olmayan-sayfa")).toBeNull();
  });
  it("giriş sayfasında kabuk gizli", () => {
    expect(hidesShell("/login")).toBe(true);
    expect(hidesShell("/")).toBe(false);
  });
});
