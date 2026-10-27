import { describe, expect, it } from "vitest";
import {
  bidOfferRatios,
  curveEquilibrium,
  curveHour,
  downsampleCurve,
  gasFuelCost,
  gipHours,
  outageOutlook,
  summarizeGas,
  type CurvePoint,
} from "@/lib/analysis/pre-bid-context";

/** Yapay eğri: talep 20.000 MW'tan 100 MW/100 TL ile azalır, arz 15.000'den 250 MW/100 TL ile artar; fiyat 0–4.500 */
const curve: CurvePoint[] = Array.from({ length: 46 }, (_, i) => [
  i * 100,
  -(15000 + i * 250),
  20000 - i * 100,
]);

describe("curveEquilibrium", () => {
  it("talep ve arzın kesiştiği fiyatı ve miktarı verir", () => {
    // 20000 − 100 i = 15000 + 250 i → i = 14,29 → fiyat ≈ 1.429, miktar ≈ 18.571
    const e = curveEquilibrium(curve)!;
    expect(e.price).toBeCloseTo(1428.6, 0);
    expect(e.quantity).toBeCloseTo(18571, -1);
  });
  it("talep kayınca fiyat aynı yönde değişir", () => {
    const up = curveEquilibrium(curve, 1000)!.price;
    const down = curveEquilibrium(curve, -1000)!.price;
    expect(up).toBeGreaterThan(1428.6);
    expect(down).toBeLessThan(1428.6);
    expect(curveEquilibrium(curve, 1000)!.price).toBeCloseTo(
      ((5000 + 1000) / 350) * 100,
      0
    );
  });
  it("kesişmiyorsa uç değer, kısa eğride null", () => {
    expect(curveEquilibrium(curve, 100000)!.price).toBe(4500);
    expect(curveEquilibrium(curve.slice(0, 3))).toBeNull();
  });
  it("curveHour dört kaymayı hesaplar", () => {
    const h = curveHour(19, curve)!;
    expect(h.shifts.map((s) => s.dq)).toEqual([-2000, -1000, 1000, 2000]);
    expect(h.shifts[0].price).toBeLessThan(h.shifts[3].price);
  });
  it("seyreltme uç noktaları korur", () => {
    const d = downsampleCurve(curve, 10, 4500);
    expect(d).toHaveLength(10);
    expect(d[0]).toEqual(curve[0]);
    expect(d[9]).toEqual(curve[45]);
  });
});

describe("gaz", () => {
  it("yakıt maliyetini verime göre hesaplar", () => {
    expect(gasFuelCost(19200, 0.5)).toBeCloseTo(4000, 0);
    expect(gasFuelCost(19200, 0.45)).toBeGreaterThan(gasFuelCost(19200, 0.55));
  });
  it("son değeri, 28 gün medyanına göre değişimi ve 90 gün öncesini verir", () => {
    const s = Array.from({ length: 100 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      tl: 10000 + i * 100,
    }));
    const g = summarizeGas(s)!;
    expect(g.last.tl).toBe(19900);
    expect(g.vsMedian28Pct).toBeGreaterThan(0);
    expect(g.vs90dPct).toBeCloseTo((19900 / 10900 - 1) * 100, 5);
    expect(g.fuelCost[0]).toBeLessThan(g.fuelCost[1]);
    expect(summarizeGas([])).toBeNull();
  });
});

describe("teklif oranı ve gün içi", () => {
  it("satış / alış oranını ve ortancayı saat bazında verir", () => {
    const mk = (b: number, o: number) => ({
      bid: Array(24).fill(b),
      offer: Array(24).fill(o),
    });
    const r = bidOfferRatios(
      mk(100, 120),
      Array.from({ length: 8 }, () => mk(100, 130))
    );
    expect(r[3].ratio).toBeCloseTo(1.2, 5);
    expect(r[3].ref).toBeCloseTo(1.3, 5);
    expect(bidOfferRatios(mk(100, 120), [mk(100, 130)])[0].ref).toBeNull();
  });
  it("saatlik kontratlardan hacim ve ağırlıklı fiyatı çıkarır, başka günü ve blok kontratı atar", () => {
    const h = gipHours(
      [
        { contractName: "PH26102614", price: 3000, quantity: 10 },
        { contractName: "PH26102614", price: 4000, quantity: 30 },
        { contractName: "PH26102514", price: 1, quantity: 5 },
        { contractName: "PB26102614", price: 1, quantity: 5 },
      ],
      "2026-10-26"
    );
    expect(h[14].volume).toBe(4);
    expect(h[14].vwap).toBeCloseTo(3750, 5);
    expect(h[14].trades).toBe(2);
    expect(h[13].vwap).toBeNull();
  });
});

describe("outageOutlook", () => {
  const now = Date.parse("2026-10-27T15:00:00Z"); // 18:00 Türkiye
  const m = (
    id: number,
    start: string,
    end: string | null,
    power: number,
    cap: number
  ) => ({
    id,
    uevcbName: `S${id}`,
    caseStartDate: start,
    caseEndDate: end,
    operatorPower: power,
    capacityAtCaseTime: cap,
  });

  it("süreni, yarına sarkanı ve saatlik eğriyi hesaplar; ileri tarihli ve kaybı 0 olanı atlar", () => {
    const list = [
      m(1, "2026-10-27T10:00:00+03:00", "2026-10-27T20:00:00+03:00", 100, 40), // 60 MW, yarın 00:00'dan önce biter
      m(2, "2026-10-26T10:00:00+03:00", "2026-10-28T10:00:00+03:00", 50, 0), // 50 MW, yarın 10:00'a kadar
      m(3, "2026-10-27T09:00:00+03:00", null, 30, 10), // bitişi bilinmiyor: yarını kapsıyor sayılır
      m(4, "2026-10-28T09:00:00+03:00", "2026-10-28T12:00:00+03:00", 500, 0), // henüz başlamadı
      m(5, "2026-10-27T09:00:00+03:00", "2026-10-30T09:00:00+03:00", 20, 20), // kayıp yok
      m(2, "2026-10-26T10:00:00+03:00", "2026-10-28T10:00:00+03:00", 50, 0), // aynı kimlik
    ];
    const o = outageOutlook(list, "2026-10-28", now);
    expect(o.ongoingCount).toBe(3);
    expect(o.ongoingMw).toBe(60 + 50 + 20);
    expect(o.carryCount).toBe(2);
    expect(o.carryMw).toBe(70);
    expect(o.hours[0].mw).toBe(70);
    expect(o.hours[9].mw).toBe(70);
    expect(o.hours[10].mw).toBe(20); // 2 numara bitti
    expect(o.top[0]).toMatchObject({ name: "S2", lostMw: 50, until: "2026-10-28 10:00" });
    expect(o.top[1].until).toBeNull();
  });
});
