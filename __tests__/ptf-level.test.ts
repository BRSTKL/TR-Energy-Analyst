import { describe, expect, it } from "vitest";
import {
  applySunBreakFactor,
  SUN_BREAK_FACTOR,
  SUN_SERIES_BREAK,
} from "@/lib/ptf/features";
import { rawFromLog, type PtfForecastLog } from "@/lib/ptf/forecast-log";
import type { PtfDay } from "@/lib/ptf/history";
import { applyLevel, correctLevel, LEVEL_GAMMA, levelAdjustment } from "@/lib/ptf/level";
import type { DayResult } from "@/lib/ptf/replay";

const flat = (v: number) => Array<number>(24).fill(v);

describe("levelAdjustment", () => {
  it("γ × dünkü günlük ortalama hata (gerçek − ham tahmin)", () => {
    expect(LEVEL_GAMMA).toBe(0.5);
    expect(levelAdjustment(flat(3000), flat(2000))).toBe(500);
    expect(levelAdjustment(flat(1000), flat(1600))).toBe(-300);
  });
  it("dünkü kayıt ya da gerçekleşen yoksa ya da eksikse 0", () => {
    expect(levelAdjustment(null, flat(2000))).toBe(0);
    expect(levelAdjustment(flat(3000), null)).toBe(0);
    expect(levelAdjustment(flat(3000), [1, 2, 3])).toBe(0);
    expect(levelAdjustment([...flat(3000).slice(0, 23), NaN], flat(2000))).toBe(0);
  });
  it("kırpma dünkü hatayı sınırlar", () => {
    expect(levelAdjustment(flat(5000), flat(1000), 0.5, 600)).toBe(300);
    expect(levelAdjustment(flat(0), flat(4000), 0.5, 600)).toBe(-300);
  });
});

describe("applyLevel", () => {
  it("[0, tavan] içinde kalır", () => {
    expect(applyLevel([100, 4400, 2000], 300, 4500)).toEqual([400, 4500, 2300]);
    expect(applyLevel([100, 4400], -300, 4500)).toEqual([0, 4100]);
  });
  it("tavan yoksa üst sınır yok", () => {
    expect(applyLevel([4400], 300, null)).toEqual([4700]);
  });
});

describe("correctLevel", () => {
  const day = (d: string, actual: number, pred: number): DayResult => ({
    day: d,
    actual: flat(actual),
    preds: { ENS: flat(pred) },
  });

  it("ilk gün ve ardışık olmayan gün düzeltilmez", () => {
    const r = correctLevel(
      [
        day("2026-03-01", 3000, 2000),
        day("2026-03-02", 3000, 2000),
        day("2026-03-05", 3000, 2000),
      ],
      "ENS",
      "COR",
      0.5,
      null,
      null
    );
    expect(r[0].preds.COR[0]).toBe(2000);
    expect(r[1].preds.COR[0]).toBe(2500); // dün 1.000 saptı → +500
    expect(r[2].preds.COR[0]).toBe(2000); // 03-04 kaydı yok
  });

  it("hata düzeltilmemiş tahminden hesaplanır: geri besleme yok", () => {
    const r = correctLevel(
      [
        day("2026-03-01", 3000, 2000),
        day("2026-03-02", 3000, 2000),
        day("2026-03-03", 3000, 2000),
      ],
      "ENS",
      "COR",
      0.5,
      null,
      null
    );
    // üçüncü gün de +500: ikinci günün düzeltilmiş (2.500) tahmininden değil ham (2.000) tahmininden hesaplanır
    expect(r[2].preds.COR[0]).toBe(2500);
  });

  it("sabit tavan ve tavansız kırpma", () => {
    const rs = [day("2026-03-01", 4500, 1000), day("2026-03-02", 4500, 4400)];
    expect(correctLevel(rs, "ENS", "COR", 0.5, null, 4500)[1].preds.COR[0]).toBe(4500);
    expect(
      correctLevel(rs, "ENS", "COR", 0.5, null, null)[1].preds.COR[0]
    ).toBeGreaterThan(4500);
  });

  it("tavan verilmezse önceki günlerin sıkça görülen en yüksek fiyatı", () => {
    const rs = [
      {
        day: "2026-03-01",
        actual: [...flat(3000).slice(0, 20), 4500, 4500, 4500, 4500],
        preds: { ENS: flat(1000) },
      },
      day("2026-03-02", 4500, 4400),
    ];
    expect(correctLevel(rs, "ENS", "COR", 0.5)[1].preds.COR[0]).toBe(4500);
  });
});

