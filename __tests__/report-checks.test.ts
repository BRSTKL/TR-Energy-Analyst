import { describe, it, expect } from "vitest";
import { buildPlantReport } from "@/lib/report/plant-report";
import { anonymizeReport } from "@/lib/report/anonymize";
import { buildBridgeSteps, exportPlantReportPptx, intradayView } from "@/lib/export/plant-report-pptx";
import {
  checkBridge,
  checkIntradayBridge,
  checkIntradayText,
  checkReportData,
  checkSlideTables,
  checkSlideTexts,
  extractSlideTables,
  extractSlideTexts,
  parseAmount,
} from "@/lib/report/report-checks";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, type SystemDirection } from "@/lib/calculations/types";

/** İki ay, farklı sahiplerin üç santrali: saatlerin bir kısmında biri fazla, diğeri eksik üretir (netleşme olur) */
function sampleReport() {
  const hours = (seed: number) =>
    Array.from({ length: 24 * 40 }, (_, i) => {
      const t = new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 24), i % 24));
      const dir: SystemDirection = (i + seed) % 3 === 0 ? "SURPLUS" : "DEFICIT";
      const err = ((i * (seed + 3)) % 7) - 3;
      return processHourlyRecord(
        { timestamp: t, forecastMwh: 20, actualMwh: Math.max(0, 20 + err) },
        { timestamp: t, ptf: 2000, smf: dir === "SURPLUS" ? 1700 : 2500, systemDirection: dir },
        DEFAULT_IMBALANCE_PROFILE
      );
    });
  return buildPlantReport({
    project: { id: "p", name: "Deneme Portföyü 2026" },
    profile: DEFAULT_IMBALANCE_PROFILE,
    plants: [1, 2, 3].map((n) => ({
      plantId: `p${n}`,
      plantName: `KARADERE ${n} RES`,
      plantType: "RES",
      capacityMw: 30,
      organizationId: n,
      organizationName: `ÖRNEKSAHİP ${n} ENERJİ A.Ş.`,
      yekdem: false,
      yekdemNextYear: false,
      epiasPlantId: n,
      hourly: hours(n),
    })),
  });
}

