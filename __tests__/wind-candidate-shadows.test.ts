import { describe, it, expect } from "vitest";
import { windCandidateShadows } from "@/lib/wind-engine/learning/candidate-shadows";
import type { WindDataHour } from "@/lib/wind-engine/data/wind-hours";
const D = 86400000,
  H = 3600000,
  target = Date.UTC(2026, 9, 24);
const history = Array.from({ length: 5000 }, (_, i) => ({
  t: target - 300 * D + i * H,
  pred: 50,
  actual: 55,
  ws: 8,
}));
const data: WindDataHour[] = history.map((h) => ({
  t: h.t,
  uevm: h.actual,
  kgupFirst: 55,
  kgupFinal: 55,
  ptf: 200,
  ws: { d1: 8, d2: 8 },
  dir: { d1: 180, d2: 180 },
  src: {},
  realized: { ws: 8, dir: 180 },
}));
const live = [
  {
    t: target,
    pred: 50,
    ws: 8,
    dir: 180,
    ws10: null,
    temp: null,
    pred3: null,
    pred6: null,
    recent: null,
    live: true as const,
  },
];
describe("Rüzgâr düzeltme ve kısıntı gölgeleri", () => {
  it("düzeltmeyi yalnız geçmiş örneklem dışı hatalardan öğrenir", () => {
    const a = windCandidateShadows(data, history, live, target, 100, new Map());
    expect(a.correction?.[0]).toBeGreaterThan(50);
    const b = windCandidateShadows(
      [...data, { ...data[0], t: target, uevm: 999 }],
      [...history, { t: target, pred: 0, actual: 999, ws: 8 }],
      live,
      target,
      100,
      new Map()
    );
    expect(b).toEqual(a);
  });
  it("eksik eğitim veya sıfır fiyat kanıtında başarı taklidi yapmaz", () => {
    const a = windCandidateShadows([], [], live, target, 100, new Map([[target, 0.8]]));
    expect(a.correction).toBeNull();
    expect(a.curtailment).toBeNull();
  });
  it("gecikmiş etiketle öğrenilen kısma yalnız beklenen olasılıkla uygulanır", () => {
    const cut = data.map((h, i) => ({
      ...h,
      ptf: i % 10 === 0 ? 0 : 200,
      uevm: i % 10 === 0 ? 10 : 55,
    }));
    const a = windCandidateShadows(
      cut,
      history,
      live,
      target,
      100,
      new Map([[target, 0.8]])
    );
    expect(a.curtailment?.[0]).toBeLessThan(50);
    expect(a.curtailment?.[0]).toBeGreaterThanOrEqual(0);
  });
});
