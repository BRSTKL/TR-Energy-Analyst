import { describe, it, expect } from "vitest";
import { decomposeCostChange, type CostChangePeriodInput } from "@/lib/analysis/cost-change";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, type ImbalancePricingProfile, type SystemDirection } from "@/lib/calculations/types";
import { settleByCompanyGroups } from "@/lib/report/plant-report";

const CUSTOM_3: ImbalancePricingProfile = { mode: "CUSTOM", positiveSurplusCoef: 0.97, positiveOtherCoef: 0.97, negativeDeficitCoef: 1.03, negativeOtherCoef: 1.03 };

type Hour = { d: number; h: number; forecast: number; actual: number; ptf: number; smf: number; dir: SystemDirection };

const series = (year: number, hours: Hour[], profile: ImbalancePricingProfile) =>
  hours.map((x) => {
    const t = new Date(Date.UTC(year, 0, x.d, x.h));
    return processHourlyRecord({ timestamp: t, forecastMwh: x.forecast, actualMwh: x.actual }, { timestamp: t, ptf: x.ptf, smf: x.smf, systemDirection: x.dir }, profile);
  });

/** İki santral, tek uzlaştırma birimi; saatler 1–2 Ocak */
function period(year: number, label: string, profile: ImbalancePricingProfile, opts: { errorScale?: number; spread?: number; flipProfile?: boolean } = {}): CostChangePeriodInput {
  const e = opts.errorScale ?? 1;
  const sp = opts.spread ?? 400;
  const base: Array<[number, number, number, number, SystemDirection]> = [
    // gün, saat, plan, gerçekleşen (santral 1), sistem yönü
    [1, 10, 50, 50 + 10 * e, "SURPLUS"],
    [1, 11, 60, 60 - 8 * e, "DEFICIT"],
    [1, 12, 40, 40 + 5 * e, "DEFICIT"],
    [2, 10, 55, 55 - 12 * e, "SURPLUS"],
  ];
  const rows = (flip: boolean): Hour[] =>
    base.map(([d, h, f, a, dir]) => {
      const ptf = 2000 + h * 10;
      const smf = dir === "SURPLUS" ? ptf - sp : ptf + sp;
      return { d, h, forecast: f, actual: flip ? 2 * f - a : a, ptf, smf, dir };
    });
  return {
    label,
    profile,
    plants: [
      { key: "p1", name: "RES 1", unit: "org:1", hourly: series(year, rows(!!opts.flipProfile), profile) },
      {
        key: "p2",
        name: "RES 2",
        unit: "org:1",
        hourly: series(year, rows(false).map((r) => ({ ...r, forecast: 30, actual: 30 + (r.actual - r.forecast) / 2 })), profile),
      },
    ],
  };
}

const effect = (r: NonNullable<ReturnType<typeof decomposeCostChange>>, f: string) => r.effects.find((e) => e.factor === f)!.tlPerMwh;

