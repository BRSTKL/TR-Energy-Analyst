import { describe, it, expect } from "vitest";
import { fitWindForecast, type WindFcHour } from "@/lib/forecast/wind-forecast";
const H = 3600000,
  start = Date.UTC(2025, 0, 1);
const train: WindFcHour[] = Array.from({ length: 1000 }, (_, i) => ({
  t: start + i * H,
  uevm: 10,
  kgupFirst: 10,
  ws: { d1: 8, d2: 8 },
  dir: { d1: 180, d2: 180 },
}));
const opts = { lead: "d2" as const, trainingEnd: start + 1001 * H };
describe("Rüzgâr canlı bilgi zamanı sınırı", () => {
  it("canlı işaretli saati eğitimden reddeder", () =>
    expect(() =>
      fitWindForecast([{ ...train[0], live: true }, ...train], 30, opts)
    ).toThrow("Canlı"));
  it("geçmiş ve gerçekleşenli saati canlı tahmin yolundan reddeder", () => {
    const m = fitWindForecast(train, 30, opts),
      now = Date.UTC(2026, 9, 22);
    expect(() => m.predictLive({ ...train[0], uevm: null }, now)).toThrow();
    expect(() => m.predictLive({ ...train[0], t: now + 48 * H }, now)).toThrow();
    expect(() =>
      m.predictLive({ ...train[0], t: now + 48 * H, uevm: null }, NaN)
    ).toThrow();
    expect(m.predictLive({ ...train[0], t: now + 48 * H, uevm: null }, now)).toBe(10);
  });
});
