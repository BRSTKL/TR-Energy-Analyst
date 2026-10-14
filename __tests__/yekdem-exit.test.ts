import { describe, it, expect } from "vitest";
import { classifyYekdemExit, isYekdemExiting } from "@/lib/analysis/yekdem-exit";

const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe("YEKDEM çıkışları", () => {
  it("2016'dan beri listede ve bu yıl hâlâ YEKDEM'de: süre bu yıl doluyor (kesin)", () => {
    // Ad listesi 2016'dan başlar: sansürlü, ama 2026'da hâlâ listede olduğu için işletmeye giriş 2016
    const r = classifyYekdemExit({ idYears: span(2017, 2026), nameYears: span(2016, 2025) }, 2026);
    expect(r).toMatchObject({ status: "ENDS_THIS_YEAR", firstYear: 2016, censored: true, termEnds: { earliest: 2026, latest: 2026 }, marketFrom: { earliest: 2027, latest: 2027 } });
    expect(r.note).toBe("2016 ya da önce YEKDEM'e girdi; 10 yıllık süre en geç 2026 içinde doluyor, 2027'den itibaren serbest piyasada.");
    expect(isYekdemExiting(r.status)).toBe(true);
  });

  it("ilk yıl 2017 (sansürsüz): işletmeye giriş 2016–2017, süre 2026–2027, yakında", () => {
    const r = classifyYekdemExit({ idYears: span(2017, 2026), nameYears: span(2017, 2025) }, 2026);
    expect(r).toMatchObject({ status: "ENDS_SOON", censored: false, termEnds: { earliest: 2026, latest: 2027 }, marketFrom: { earliest: 2027, latest: 2028 } });
  });

  it("yalnız kimlikli listede 2017'den beri: 2016 listesi eksik olduğu için sansürlü, süre 2026–2027", () => {
    const r = classifyYekdemExit({ idYears: span(2017, 2026), nameYears: [] }, 2026);
    expect(r).toMatchObject({ status: "ENDS_SOON", censored: true, termEnds: { earliest: 2026, latest: 2027 } });
  });

  it("2018'de giren yakında (2027–2028), 2019'da giren sonra", () => {
    expect(classifyYekdemExit({ idYears: span(2018, 2026), nameYears: span(2018, 2025) }, 2026)).toMatchObject({ status: "ENDS_SOON", termEnds: { earliest: 2027, latest: 2028 } });
    expect(classifyYekdemExit({ idYears: span(2019, 2026), nameYears: span(2019, 2025) }, 2026)).toMatchObject({ status: "LATER", termEnds: { earliest: 2028, latest: 2029 } });
  });

  it("geçen yıl YEKDEM'deydi, bu yıl değil: süresi dolmuş mu, gönüllü mü", () => {
    const term = classifyYekdemExit({ idYears: span(2017, 2025), nameYears: span(2016, 2025) }, 2026);
    expect(term).toMatchObject({ status: "EXITED", exitReason: "term", marketFrom: { earliest: 2026, latest: 2026 } });
    // 2020'de giren: süresi 2029–2030'a kadar; 2026'da listede yok → kendi isteğiyle çıktı, dönebilir
    const vol = classifyYekdemExit({ idYears: span(2020, 2025), nameYears: span(2020, 2025) }, 2026);
    expect(vol).toMatchObject({ status: "EXITED", exitReason: "voluntary" });
    expect(vol.note).toMatch(/kendi isteğiyle çıktı, gelecek yıl geri dönebilir/);
  });

  it("2022'de çıkıp dönmeyen ve hiç girmeyen santraller; yıllar arası boşluk ilk yılı değiştirmez", () => {
    expect(classifyYekdemExit({ idYears: span(2017, 2021), nameYears: span(2016, 2021) }, 2026)).toMatchObject({ status: "LEFT_EARLIER", lastYear: 2021, marketFrom: { earliest: 2022, latest: 2022 } });
    expect(classifyYekdemExit({ idYears: [], nameYears: [] }, 2026).status).toBe("NEVER");
    // 2022'de fiyatlar yüksekken çıkıp 2023'te dönen: ilk yıl yine 2018
    const gap = classifyYekdemExit({ idYears: [2018, 2019, 2020, 2021, 2023, 2024, 2025, 2026], nameYears: [] }, 2026);
    expect(gap).toMatchObject({ firstYear: 2018, status: "ENDS_SOON" });
  });

  it("yıl ekleri okunuşa göre", () => {
    const r = classifyYekdemExit({ idYears: span(2017, 2025), nameYears: span(2016, 2025) }, 2026);
    expect(r.note.startsWith("2025'te YEKDEM'deydi")).toBe(true);
    const later = classifyYekdemExit({ idYears: span(2017, 2027), nameYears: span(2017, 2025) }, 2027);
    expect(later.note).toBe("2017'de YEKDEM'e girdi; 10 yıllık süre en geç 2027 içinde doluyor, 2028'den itibaren serbest piyasada.");
    expect(classifyYekdemExit({ idYears: span(2017, 2020), nameYears: [] }, 2026).note).toBe("En son 2020'de YEKDEM'deydi; 2021'den beri serbest piyasada.");
  });
});