describe("Maliyet değişimi ayrıştırması", () => {
  it("A döneminin maliyeti şirket bazında uzlaştırmayla (settleByCompanyGroups) birebir aynı", () => {
    const a = period(2025, "2025", DEFAULT_IMBALANCE_PROFILE);
    const r = decomposeCostChange(a, period(2026, "2026", DEFAULT_IMBALANCE_PROFILE))!;
    const settled = settleByCompanyGroups(
      a.plants.map((p) => ({ plantId: p.key, organizationId: 1, hourly: p.hourly })),
      DEFAULT_IMBALANCE_PROFILE
    ).flatMap((g) => g.hourly);
    const cost = settled.reduce((s, h) => s + h.imbalanceCost, 0);
    const mwh = settled.reduce((s, h) => s + h.actualMwh, 0);
    expect(r.a.costTl).toBeCloseTo(cost, 6);
    expect(r.a.unitCostTl).toBeCloseTo(cost / mwh, 9);
    expect(r.a.composition.spreadTl + r.a.composition.coefTl).toBeCloseTo(r.a.costTl, 6);
    expect(r.coverage).toMatchObject({ commonHours: 4, hoursA: 4, hoursB: 4, onlyA: [], onlyB: [] });
  });

  it("aynı veri, aynı kural: fark ve bütün kalemler sıfır", () => {
    const r = decomposeCostChange(period(2025, "2025", CUSTOM_3), period(2026, "2026", CUSTOM_3))!;
    expect(r.totalTlPerMwh).toBeCloseTo(0, 9);
    for (const e of r.effects) expect(e.tlPerMwh).toBeCloseTo(0, 9);
    expect(r.explainedPct).toBe(100);
  });

  it("yalnızca makas açılırsa farkın tamamı fiyat makası", () => {
    const r = decomposeCostChange(period(2025, "2025", CUSTOM_3), period(2026, "2026", CUSTOM_3, { spread: 700 }))!;
    expect(r.totalTlPerMwh).toBeGreaterThan(0);
    expect(effect(r, "market")).toBeCloseTo(r.totalTlPerMwh, 9);
    for (const f of ["error", "rule", "profile"]) expect(effect(r, f)).toBeCloseTo(0, 9);
    expect(r.interactionTlPerMwh).toBeCloseTo(0, 9);
    // Makas 400 → 700 TL: makas yalnızca sistemle aynı yöndeki sapmayı fiyatlar (açıkta fazla üretim PTF'ye yakın satılır);
    // aynı yöndeki net sapma MWh'ı başına tam 300 TL artar
    const sameDirMwh = (r.a.sameDirectionPct / 100) * (r.a.errorPct / 100) * r.a.actualMwh;
    expect(sameDirMwh).toBeCloseTo(27, 9);
    expect(r.b.composition.spreadTl - r.a.composition.spreadTl).toBeCloseTo(300 * sameDirMwh, 6);
  });

  it("yalnızca sapmalar büyürse farkın tamamı tahmin hatası; etkileşim yok", () => {
    const r = decomposeCostChange(period(2025, "2025", CUSTOM_3), period(2026, "2026", CUSTOM_3, { errorScale: 1.5 }))!;
    expect(r.b.errorPct).toBeGreaterThan(r.a.errorPct);
    expect(effect(r, "error")).toBeCloseTo(r.totalTlPerMwh, 9);
    for (const f of ["market", "rule", "profile"]) expect(effect(r, f)).toBeCloseTo(0, 9);
    // Aynı profil ve fiyatla sapma MWh'ı başına bedel değişmez
    expect(r.b.penaltyTlPerMwh).toBeCloseTo(r.a.penaltyTlPerMwh, 9);
  });

  it("mevzuat profili: 2025 → 2026 katsayı kuralı sistemle aynı yöndeki sapmayı %6'dan fiyatlar", () => {
    const r = decomposeCostChange(period(2025, "2025", DEFAULT_IMBALANCE_PROFILE), period(2026, "2026", DEFAULT_IMBALANCE_PROFILE))!;
    expect(effect(r, "rule")).toBeCloseTo(r.totalTlPerMwh, 9);
    for (const f of ["error", "market", "profile"]) expect(effect(r, f)).toBeCloseTo(0, 9);
    // Ek bedel yalnızca aynı yöndeki sapmada: %3 × taban fiyat
    expect(r.b.composition.coefTl).toBeGreaterThan(r.a.composition.coefTl);
    expect(r.b.composition.spreadTl).toBeCloseTo(r.a.composition.spreadTl, 6);
  });

  it("sapma yönü değişirse (profil) ve makas birlikte açılırsa: kalemler + etkileşim = fark", () => {
    const r = decomposeCostChange(period(2025, "2025", DEFAULT_IMBALANCE_PROFILE), period(2026, "2026", DEFAULT_IMBALANCE_PROFILE, { spread: 650, flipProfile: true, errorScale: 1.2 }))!;
    const sumEffects = r.effects.reduce((a, e) => a + e.tlPerMwh, 0);
    expect(sumEffects + r.interactionTlPerMwh).toBeCloseTo(r.totalTlPerMwh, 9);
    expect(r.b.unitCostTl - r.a.unitCostTl).toBeCloseTo(r.totalTlPerMwh, 9);
    expect(Math.abs(effect(r, "profile"))).toBeGreaterThan(0);
    expect(r.explainedPct).toBeGreaterThanOrEqual(0);
    expect(r.explainedPct).toBeLessThanOrEqual(100);
    expect(r.sentences[0]).toMatch(/^MWh başına dengesizlik maliyeti 2025 → 2026: /);
  });

  it("yalnızca iki dönemde de olan santraller ve saatler; 29 Şubat dışarıda; ortak santral yoksa null", () => {
    const a = period(2024, "2024", CUSTOM_3);
    const b = period(2025, "2025", CUSTOM_3);
    // A'da fazladan santral ve 29 Şubat saati, B'de fazladan bir saat
    a.plants.push({ key: "p3", name: "RES 3", unit: "org:2", hourly: series(2024, [{ d: 1, h: 10, forecast: 5, actual: 9, ptf: 2000, smf: 1500, dir: "SURPLUS" }], CUSTOM_3) });
    const leap = new Date(Date.UTC(2024, 1, 29, 10));
    a.plants[0].hourly.push(processHourlyRecord({ timestamp: leap, forecastMwh: 10, actualMwh: 20 }, { timestamp: leap, ptf: 2000, smf: 1000, systemDirection: "SURPLUS" }, CUSTOM_3));
    b.plants[1].hourly.push(...series(2025, [{ d: 3, h: 9, forecast: 10, actual: 5, ptf: 2000, smf: 2600, dir: "DEFICIT" }], CUSTOM_3));
    const r = decomposeCostChange(a, b)!;
    expect(r.coverage).toMatchObject({ commonHours: 4, hoursA: 4, hoursB: 5, commonPlants: ["RES 1", "RES 2"], onlyA: ["RES 3"], onlyB: [] });
    expect(r.totalTlPerMwh).toBeCloseTo(0, 9);
    expect(decomposeCostChange(a, { ...b, plants: [{ ...b.plants[0], key: "x" }] })).toBeNull();
  });
});
