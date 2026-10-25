import { describe, it, expect } from "vitest";
import { buildPlantReport } from "@/lib/report/plant-report";
import { anonymizeReport } from "@/lib/report/anonymize";
import { buildBridgeSteps, exportPlantReportPptx, intradayView } from "@/lib/export/plant-report-pptx";
import {
  checkAggregatorText,
  checkBridge,
  checkCapacityText,
  checkDsgText,
  checkFinalPlanText,
  checkIntradayBridge,
  checkIntradayText,
  checkReportData,
  checkSlideGeometry,
  checkSlideTables,
  checkSlideTexts,
  extractSlideTables,
  extractSlideTexts,
  parseAmount,
} from "@/lib/report/report-checks";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, type SystemDirection } from "@/lib/calculations/types";

/** İki ay, farklı sahiplerin üç santrali: saatlerin bir kısmında biri fazla, diğeri eksik üretir (netleşme olur) */
function sampleReport(context?: Parameters<typeof buildPlantReport>[1]) {
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
  }, context);
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
    expect(await checkSlideGeometry(buf)).toEqual([]);
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
  function withIntraday(realizedPct: number, strategyPct: number, tradeCostPct = 0) {
    const r = sampleReport();
    const cost = r.totals.imbalanceCostTl;
    return {
      ...r,
      finalPlan: { ...r.finalPlan, hoursWithFinal: r.finalPlan.hours, coveragePct: 100, lowPlants: [], kupstFirstPlanSharePct: 0 },
      // Son plan elle %100 sayıldığı için grup senaryosu da son planla hesaplanmış sayılır (dsg-basis)
      dsg: r.dsg ? { ...r.dsg, basis: "final" as const } : null,
      intradayEffect: {
        hoursWithFinal: r.period.hours,
        coveragePct: 100,
        firstCostTl: cost,
        finalCostTl: cost * (1 - realizedPct / 100),
        reductionPct: realizedPct,
        absDevFirstMwh: 1000,
        absDevFinalMwh: 800,
        tradeCostTl: (tradeCostPct / 100) * cost,
        planDownMwh: 100,
        planUpMwh: 50,
        tradeHoursWithoutGip: 0,
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

  it("gün içi: GİP işlem maliyeti köprüde ayrı adım, gün içi sonrası net; adım silinirse denetim yakalar", async () => {
    const r = withIntraday(26, 1, 6);
    const cost = r.totals.imbalanceCostTl;
    const { steps, loadEnd, afterIntraday } = buildBridgeSteps(r);
    const trade = steps.find((s) => s.kind === "trade");
    expect(trade?.value).toBeCloseTo(0.06 * cost, 0);
    expect(afterIntraday).toBeCloseTo(loadEnd - 0.26 * cost + 0.06 * cost, 0);
    expect(intradayView(r).realized?.netCutTl).toBeCloseTo(0.2 * cost, 0);
    expect(checkReportData(r, steps).filter((i) => i.level === "error")).toEqual([]);
    const slides = await extractSlideTexts(await exportPlantReportPptx(r));
    expect(slides.some((s) => s.text.includes("GİP işlem maliyeti"))).toBe(true);
    expect(checkSlideTexts(slides)).toEqual([]);
    // Adım gizlenirse (ve köprü yine kapanacak biçimde düzeltilirse) kural yakalar
    const hidden = steps.filter((s) => s.kind !== "trade");
    expect(checkIntradayBridge(r, hidden).map((i) => i.rule)).toContain("intraday-trade");
  });

  it("gün içi: ihmal edilebilir işlem maliyeti (%2'den az) köprüde adım olmaz", () => {
    const r = withIntraday(26, 1, 0.3);
    const { steps } = buildBridgeSteps(r);
    expect(steps.some((s) => s.kind === "trade")).toBe(false);
    expect(checkIntradayBridge(r, steps)).toEqual([]);
  });

  it("gün içi: strateji net gerçekleşenle kıyaslanır (brüt %10, işlem maliyeti %5, strateji %8 → ek %3)", () => {
    const r = withIntraday(10, 8, 5);
    const iv = intradayView(r);
    expect(iv.realized?.netPct).toBeCloseTo(5, 1);
    expect(iv.extra?.pct).toBeCloseTo(3, 1);
    expect(checkIntradayBridge(r, buildBridgeSteps(r).steps)).toEqual([]);
  });

  /** Sektördeki toplayıcıların net gün içi düzeltmesi: medyan ve en iyi çeyrek verilir (n = 8) */
  const withPeers = <T extends ReturnType<typeof withIntraday>>(r: T, median: number, top: number) => ({
    ...r,
    intradayPeers: { n: 8, medianNetPct: median, topQuartileNetPct: top, bestNetPct: top + 10, excluded: 3, rows: [] },
  });

  it("gün içi sektör kıyası: strateji en iyi çeyreğin ulaştığı seviyeyle sınırlanır (net %10, strateji %25, en iyi çeyrek %18 → ek %8)", async () => {
    const r = withPeers(withIntraday(10, 25), 12, 18);
    const iv = intradayView(r);
    expect(iv.peers?.position).toBe("belowMedian");
    expect(iv.extra?.pct).toBeCloseTo(8, 1);
    expect(iv.extra?.cappedByPeers).toBe(true);
    const { steps } = buildBridgeSteps(r);
    expect(checkIntradayBridge(r, steps)).toEqual([]);
    // Sınırsız senaryo (strateji %15 fark) denetimde yakalanır
    const cost = r.totals.imbalanceCostTl;
    const unbounded = steps.map((st) => (st.kind === "scenario" ? { ...st, value: -0.15 * cost } : st));
    expect(checkIntradayBridge(r, unbounded).map((i) => i.rule)).toContain("intraday-peers");
    const slides = await extractSlideTexts(await exportPlantReportPptx(r));
    expect(slides.some((s) => s.text.includes("en iyi çeyrek %18"))).toBe(true);
    expect(checkIntradayText(r, slides)).toEqual([]);
  });

  it("gün içi sektör kıyası: portföy en iyi çeyrekteyse ek fırsat yok, metin vaat etmez", async () => {
    const r = withPeers(withIntraday(30, 34), 12, 20);
    const iv = intradayView(r);
    expect(iv.peers?.position).toBe("top");
    expect(iv.extra).toBeNull();
    expect(buildBridgeSteps(r).steps.some((st) => st.kind === "scenario")).toBe(false);
    const slides = await extractSlideTexts(await exportPlantReportPptx(r));
    expect(slides.some((s) => s.text.includes("en iyi çeyrekte"))).toBe(true);
    expect(checkIntradayText(r, slides)).toEqual([]);
  });

  it("gün içi sektör kıyası: 5'ten az toplayıcı varsa sınırlama yapılmaz", () => {
    const r = { ...withPeers(withIntraday(10, 25), 12, 18), intradayPeers: { n: 3, medianNetPct: 12, topQuartileNetPct: 18, bestNetPct: 20, excluded: 9, rows: [] } };
    const iv = intradayView(r);
    expect(iv.peers).toBeNull();
    expect(iv.extra?.pct).toBeCloseTo(15, 1);
  });

  it("son plan kapsamı düşükse KÜPST üst sınır etiketi alır, gün içi adımı olmaz ve rapor kapsamı söyler", async () => {
    const base = sampleReport();
    const r = {
      ...base,
      finalPlan: { ...base.finalPlan, hoursWithFinal: Math.round(base.finalPlan.hours * 0.6), coveragePct: 60, kupstFirstPlanSharePct: 35, lowPlants: [{ plantName: "KARADERE 3 RES", coveragePct: 0 }] },
      intradayEffect: null,
    };
    const { steps } = buildBridgeSteps(r);
    const kupst = steps.find((s) => s.kind === "kupst")!;
    expect(kupst.label).toContain("üst sınır");
    expect(steps.some((s) => s.kind === "realized")).toBe(false);
    expect(checkIntradayBridge(r, steps)).toEqual([]);
    const relabeled = steps.map((s) => (s.kind === "kupst" ? { ...s, label: "KÜPST (tahmini)" } : s));
    expect(checkIntradayBridge(r, relabeled).map((i) => i.rule)).toContain("kupst-upper-bound");
    const slides = await extractSlideTexts(await exportPlantReportPptx(r));
    expect(checkFinalPlanText(r, slides)).toEqual([]);
    expect(slides.some((s) => s.text.includes("KARADERE 3 RES (%0)"))).toBe(true);
    expect(checkFinalPlanText(r, slides.map((s) => ({ ...s, text: s.text.replace(/Son plan \(gün içi sonrası\) saatlerin/g, "") }))).map((i) => i.rule)).toEqual(["final-plan-text"]);
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

/** Gün içi düzeltmeli örnek: son plan sapmanın yarısını kapatır (şirketler gün içinde düzeltme yapıyor) */
function sampleWithFinalPlan(context?: Parameters<typeof buildPlantReport>[1]) {
  const hours = (seed: number) =>
    Array.from({ length: 24 * 40 }, (_, i) => {
      const t = new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 24), i % 24));
      const dir: SystemDirection = (i + seed) % 3 === 0 ? "SURPLUS" : "DEFICIT";
      const err = ((i * (seed + 3)) % 7) - 3;
      const actual = Math.max(0, 20 + err);
      return processHourlyRecord(
        { timestamp: t, forecastMwh: 20, actualMwh: actual, forecastFinalMwh: 20 + (actual - 20) * 0.5 },
        { timestamp: t, ptf: 2000, smf: dir === "SURPLUS" ? 1700 : 2500, systemDirection: dir },
        DEFAULT_IMBALANCE_PROFILE
      );
    });
  return buildPlantReport(
    {
      project: { id: "p", name: "Deneme Portföyü 2026" },
      profile: DEFAULT_IMBALANCE_PROFILE,
      plants: [1, 2, 3].map((n) => ({
        plantId: `p${n}`,
        plantName: `KARADERE ${n} RES`,
        plantType: "RES",
        capacityMw: 30,
        capacitySource: "EPIAS_YEKDEM",
        organizationId: n,
        organizationName: `ÖRNEKSAHİP ${n} ENERJİ A.Ş.`,
        yekdem: false,
        yekdemNextYear: false,
        epiasPlantId: n,
        hourly: hours(n),
      })),
    },
    context
  );
}

describe("Grup (DSG) senaryosu: gün içi sonrası ve toplayıcıya katılma (Polat 2026 değerlendirmesi)", () => {
  it("son plan varsa grup faydası son planla hesaplanır; ilk planla hesaplanan daha büyük ve yalnız bağlam", async () => {
    const r = sampleWithFinalPlan();
    expect(r.dsg!.basis).toBe("final");
    expect(r.dsg!.benefitTl).toBeGreaterThan(0);
    // Gün içi düzeltme sapmayı küçülttüğü için ilk planla fayda daha büyük (gün içi kazancıyla üst üste biner)
    expect(r.dsg!.firstPlanBenefitTl).toBeGreaterThan(r.dsg!.benefitTl);
    expect(checkReportData(r, buildBridgeSteps(r).steps).filter((i) => i.level === "error")).toEqual([]);
    const slides = await extractSlideTexts(await exportPlantReportPptx(r));
    const opp = slides.find((x) => /FIRSATLAR/.test(x.text))!.text;
    expect(opp).toMatch(/Gün içi düzeltmelerden sonra kalan sapmayla hesaplandı/);
    expect(checkDsgText(r, slides)).toEqual([]);
    // Grup başlığa çıkarsa kesin değil "olası" kaldıraç
    if (/kaldıraç: .*grupta toplamak/.test(opp)) expect(opp).toMatch(/En büyük olası kaldıraç/);
  });

  it("ilk planla hesaplanmış grup, eksik katılma seçeneği ve doğrulama notu olmayan metin yakalanır", () => {
    const r = sampleWithFinalPlan({ aggregatorMembership: { asOf: "2026-09-28", byPlant: new Map([[1, ["TOPLAYICI Y"]]]) } });
    expect(r.dsg!.joinAggregator).toBeTruthy();
    const rules = checkReportData({ ...r, dsg: { ...r.dsg!, basis: "first" as const, joinAggregator: null } }).map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(["dsg-basis", "dsg-join"]));
    const text = [
      { slide: 1, text: "kapak" },
      { slide: 9, text: "FIRSATLAR En büyük kaldıraç: 2 bağımsız şirketi tek dengeden sorumlu grupta toplamak (≈ 1 milyon TL)" },
    ];
    expect(checkDsgText(r, text).map((i) => i.message).join(" ")).toMatch(/doğrulan.*gün içi sonrası.*TOPLAYICI Y.*kesin kaldıraç/);
  });

  it("tahmini kurulu güç varken toplam '~' ile yazılır; '~' olmadan yakalanır", async () => {
    const r = sampleReport(); // örnek santrallerin kurulu gücü kayıtsız: tahmin
    expect(r.plants.every((p) => p.capacityEstimated)).toBe(true);
    const slides = await extractSlideTexts(await exportPlantReportPptx(r));
    expect(slides[0].text).toMatch(/~90 MW/);
    expect(checkCapacityText(r, slides)).toEqual([]);
    expect(checkCapacityText(r, [{ slide: 1, text: "Ocak 2026 · 3 santral · 90 MW" }]).map((i) => i.rule)).toEqual(["capacity-total"]);
    // Hepsi kayıttan: işaret yok, denetim de yok
    const rec = sampleWithFinalPlan();
    expect(checkCapacityText(rec, [{ slide: 1, text: "3 santral · 90 MW" }])).toEqual([]);
  });
});

describe("Toplayıcı portföyündeki santraller ve metin denetimleri", () => {
  const membership = { aggregatorMembership: { asOf: "2026-09-28", byPlant: new Map([[1, ["TOPLAYICI Y"]]]) } };

  it("toplayıcıdaki santral grup senaryosuna girmez; özet ve fırsatlar bunu söyler, denetimden geçer", async () => {
    const r = sampleReport(membership);
    expect(r.dsg!.companyCount).toBe(2);
    expect(r.dsg!.excludedPlantNames).toEqual(["KARADERE 1 RES"]);
    expect(r.settlement.inOtherAggregator!.standaloneTl).toBeGreaterThan(0);
    // Grup faydası yalnız bağımsız iki şirketin santralleriyle: toplayıcı olmadan hesaplanan faydadan küçük
    expect(r.dsg!.benefitTl).toBeLessThan(sampleReport().dsg!.benefitTl);
    expect(checkReportData(r, buildBridgeSteps(r).steps).filter((i) => i.level === "error")).toEqual([]);
    const slides = await extractSlideTexts(await exportPlantReportPptx(r));
    expect(checkSlideTexts(slides)).toEqual([]);
    expect(checkAggregatorText(r, slides)).toEqual([]);
    const summary = slides.find((x) => /YÖNETİCİ ÖZETİ/.test(x.text))!.text;
    expect(summary).toMatch(/KARADERE 1 RES TOPLAYICI Y toplayıcı portföyünde/);
    const opp = slides.find((x) => /FIRSATLAR/.test(x.text))!.text;
    // Santrallerin biri zaten toplayıcıda: öneri bağımsızları o portföye almak (yalnız kendi aralarında grup daha küçük)
    expect(r.dsg!.joinAggregator!.aggregator).toBe("TOPLAYICI Y");
    expect(r.dsg!.joinAggregator!.benefitTl).toBeGreaterThan(r.dsg!.benefitTl);
    expect(opp).toMatch(/Kalan 2 bağımsız şirketi toplayıcı portföyüne almak/);
    expect(opp).toMatch(/KARADERE 1 RES zaten TOPLAYICI Y portföyünde/);
    expect(opp).toMatch(/doğrulayın/);
    expect(checkDsgText(r, slides)).toEqual([]);
    expect(opp).not.toMatch(/risk de bu kadar düşük/);
  });

  it("grup senaryosu toplayıcıdaki santrali sayarsa ya da özet söylemezse yakalar", () => {
    const r = sampleReport(membership);
    const bad = { ...r, dsg: { ...r.dsg!, excludedPlantNames: [] } };
    expect(checkReportData(bad).map((i) => i.rule)).toContain("dsg-aggregator");
    const issues = checkAggregatorText(r, [
      { slide: 1, text: "DENGESİZLİK KARNESİ" },
      { slide: 2, text: "YÖNETİCİ ÖZETİ Portföyün sapma yükü 234,2 milyon TL" },
    ]);
    expect(issues.map((i) => i.rule)).toEqual(["aggregator-summary"]);
  });

  it("yüzdeye yanlış Türkçe eki yakalar (%22'i → %22'si), doğruları geçirir", () => {
    const issues = checkSlideTexts([{ slide: 10, text: "riskin %22'i; %16'sı, %30'u, %25'i, %100'ü, %2'sinde, %60'ında, %2,5'i, %3'ten" }]);
    expect(issues.map((i) => i.rule)).toEqual(["pct-suffix"]);
    expect(issues[0].message).toMatch(/%22'si/);
    expect(checkSlideTexts([{ slide: 10, text: "%16'i" }])[0].message).toMatch(/%16'sı/);
  });

  it("etiket açıklaması raporda olmayan slayta atıf yaparsa yakalar", () => {
    const slides = [
      { slide: 9, text: "RİSK PRİMİ Sözleşme fiyatına eklenecek dengesizlik primi" },
      { slide: 13, text: "Etiketler VARSAYIMA BAĞLI: bir varsayıma dayanır (risk primi, adil prim paylaşımı). SENARYO" },
    ];
    const issues = checkSlideTexts(slides);
    expect(issues.map((i) => i.rule)).toEqual(["label-reference"]);
    expect(issues[0].message).toMatch(/adil prim paylaşımı/);
  });
});

describe("Ne değişti? slaytı reel kıyas", () => {
  it("kur / TÜFE varken başlıkta reel ve nominal değişim, panelde USD bekler", async () => {
    const { checkCostChangeText } = await import("@/lib/report/report-checks");
    const ok = [{ slide: 1, text: "kapak" }, { slide: 4, text: "NE DEĞİŞTİ? 2026'da MWh başına dengesizlik maliyeti enflasyon düşülünce %16 arttı (nominal %46): … Maliyet, USD/MWh" }];
    expect(checkCostChangeText({ units: {} }, ok)).toEqual([]);
    const nominalOnly = [{ slide: 1, text: "kapak" }, { slide: 4, text: "NE DEĞİŞTİ? 2026'da MWh başına dengesizlik maliyeti %46 arttı" }];
    expect(checkCostChangeText({ units: {} }, nominalOnly).map((i) => i.rule)).toEqual(["cost-change-real"]);
    expect(checkCostChangeText({ units: null }, ok).map((i) => i.rule)).toEqual(["cost-change-real"]);
    expect(checkCostChangeText({ units: {} }, [{ slide: 1, text: "kapak" }, { slide: 2, text: "özet" }]).map((i) => i.rule)).toEqual(["cost-change-slide"]);
    expect(checkCostChangeText(null, nominalOnly)).toEqual([]);
  });
});

describe("Kayıp üretim rapor kapısı", () => {
  const loss = { year: 2026, lastMonth: 5, plants: 1, eligible: 3, actualMwh: 900, plannedMwh: 60, unplannedMwh: 40, valueTl: 1000, lossPct: 10, sectorPct: 12 };
  it("oranı, kapsamı ve negatif tutarı denetler", () => {
    const report = sampleReport({ productionLoss: loss });
    expect(checkReportData(report).filter(i => i.rule.startsWith('loss-'))).toEqual([]);
    report.productionLoss = { ...loss, lossPct: 15, plants: 4, valueTl: -1 };
    expect(checkReportData(report).filter(i => i.rule.startsWith('loss-')).map(i => i.rule)).toEqual(['loss-ratio', 'loss-coverage', 'loss-values']);
  });
  it("tam raporda tahmini kayıp slaytını ve yöntemini gösterir", async () => {
    const report = sampleReport({ productionLoss: loss });
    const slides = await extractSlideTexts(await exportPlantReportPptx(report));
    expect(JSON.stringify(slides)).toContain('Güneş üretimindeki tahmini kayıp');
    expect(JSON.stringify(slides)).toContain('SARAH3');
  });
});