describe("Rapor tutarlılık denetimi", () => {
  it("sağlam bir rapor veri, metin ve tablo denetiminden hatasız geçer", async () => {
    const r = sampleReport();
    expect(checkReportData(r, buildBridgeSteps(r).steps).filter((i) => i.level === "error")).toEqual([]);
    const buf = await exportPlantReportPptx(r);
    expect(checkSlideTexts(await extractSlideTexts(buf))).toEqual([]);
    const tables = await extractSlideTables(buf);
    expect(tables.some((t) => t.rows.some((row) => /^Toplam\b/.test(row[0] ?? "")))).toBe(true); // Ek A denetlendi
    expect(checkSlideTables(tables)).toEqual([]);
  });

  it("köprüde gizlenen adımı yakalar (Gain: 73,6 − 41,2 ≠ 32,2)", () => {
    const issues = checkBridge([
      { label: "Santraller tek tek uzlaştırılsaydı", value: 73.6e6, kind: "total" },
      { label: "Toplayıcının kattığı değer", value: -41.2e6, kind: "value" },
      { label: "Dengesizlik riski", value: 32.2e6, kind: "total" },
    ]);
    expect(issues.map((i) => i.rule)).toEqual(["bridge-closes"]);
    expect(
      checkBridge([
        { label: "Santraller sahiplerinin kendi dengesinde", value: 73.4e6, kind: "total" },
        { label: "Toplayıcının kattığı değer", value: -41.2e6, kind: "value" },
        { label: "Dengesizlik riski", value: 32.2e6, kind: "total" },
      ])
    ).toEqual([]);
  });

  it("Ek A'da toplam satırı satırların toplamını tutmazsa yakalar (KÜPST: satırlar 7,58 M, toplamda 876 bin)", () => {
    const head = ["Santral", "Tür", "MW", "Üretim", "Dengesizlik (tek başına)", "TL/MWh", "KÜPST (tahmini)", "Plan farkı"];
    const rows = [
      head,
      ["A", "RES", "70", "160 GWh", "19,21 milyon TL", "120", "1,70 milyon TL", "%21,9"],
      ["B", "RES", "28", "57 GWh", "9,35 milyon TL", "164", "956 bin TL", "%28,9"],
      ["Diğer 33 santral", "", "288", "565 GWh", "45,01 milyon TL", "", "4,92 milyon TL", ""],
    ];
    const bad = checkSlideTables([{ slide: 15, rows: [...rows, ["Toplam (santral bazında)", "", "386", "782 GWh", "73,57 milyon TL", "94", "876 bin TL", "%17,3"]] }]);
    expect(bad.map((i) => i.message).join(" ")).toContain("KÜPST (tahmini)");
    expect(bad).toHaveLength(1); // MW, üretim ve dengesizlik tutuyor; TL/MWh ve yüzde toplanmaz
    const good = checkSlideTables([{ slide: 15, rows: [...rows, ["Toplam (santral bazında)", "", "386", "782 GWh", "73,57 milyon TL", "94", "7,58 milyon TL", "%17,3"]] }]);
    expect(good).toEqual([]);
  });

  it("tutar ve enerji metnini yuvarlama payıyla okur", () => {
    expect(parseAmount("19,21 milyon TL")).toEqual({ value: 19.21e6, halfUnit: 5000, unit: "TL" });
    expect(parseAmount("956 bin TL")).toEqual({ value: 956e3, halfUnit: 500, unit: "TL" });
    expect(parseAmount("1.234 MWh")).toEqual({ value: 1234, halfUnit: 0.5, unit: "MWh" });
    expect(parseAmount("160 GWh")).toEqual({ value: 160e3, halfUnit: 500, unit: "MWh" });
    expect(parseAmount("%21,9")).toBeNull();
    expect(parseAmount("164")?.unit).toBe("plain");
  });

  it("anonim sürümde gerçek adı ve bozuk değerleri yakalar", async () => {
    const r = sampleReport();
    const { report, aliases } = anonymizeReport(r);
    const buf = await exportPlantReportPptx(report);
    const forbidden = [...aliases.keys(), ...r.plants.map((p) => p.name)];
    expect(checkSlideTexts(await extractSlideTexts(buf), forbidden)).toEqual([]);
    const leaked = checkSlideTexts([{ slide: 16, text: "Doğrulama: bir santralde (KARADERE 1 RES) şirketin kendi verisiyle" }], forbidden);
    expect(leaked.map((i) => i.rule)).toEqual(["anon-leak"]);
    const broken = checkSlideTexts([{ slide: 2, text: "Sapma yükü NaN milyon TL; payı %-3,1; sahibi undefined" }]);
    expect(broken.map((i) => i.message).join(" ")).toMatch(/NaN.*eksi yüzde.*undefined|NaN[\s\S]*undefined/);
    expect(broken.length).toBeGreaterThanOrEqual(3);
  });

  it("aylık toplam, ana rakam ya da netleşme tutmazsa yakalar", () => {
    const r = sampleReport();
    const monthly = { ...r, monthly: r.monthly.map((m, i) => (i === 0 ? { ...m, imbalanceCostTl: m.imbalanceCostTl + 50_000 } : m)) };
    expect(checkReportData(monthly).map((i) => i.rule)).toContain("monthly-sum");
    const plants = { ...r, plants: r.plants.slice(1) };
    expect(checkReportData(plants).map((i) => i.rule)).toEqual(expect.arrayContaining(["plant-count", "plants-sum-cost"]));
    const nan = { ...r, totals: { ...r.totals, actualMwh: Number.NaN } };
    expect(checkReportData(nan).map((i) => i.rule)).toContain("finite");
  });

  /** Gerçekleşen gün içi azalma ve kural tabanlı strateji (ilk plana göre) verilmiş rapor */
  function withIntraday(realizedPct: number, strategyPct: number) {
    const r = sampleReport();
    const cost = r.totals.imbalanceCostTl;
    return {
      ...r,
      intradayEffect: {
        hoursWithFinal: r.period.hours,
        coveragePct: 100,
        firstCostTl: cost,
        finalCostTl: cost * (1 - realizedPct / 100),
        reductionPct: realizedPct,
        absDevFirstMwh: 1000,
        absDevFinalMwh: 800,
        staticPlants: ["KARADERE 3 RES"],
        topAdjusters: [],
      },
      intraday: { savingTl: (strategyPct / 100) * cost, savingPct: strategyPct, testMonths: 1, firstTestMonth: "2026-02", lastTestMonth: "2026-02", lagHours: 2 },
    };
  }

  it("gün içi: gerçekleşen düzeltme stratejiden büyükse köprü gerçekleşeni gösterir, senaryo fırsat sayılmaz (Gain: %26 ve %1)", async () => {
    const r = withIntraday(26, 1);
    const { steps, afterIntraday } = buildBridgeSteps(r);
    expect(steps.map((s) => s.kind)).toContain("realized");
    expect(steps.some((s) => s.kind === "scenario")).toBe(false);
    expect(afterIntraday).toBeCloseTo((buildBridgeSteps(r).loadEnd - r.totals.imbalanceCostTl * 0.26), 0);
    expect(checkReportData(r, steps).filter((i) => i.level === "error")).toEqual([]);
    const slides = await extractSlideTexts(await exportPlantReportPptx(r));
    expect(checkIntradayText(r, slides)).toEqual([]);
    expect(slides.some((s) => s.text.includes("Gün içi düzeltmeler (zaten alınıyor)"))).toBe(true);
    const summary = await extractSlideTexts(await exportPlantReportPptx(r, {}, { summaryOnly: true }));
    expect(checkIntradayText(r, summary)).toEqual([]);
  });

  it("gün içi: eski anlatımı yakalar (gerçekleşen adımı yok, %1 senaryo ve 'en fazla %1' vaadi)", () => {
    const r = withIntraday(26, 1);
    const cost = r.totals.imbalanceCostTl;
    const old = [
      { label: "Dengesizlik riski", value: cost, kind: "total" as const },
      { label: "KÜPST (tahmini)", value: r.kupst.totalTl, kind: "kupst" as const },
      { label: "Sapma yükü", value: cost + r.kupst.totalTl, kind: "total" as const },
      { label: "Gün içi güncelleme, üst sınır (%1)", value: -0.01 * cost, kind: "scenario" as const },
      { label: "Ulaşılabilir", value: cost + r.kupst.totalTl - 0.01 * cost, kind: "target" as const },
    ];
    expect(checkIntradayBridge(r, old).map((i) => i.rule).sort()).toEqual(["intraday-realized", "intraday-scenario"]);
    const text = [{ slide: 2, text: "Tahmin hatası 2 saat önceden görülüp kısmen gün içi piyasada kapatılırsa dengesizlik riski en fazla %1 azalır." }];
    expect(checkIntradayText(r, text).map((i) => i.rule)).toEqual(["intraday-text"]);
  });

  it("gün içi: strateji gerçekleşenden fazlasını vaat ediyorsa yalnız fark ek fırsat olarak gösterilir", async () => {
    const r = withIntraday(5, 12);
    const iv = intradayView(r);
    expect(iv.extra?.pct).toBeCloseTo(7, 6);
    const { steps } = buildBridgeSteps(r);
    expect(steps.map((s) => s.kind)).toEqual(expect.arrayContaining(["realized", "scenario", "target"]));
    expect(checkReportData(r, steps).filter((i) => i.level === "error")).toEqual([]);
    expect(checkIntradayText(r, await extractSlideTexts(await exportPlantReportPptx(r)))).toEqual([]);
  });
});
