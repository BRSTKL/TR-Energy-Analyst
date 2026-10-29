import { describe, expect, it } from "vitest";
import { BRIEF_RULES, buildBrief, type Signal } from "@/lib/analysis/pre-bid-brief";
import type { PreBidView } from "@/lib/analysis/pre-bid";
import type { PriceLimit } from "@/lib/analysis/price-limit";
import type { PreBidContext } from "@/lib/services/pre-bid-context";
import type { PreBidEffects } from "@/lib/services/pre-bid-effects";

type View = Extract<PreBidView, { ok: true }>;

function view(over: { load?: number; pers?: number; hiAtCap?: number } = {}): View {
  const rows = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    baseline: 3000,
    persistence: over.pers ?? 0,
    load: over.load ?? 0,
    expected: 3200,
    lo: 2700,
    hi: 3900,
    level: null,
    hiAtCap: hour < (over.hiAtCap ?? 0),
    lep: 36000,
    windF: 4000,
    net: 30000,
    actual: null,
  }));
  return {
    ok: true,
    date: "2026-10-28",
    dayClass: "weekday",
    rows,
    coefficients: { persistence: 0.3, load: 0.05, trainDays: 30 },
    backtest: {
      days: 60,
      modelMae: 450,
      baselineMae: 540,
      improvementPct: 16,
      betterDaysPct: 62,
    },
    intervalDays: 60,
    summary: {
      meanExpected: 3200,
      meanBaseline: 3000,
      vsBaselinePct: 6.7,
      peak: { hour: 20, value: 3700 },
      eveningMinusNoon: 400,
      hiAtCapHours: over.hiAtCap ?? 0,
      nearCapHours: 1,
      actualCheck: null,
    },
    warnings: [],
    sentences: [],
  } as unknown as View;
}

const limit = {
  cap: 4500,
  hoursInWindow: 44,
  hoursLast7: 19,
  windowDays: 60,
  firstSeen: "2026-04-04",
  previousCap: 3400,
  lastDay: "2026-10-26",
} as PriceLimit;

const get = (signals: Signal[], id: string) => signals.find((s) => s.id === id)!;

function ctx(over: Partial<PreBidContext> = {}): PreBidContext {
  return {
    date: "2026-10-28",
    refDay: "2026-10-27",
    gipDay: "2026-10-26",
    gas: {
      summary: {
        last: { date: "2026-10-26", tl: 20000, usdMmbtu: 10 },
        vsMedian28Pct: 8,
        vs90dPct: 3,
        fuelCost: [2000, 2400],
      },
      series: [],
    },
    curves: {
      day: "2026-10-27",
      shapes: {},
      hours: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        price: 3000,
        quantity: 30000,
        shifts: [
          { dq: -1000, price: 3000 - (hour >= 18 ? 400 : 100) },
          { dq: 1000, price: 3000 + (hour >= 18 ? 400 : 100) },
        ],
      })),
    },
    bids: {
      day: "2026-10-27",
      hours: Array.from({ length: 24 }, (_, hour) => ({ hour, ratio: 1.0, ref: 1.2 })),
    },
    gip: {
      day: "2026-10-26",
      ptf: Array(24).fill(3000),
      hours: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        volume: 100,
        vwap: 3300,
        trades: 5,
      })),
    },
    outages: {
      asOf: "",
      ongoingCount: 50,
      ongoingMw: 7000,
      carryCount: 30,
      carryMw: 3300,
      hours: [],
      typical: { median: 10000, q25: 9000, q75: 11000, days: 14 },
      top: [],
    },
    dams: {
      asOf: "2026-10-27",
      staleDays: 1,
      fetchedAt: null,
      purposes: [
        {
          purpose: "Energy",
          label: "Enerji amaçlı",
          date: "2026-10-27",
          occupancyPct: 58,
          activeVolumeMm3: 46,
          weekAgoPct: 59,
          yearAgoPct: 39,
        },
      ],
      cities: [],
      season: [],
      seasonYears: [],
    },
    neighbors: {
      day: "2026-10-27",
      daysBefore: 1,
      fx: 55,
      hours: [],
      mean: { bg: 255, gr: 224, ptfEur: 62, spreadBg: -193, netBg: 331, netGr: -171 },
      coupledPct: 63,
      targetDay: null,
      fetchedAt: null,
    },
    notes: [],
    ...over,
  } as unknown as PreBidContext;
}

