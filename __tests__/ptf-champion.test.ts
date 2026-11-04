import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  championAt,
  currentChampion,
  dailyMaeByModel,
  EMPTY_REGISTRY,
  enoughHistory,
  PTF_BASE_MODEL,
  PTF_MIN_GAIN,
  PTF_SHADOW_AVG_WIND,
  PTF_SHADOW_HYDRO,
  REVIEW_EVERY_DAYS,
  reviewPtfChampion,
  reviewWindow,
  type PtfChampionRegistry,
} from "@/lib/ptf/champion";
import { readPtfChampion, writePtfChampion } from "@/lib/ptf/champion-store";
import type { PtfForecastLog } from "@/lib/ptf/forecast-log";

const day = (i: number) => new Date(Date.parse("2026-11-13T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
const flat = (v: number) => Array(24).fill(v);

function log(date: string, over: Partial<PtfForecastLog> & { p50?: number } = {}): PtfForecastLog {
  const { p50 = 3000, ...rest } = over;
  return {
    format: 1,
    targetDate: date,
    issuedAt: "x",
    cutoff: "x",
    onTime: true,
    modelId: PTF_BASE_MODEL,
    hours: flat(p50).map((v, hour) => ({ hour, p50: v, q10: null, q90: null })),
    members: {},
    inputs: { windKind: 1, fallbacks: [], live: [] },
    band: { days: 0, recentMae: null },
    cap: 4500,
    ...rest,
  } as PtfForecastLog;
}

/** 28 gün: temel sürümün günlük hatası 400 (dalgalı), aday temelin `ratio` katı */
function daily(ratio: number, extra: Record<string, number> = {}) {
  const base: Record<string, number> = {};
  const cand: Record<string, number> = {};
  for (let i = 0; i < 28; i++) {
    base[day(i)] = 400 + (i % 5) * 20;
    cand[day(i)] = base[day(i)] * ratio;
  }
  const d: Record<string, Record<string, number>> = { [PTF_BASE_MODEL]: base, [PTF_SHADOW_AVG_WIND]: cand };
  for (const [id, r] of Object.entries(extra)) d[id] = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v * r]));
  return d;
}

const opts = { effective: day(28), firstDay: day(0), ready: true, now: new Date("2026-12-11T10:00:00Z") };

describe("championAt / currentChampion", () => {
  it("defter boşken temel sürüm", () => {
    expect(currentChampion(EMPTY_REGISTRY)).toBe(PTF_BASE_MODEL);
    expect(championAt(EMPTY_REGISTRY, "2026-11-20")).toBe(PTF_BASE_MODEL);
  });
  it("geçmiş gün için o gün canlı olan sürüm", () => {
    const reg: PtfChampionRegistry = {
      updatedAt: "x",
      state: {
        modelId: PTF_SHADOW_HYDRO,
        since: "2026-12-11",
        history: [{ modelId: PTF_BASE_MODEL, from: "2026-11-01", to: "2026-12-11", reason: "r" }],
      },
    };
    expect(championAt(reg, "2026-12-11")).toBe(PTF_SHADOW_HYDRO);
    expect(championAt(reg, "2026-12-20")).toBe(PTF_SHADOW_HYDRO);
    expect(championAt(reg, "2026-11-15")).toBe(PTF_BASE_MODEL);
    expect(championAt(reg, "2026-10-01")).toBe(PTF_BASE_MODEL);
  });
});

describe("dailyMaeByModel", () => {
  it("ana tahmin ve gölgeler, kesimden sonra yazılan kayıt ve gerçekleşensiz gün atlanır", () => {
    const logs = [
      log("2026-11-10", { shadow: { [PTF_SHADOW_HYDRO]: flat(3100) } }),
      log("2026-11-11", { onTime: false }),
      log("2026-11-12"),
    ];
    const actual = (d: string) => (d === "2026-11-12" ? null : flat(3200));
    const out = dailyMaeByModel(logs, actual);
    expect(out[PTF_BASE_MODEL]).toEqual({ "2026-11-10": 200 });
    expect(out[PTF_SHADOW_HYDRO]).toEqual({ "2026-11-10": 100 });
  });
  it("modelId değişince ana tahmin o sürümün adıyla sayılır", () => {
    const l = log("2026-11-10", { modelId: PTF_SHADOW_AVG_WIND, p50: 3150, shadow: { [PTF_BASE_MODEL]: flat(3300) } });
    const out = dailyMaeByModel([l], () => flat(3200));
    expect(out[PTF_SHADOW_AVG_WIND]["2026-11-10"]).toBe(50);
    expect(out[PTF_BASE_MODEL]["2026-11-10"]).toBe(100);
  });
  it("24 saatten kısa dizi sayılmaz", () => {
    const out = dailyMaeByModel([log("2026-11-10", { shadow: { [PTF_SHADOW_HYDRO]: [1, 2, 3] } })], () => flat(3000));
    expect(out[PTF_SHADOW_HYDRO]).toBeUndefined();
  });
});

