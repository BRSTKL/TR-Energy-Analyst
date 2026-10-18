import { describe, it, expect } from "vitest";
import { buildScorecard, dailyClearness, skyClass, type ScorecardPlantData } from "@/lib/forecast/scorecard";
import { evaluateForecasts } from "@/lib/forecast/production-backtest";
import { FORECAST_LOG_SCHEMA, type ForecastLog } from "@/lib/forecast/forecast-log";
import { clearSkyGhiHour } from "@/lib/forecast/solar-geometry";
import type { MarketPriceRecord } from "@/lib/calculations/types";

const H = 3_600_000;
const D = 24 * H;
const site = { latitude: 38, longitude: 33 };
const day = (s: string) => Date.parse(`${s}T00:00:00Z`);

const log = (date: string, hours: Array<number | null>, opts: { onTime?: boolean; model?: string; plants?: number[] } = {}): ForecastLog => ({
  schema: FORECAST_LOG_SCHEMA,
  tech: "GES",
  targetDate: date,
  issuedAt: `${date}T00:00:00.000Z`,
  cutoff: `${date}T00:00:00.000Z`,
  onTime: opts.onTime ?? true,
  model: { id: opts.model ?? "m1", trainingMonths: 4 },
  weather: { source: "test", model: "test", runInit: null },
  code: null,
  plants: (opts.plants ?? [1]).map((id) => ({ epiasPlantId: id, name: `S${id}`, status: "ok", hours, location: { latitude: 38, longitude: 33, locationSource: id === 2 ? "DISTRICT_CENTER" : "GEM_TRACKER" } })),
});

/** Gün boyu: gerçekleşen 10 MWh (12:00–14:00), KGÜP 9; uydu ışınımı açık gök × oran */
function plant(dates: string[], kt: number, source: "UEVM" | "GZÜ" = "UEVM"): ScorecardPlantData {
  const realized: ScorecardPlantData["realized"] = new Map();
  const kgupFirst = new Map<number, number | null>();
  const sat: ScorecardPlantData["sat"] = new Map();
  for (const d of dates)
    for (let h = 0; h < 24; h++) {
      const t = day(d) + h * H;
      const on = h >= 12 && h <= 14;
      realized.set(t, { mwh: on ? 10 : 0, source });
      kgupFirst.set(t, on ? 9 : 0);
      sat.set(t, { ghi: clearSkyGhiHour(site.latitude, site.longitude, t) * kt, direct: 0, diffuse: 0 });
    }
  return { name: "S", site, realized, kgupFirst, sat };
}

const market = (dates: string[]) =>
  new Map<number, MarketPriceRecord>(
    dates.flatMap((d) =>
      Array.from({ length: 24 }, (_, h) => {
        const t = day(d) + h * H;
        return [t, { timestamp: new Date(t), ptf: 2000, smf: 2500, systemDirection: "DEFICIT", imbalancePosPrice: null, imbalanceNegPrice: null }] as const;
      })
    )
  );

const fc = Array.from({ length: 24 }, (_, h) => (h >= 12 && h <= 14 ? 12 : 0));

describe("tahmin karnesi (21.4)", () => {
  it("gök durumu: açıklık oranı eşikleri; uydu eksikse bilinmiyor", () => {
    expect(skyClass(0.95)).toBe("açık");
    expect(skyClass(0.6)).toBe("parçalı");
    expect(skyClass(0.3)).toBe("kapalı");
    expect(skyClass(null)).toBe("bilinmiyor");
    const t0 = day("2026-09-15");
    expect(dailyClearness(t0, site, (t) => clearSkyGhiHour(38, 33, t) * 0.7)).toBeCloseTo(0.7, 6);
    expect(dailyClearness(t0, site, () => null)).toBeNull();
  });

  it("maliyet geriye dönük testin fiyatlamasıyla aynı; KGÜP aynı saatlerde; geçici saatler sayılır", () => {
    const dates = ["2026-09-15", "2026-09-16"];
    const p = plant(dates, 0.95, "GZÜ");
    const m = market(dates);
    const card = buildScorecard({ from: dates[0], to: dates[1], logs: dates.map((d) => log(d, fc)), plants: new Map([[1, p]]), market: m });
    expect(card.rows).toHaveLength(1);
    const r = card.rows[0];
    const hours = dates.flatMap((d) => fc.map((f, i) => ({ t: day(d) + i * H, uevm: p.realized.get(day(d) + i * H)!.mwh, ptf: null, f, k: p.kgupFirst.get(day(d) + i * H)! })));
    const ref = evaluateForecasts(hours, { a: (h) => h.f, b: (h) => h.k }, m, "GES");
    expect(r.all.model.totalTl).toBeCloseTo(ref.a.totalTl, 6);
    expect(r.all.kgup.totalTl).toBeCloseTo(ref.b.totalTl, 6);
    expect(r.all.model.maePct).toBeCloseTo((2 / 10) * 100, 6);
    expect(r.all.provisionalHours).toBe(48);
    expect(card.provisionalHours).toBe(48);
    expect(r.bySky["açık"].model.hours).toBe(r.exLoss.model.hours);
    expect(r.scoredDays).toBe(2);
  });

  it("kayıt yok, geç kayıt, santral boşluğu, gerçekleşeni gelmemiş gün; model sürümü ve konum ayrımı", () => {
    const dates = ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];
    const p1 = plant(dates.slice(0, 3), 0.3);
    const p2 = plant(dates.slice(0, 3), 0.3);
    const logs = [log(dates[0], fc, { plants: [1, 2] }), log(dates[1], fc, { onTime: false, plants: [1, 2] }), log(dates[2], fc, { model: "m2", plants: [1] }), log(dates[3], fc, { model: "m2", plants: [1, 2] })];
    const card = buildScorecard({ from: "2026-09-14", to: dates[3], logs, plants: new Map([[1, p1], [2, p2]]), market: market(dates) });
    expect(card.missingDays).toEqual([
      { date: "2026-09-14", reason: "kayıt yok" },
      { date: dates[1], reason: "geç kayıt" },
    ]);
    expect(card.plantGaps).toEqual([{ date: dates[2], epiasPlantId: 2, name: "S", reason: "kayıtta yok" }]);
    expect(card.pendingDays).toEqual([dates[3]]);
    expect(card.groups.map((g) => g.modelId)).toEqual(["m1", "m2"]);
    const m1 = card.groups[0];
    expect(m1.plants).toBe(2);
    expect(m1.byLocation["kayıt"].plants).toBe(1);
    expect(m1.byLocation["~ ilçe merkezi"].plants).toBe(1);
    expect(m1.bySky["kapalı"].model.hours).toBeGreaterThan(0);
    // Gerçekleşeni olmayan gün sayılmaz ama kayıt günü sayılır
    const r = card.rows.find((x) => x.epiasPlantId === 1 && x.modelId === "m2")!;
    expect(r.days).toBe(2);
    expect(r.scoredDays).toBe(1);
  });
});