const effects = (
  verdicts: Partial<Record<string, "better" | "worse" | "noise">>
): PreBidEffects =>
  ({
    rows: Object.entries(verdicts).map(([id, verdict]) => ({
      id,
      verdict,
      improvementPct: id === "sunReal" ? 2.8 : -3,
    })),
    updatedAt: "",
    unlicensedUntil: null,
    notes: [],
  }) as unknown as PreBidEffects;

describe("buildBrief: model sinyalleri", () => {
  it("net yük ve dünkü artığı eşiğe göre yönlendirir, 'modeli kurar' diye işaretler", () => {
    const hot = buildBrief({
      view: view({ load: 120, pers: -80 }),
      limit,
      ctx: null,
      effects: null,
    }).signals;
    expect(get(hot, "netload")).toMatchObject({ direction: "up", evidence: "model" });
    expect(get(hot, "persistence")).toMatchObject({
      direction: "down",
      evidence: "model",
    });
    const calm = buildBrief({
      view: view({ load: BRIEF_RULES.contributionTl, pers: 0 }),
      limit,
      ctx: null,
      effects: null,
    }).signals;
    expect(get(calm, "netload").direction).toBe("flat"); // eşiğin kendisi nötr
    expect(get(calm, "persistence").direction).toBe("flat");
  });

  it("limit sinyali: üst ucu tavana dayanan saat sayısına bakar", () => {
    expect(
      get(
        buildBrief({ view: view({ hiAtCap: 4 }), limit, ctx: null, effects: null })
          .signals,
        "limit"
      ).direction
    ).toBe("up");
    expect(
      get(
        buildBrief({ view: view({ hiAtCap: 3 }), limit, ctx: null, effects: null })
          .signals,
        "limit"
      ).direction
    ).toBe("flat");
    expect(
      buildBrief({ view: view(), limit: null, ctx: null, effects: null }).signals.find(
        (s) => s.id === "limit"
      )
    ).toBeUndefined();
  });

  it("bağlam yüklenmediyse yalnız model ve güneş kartları, 'yükleniyor' notuyla", () => {
    const b = buildBrief({ view: view(), limit, ctx: null, effects: null });
    expect(b.signals.map((s) => s.id).sort()).toEqual([
      "limit",
      "netload",
      "persistence",
      "solar",
    ]);
    expect(b.tallyLine).toContain("yükleniyor");
    expect(get(b.signals, "solar").evidence).toBe("pending");
  });
});

