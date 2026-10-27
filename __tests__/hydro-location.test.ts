import { describe, expect, it } from "vitest";
import { parseMw, selectHydroSite, siteName, type EpdkCenter, type HydroSite } from "@/lib/epias-plant/hydro-location";

const site = (over: Partial<HydroSite>): HydroSite => ({ id: "w1", name: "Çamlıca I hydroelectric plant", mw: 84, lat: 38.1, lon: 35.5, ...over });
const near: EpdkCenter = { lat: 38.12, lon: 35.52, maxKm: 40 };

describe("parseMw", () => {
  it("birimleri MW'a çevirir, okunamazsa null", () => {
    expect(parseMw("17 MW")).toBe(17);
    expect(parseMw("9.26 MW")).toBe(9.26);
    expect(parseMw("300000 kW")).toBe(300);
    expect(parseMw("yes")).toBeNull();
    expect(parseMw("")).toBeNull();
  });
});

describe("siteName", () => {
  it("tür eklerini atar", () => {
    expect(siteName("Çamlıca I hydroelectric plant")).toBe("Çamlıca I");
    expect(siteName("Kısık HES")).toBe("Kısık");
  });
});

describe("selectHydroSite", () => {
  it("ad, güç ve EPDK yeri uyuşuyorsa kabul eder", () => {
    const v = selectHydroSite({ name: "ÇAMLICA 1 HES", refMw: 84 }, [site({})], [near]);
    expect(v.ok).toBe(true);
  });

  it("güç uyuşmuyorsa reddeder (aynı ad, başka santral)", () => {
    const v = selectHydroSite({ name: "KOYULHİSAR HES(AKKUŞ MİM.)", refMw: 0.1 }, [site({ name: "Koyulhisar hydroelectric plant", mw: 63 })], [near]);
    expect(v).toMatchObject({ ok: false });
  });

  it("EPDK merkezinden uzaksa reddeder", () => {
    const v = selectHydroSite({ name: "ÇAMLICA 1 HES", refMw: 84 }, [site({ lat: 40, lon: 38 })], [near]);
    expect(v).toMatchObject({ ok: false });
  });

  it("güç ve EPDK yeri bilinmiyorsa kabul etmez", () => {
    const v = selectHydroSite({ name: "ÇAMLICA 1 HES", refMw: null }, [site({ mw: null })], []);
    expect(v).toMatchObject({ ok: false });
  });

  it("yalnız güç tutuyorsa (EPDK yeri yok) kabul eder", () => {
    expect(selectHydroSite({ name: "ÇAMLICA 1 HES", refMw: 84 }, [site({})], []).ok).toBe(true);
  });

  it("ünite numarası çelişiyorsa eşleşmez", () => {
    const v = selectHydroSite({ name: "ÇAMLICA 2 HES", refMw: 84 }, [site({})], [near]);
    expect(v).toMatchObject({ ok: false });
  });

  it("adında fazladan kelime varsa yalnız yer yetmez", () => {
    const extra = site({ name: "Uludere İnceler Barajı HES", mw: null });
    expect(selectHydroSite({ name: "ULUDERE HES", refMw: null }, [extra], [near]).ok).toBe(false);
    expect(selectHydroSite({ name: "ULUDERE HES", refMw: 5 }, [{ ...extra, mw: 5 }], [near]).ok).toBe(true);
  });

  it("birbirinden uzak iki aday belirsizdir", () => {
    const v = selectHydroSite({ name: "KALE HES", refMw: 30 }, [site({ name: "Kale HES", mw: 30 }), site({ id: "w2", name: "Kale HES", mw: 31, lat: 38.3, lon: 35.7 })], [{ ...near, maxKm: 100 }]);
    expect(v).toMatchObject({ ok: false });
    expect((v as { reason: string }).reason).toContain("belirsiz");
  });
});