describe("reviewPtfChampion", () => {
  it("%4 daha iyi aday %3 eşikte terfi eder; defter geçmişle yazılır", () => {
    const r = reviewPtfChampion(EMPTY_REGISTRY, daily(0.96), opts);
    expect(r.reviewed).toBe(true);
    expect(r.decision?.to).toBe(PTF_SHADOW_AVG_WIND);
    expect(r.registry.state).toMatchObject({ modelId: PTF_SHADOW_AVG_WIND, since: day(28) });
    expect(r.registry.state?.history).toEqual([
      { modelId: PTF_BASE_MODEL, from: day(0), to: day(28), reason: expect.stringContaining("terfi") },
    ]);
  });
  it("%2 daha iyi aday eşiğin altında kalır (eşik %3); sınama yapıldığı deftere yazılır", () => {
    expect(PTF_MIN_GAIN).toBe(0.03);
    const r = reviewPtfChampion(EMPTY_REGISTRY, daily(0.98), opts);
    expect(r.decision).toBeNull();
    expect(r.reviewed).toBe(true);
    expect(r.registry.state).toBeNull();
    expect(r.registry.reviewedOn).toBe(day(28));
  });
  it("sınama haftada en çok bir kez: karar çıkmasa da bir hafta içinde yeniden bakılmaz", () => {
    expect(REVIEW_EVERY_DAYS).toBe(7);
    const first = reviewPtfChampion(EMPTY_REGISTRY, daily(0.98), opts);
    // ertesi gün aday çok daha iyi olsa da sınama yok (aynı pencereyi tekrar denemek yanlış terfi şansını artırır)
    const next = reviewPtfChampion(first.registry, daily(0.9), { ...opts, effective: day(29) });
    expect(next.decision).toBeNull();
    expect(next.reviewed).toBe(false);
    expect(next.registry).toBe(first.registry);
    // altı gün sonra hâlâ yok; yedinci günde sınanır ve terfi eder
    expect(reviewPtfChampion(first.registry, daily(0.9), { ...opts, effective: day(34) }).reviewed).toBe(false);
    const later = reviewPtfChampion(first.registry, daily(0.9), { ...opts, effective: day(35) });
    expect(later.decision?.to).toBe(PTF_SHADOW_AVG_WIND);
    expect(later.registry.reviewedOn).toBe(day(35));
  });
  it("aday daha kötüyse terfi yok", () => {
    expect(reviewPtfChampion(EMPTY_REGISTRY, daily(1.05), opts).decision).toBeNull();
  });
  it("birden çok aday geçerse hatayı en çok düşüren seçilir", () => {
    const r = reviewPtfChampion(EMPTY_REGISTRY, daily(0.96, { [PTF_SHADOW_HYDRO]: 0.9 }), opts);
    expect(r.decision?.to).toBe(PTF_SHADOW_HYDRO);
  });
  it("kayıt geçmişi yetmezse (ready false) karar yok", () => {
    expect(reviewPtfChampion(EMPTY_REGISTRY, daily(0.9), { ...opts, ready: false }).decision).toBeNull();
  });
  it("20 ortak günden azsa karar yok", () => {
    const d = daily(0.9);
    for (const id of Object.keys(d)) for (let i = 0; i < 12; i++) delete d[id][day(i)];
    expect(reviewPtfChampion(EMPTY_REGISTRY, d, opts).decision).toBeNull();
  });
  it("bekleme süresinde (son değişiklikten 28 gün) karar yok", () => {
    const reg: PtfChampionRegistry = {
      updatedAt: "x",
      state: { modelId: PTF_BASE_MODEL, since: day(10), history: [] },
    };
    expect(reviewPtfChampion(reg, daily(0.9), opts).decision).toBeNull();
  });
  it("canlı sürüm temel sürüme göre kötüleşirse temele dönülür", () => {
    const reg: PtfChampionRegistry = {
      updatedAt: "x",
      state: { modelId: PTF_SHADOW_AVG_WIND, since: "2026-10-01", history: [] },
    };
    // temel sürüm canlı sürümden %5 daha iyi: aday oran 1/0.95
    const r = reviewPtfChampion(reg, daily(1 / 0.95), opts);
    expect(r.decision?.to).toBe(PTF_BASE_MODEL);
    expect(r.decision?.reason).toContain("geri dönüş");
    expect(r.registry.state?.history.at(-1)).toMatchObject({ modelId: PTF_SHADOW_AVG_WIND, to: day(28) });
  });
  it("canlı sürümün karnede günü yoksa temele dönülür", () => {
    const reg: PtfChampionRegistry = {
      updatedAt: "x",
      state: { modelId: PTF_SHADOW_HYDRO, since: "2026-10-01", history: [] },
    };
    expect(reviewPtfChampion(reg, daily(1), opts).decision?.to).toBe(PTF_BASE_MODEL);
  });
  it("karar tekrarlanabilir", () => {
    const a = reviewPtfChampion(EMPTY_REGISTRY, daily(0.96), opts);
    const b = reviewPtfChampion(EMPTY_REGISTRY, daily(0.96), opts);
    expect(a.decision?.reason).toBe(b.decision?.reason);
  });
});

describe("enoughHistory / reviewWindow", () => {
  it("ilk kayıttan 28 gün dolmadan hazır değil", () => {
    expect(enoughHistory(null, "2026-12-10")).toBe(false);
    expect(enoughHistory("2026-11-13", "2026-12-09")).toBe(false);
    expect(enoughHistory("2026-11-13", "2026-12-10")).toBe(true);
  });
  it("pencere hedefin bir öncesinde biter ve 28 gün sürer", () => {
    expect(reviewWindow("2026-12-11")).toEqual({ from: "2026-11-13", to: "2026-12-10" });
  });
});

describe("defter dosyası", () => {
  let dir: string;
  const prev = process.env.POOL_DIR;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ptf-champ-"));
    process.env.POOL_DIR = dir;
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.POOL_DIR;
    else process.env.POOL_DIR = prev;
    await fs.rm(dir, { recursive: true, force: true });
  });
  it("yoksa boş defter; yazılan geri okunur", async () => {
    expect((await readPtfChampion()).state).toBeNull();
    const reg: PtfChampionRegistry = {
      updatedAt: "2026-12-11T10:00:00.000Z",
      state: { modelId: PTF_SHADOW_HYDRO, since: "2026-12-11", history: [] },
    };
    await writePtfChampion(reg);
    expect(await readPtfChampion()).toEqual(reg);
  });
});