describe("buildBrief: bağlam sinyalleri", () => {
  const b = buildBrief({
    view: view(),
    limit,
    ctx: ctx(),
    effects: effects({
      gas: "noise",
      hydro: "noise",
      neighbor: "noise",
      sunReal: "noise",
    }),
  });

  it("her kartın yönü kurala uyar", () => {
    expect(get(b.signals, "gas")).toMatchObject({
      direction: "up",
      evidence: "tested-noise",
    }); // +%8 > %5
    expect(get(b.signals, "bids").direction).toBe("up"); // oran ref'in %16,7 altında: sıkı
    expect(get(b.signals, "gip").direction).toBe("up"); // +300 > +100
    expect(get(b.signals, "outages").direction).toBe("down"); // 7000 / 10000 = −%30
    expect(get(b.signals, "dams").direction).toBe("down"); // geçen yıldan +19 puan: su bol
    expect(get(b.signals, "neighbors").direction).toBe("up"); // PTF komşudan 193 EUR ucuz: ihracat çekişi
    expect(get(b.signals, "curve")).toMatchObject({
      direction: "info",
      evidence: "untested",
    });
  });

  it("kanıt etiketi etki ölçümünden gelir; ölçülmeyenler 'untested'", () => {
    expect(get(b.signals, "dams").evidence).toBe("tested-noise");
    expect(get(b.signals, "outages").evidence).toBe("untested");
    const better = buildBrief({
      view: view(),
      limit,
      ctx: ctx(),
      effects: effects({ gas: "better", neighbor: "worse" }),
    }).signals;
    expect(get(better, "gas").evidence).toBe("tested-better");
    expect(get(better, "neighbors").evidence).toBe("tested-worse");
  });

  it("özet satırı kanıtı açıkça söyler", () => {
    expect(b.tallyLine).toContain("tahmini kuruyor");
    expect(b.tallyLine).toContain("tahmini değiştirmez");
    expect(b.tally.model).toBe(3);
    expect(b.tally.noise).toBe(4); // gaz, baraj, komşu, güneş
  });

  it("veri yoksa kart 'missing' olur, sayıma girmez", () => {
    const x = buildBrief({
      view: view(),
      limit,
      ctx: ctx({ gas: null, dams: null, neighbors: null, outages: null }),
      effects: null,
    });
    expect(get(x.signals, "gas").missing).toBeTruthy();
    expect(get(x.signals, "neighbors").value).toBe("—");
    const counted = x.signals.filter((s) => !s.missing).length;
    expect(x.tally.up + x.tally.down + x.tally.flat + x.tally.info).toBe(counted);
  });

  it("eşiğin içindeki sapma nötr: gaz +%5 yukarı sayılmaz", () => {
    const x = buildBrief({
      view: view(),
      limit,
      ctx: ctx({
        gas: {
          summary: {
            last: { date: "2026-10-26", tl: 20000, usdMmbtu: null },
            vsMedian28Pct: 5,
            vs90dPct: null,
            fuelCost: [2000, 2400],
          },
          series: [],
        },
      }),
      effects: null,
    });
    expect(get(x.signals, "gas").direction).toBe("flat");
  });
});

describe("buildHeadline", () => {
  it("özet cümlesi ortalama, referans farkı ve tavan saatlerini söyler", () => {
    const h = buildBrief({
      view: view({ hiAtCap: 5 }),
      limit,
      ctx: null,
      effects: null,
    }).headline!;
    expect(h.line).toContain("3.200");
    expect(h.line).toContain("%7");
    expect(h.line).toContain("5 saatte");
    expect(h.meanLo).toBe(2700);
    expect(h.accuracy).toMatchObject({ improvementPct: 16, days: 60 });
  });
});

describe("buildBrief: model kurulamadığında (arife, bayram)", () => {
  it("başlık yok, bağlam sinyalleri ve güneş kartı var, özet 'yalnız bağlam' der", () => {
    const b = buildBrief({ view: null, limit, ctx: ctx(), effects: null });
    expect(b.headline).toBeNull();
    expect(b.signals.find((s) => s.id === "netload")).toBeUndefined();
    expect(b.signals.find((s) => s.id === "gas")).toBeDefined();
    expect(b.tallyLine).toContain("Model beklentisi kurulamadı");
    expect(b.tally.model).toBe(0);
  });
});

describe("buildBrief: tahmin PTF motorundan (engine)", () => {
  it("kartlar yalnız bağlam; eski güneş kartı ve 'kurulamadı' cümlesi yok", () => {
    const b = buildBrief({ view: null, limit, ctx: ctx(), effects: null, engine: true });
    expect(b.signals.find((s) => s.id === "solar")).toBeUndefined();
    expect(b.signals.find((s) => s.id === "gas")).toBeDefined();
    expect(b.tallyLine).toContain("yukarıdaki motordan");
    expect(b.tallyLine).not.toContain("kurulamadı");
  });
});