describe("rawFromLog: dünkü kayıttan düzeltilmemiş tahmin", () => {
  const base = (over: Partial<PtfForecastLog>): PtfForecastLog => ({
    format: 1,
    targetDate: "2026-10-30",
    issuedAt: "2026-10-29T09:03:00.000Z",
    cutoff: "2026-10-29T09:05:00.000Z",
    onTime: true,
    modelId: "ptf-ens-v1",
    hours: [],
    members: { "LEAR-ridge": flat(2000), GBM: flat(3000) },
    inputs: { windKind: 1, fallbacks: [], live: [] },
    band: { days: 60, recentMae: 300 },
    cap: 4500,
    ...over,
  });

  it("level.raw varsa onu verir", () => {
    const log = base({
      level: {
        gamma: 0.5,
        applied: {},
        raw: { "ptf-ens-v1": flat(2700), "ptf-ens-v1-hidro": flat(2800) },
      },
    });
    expect(rawFromLog(log, "ptf-ens-v1")).toEqual(flat(2700));
    expect(rawFromLog(log, "ptf-ens-v1-hidro")).toEqual(flat(2800));
  });
  it("eski kayıtta ana sürüm için iki üyenin ortalaması; gölge sürüm için yok", () => {
    const log = base({});
    expect(rawFromLog(log, "ptf-ens-v1")).toEqual(flat(2500));
    expect(rawFromLog(log, "ptf-ens-v1-hidro")).toBeNull();
  });
  it("kayıt yoksa null", () => {
    expect(rawFromLog(null, "ptf-ens-v1")).toBeNull();
    expect(rawFromLog(undefined, "ptf-ens-v1")).toBeNull();
  });
});

describe("güneş serisi kırılma düzeltmesi", () => {
  const mk = (sun: number[] | undefined): PtfDay => ({
    ptf: null,
    lep: null,
    cons: null,
    windRt: null,
    sunRt: null,
    kgup: sun ? { sun, dam: flat(100) } : {},
    windF: null,
    gas: null,
  });

  it("yalnız kırılma öncesi günlerin KGÜP güneşi çarpılır", () => {
    expect(SUN_SERIES_BREAK).toBe("2025-03-11");
    expect(SUN_BREAK_FACTOR).toBeCloseTo(5.08, 2);
    const days = new Map<string, PtfDay>([
      ["2025-03-10", mk(flat(100))],
      ["2025-03-11", mk(flat(100))],
      ["2025-02-01", mk(undefined)],
    ]);
    applySunBreakFactor(days);
    expect(days.get("2025-03-10")!.kgup.sun).toEqual(flat(100 * SUN_BREAK_FACTOR));
    expect(days.get("2025-03-11")!.kgup.sun).toEqual(flat(100));
    expect(days.get("2025-03-10")!.kgup.dam).toEqual(flat(100)); // diğer kaynaklara dokunmaz
    expect(days.get("2025-02-01")!.kgup.sun).toBeUndefined();
  });
  it("çarpan parametreyle değişir", () => {
    const days = new Map<string, PtfDay>([["2025-01-01", mk(flat(10))]]);
    applySunBreakFactor(days, 2);
    expect(days.get("2025-01-01")!.kgup.sun).toEqual(flat(20));
  });
});
