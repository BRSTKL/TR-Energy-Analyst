import { describe, it, expect } from "vitest";
import { calibratedWindBands } from "@/lib/wind-engine/models/calibrated-bands";
const D = 86400000,
  target = Date.UTC(2026, 9, 23);
const rows = Array.from({ length: 7000 }, (_, i) => ({
  t: target - 360 * D + i * 3600000,
  pred: 50,
  ws: 8,
  actual: 50 + (i % 41) - 20,
}));
describe("Rüzgâr ayrı dönem bant kalibrasyonu", () => {
  it("dağılım ve genişlik dönemlerini ayırır, hedef ve geleceği dışlar", () => {
    const live = [
      { pred: 50, ws: 8 },
      { pred: null, ws: 8 },
      { pred: 50, ws: null },
    ];
    const a = calibratedWindBands(rows, target, live, 100);
    expect(a).not.toBeNull();
    expect(a).toEqual(
      calibratedWindBands(
        [...rows, { t: target, pred: 50, ws: 8, actual: 999 }],
        target,
        live,
        100
      )
    );
    expect(Date.parse(a!.calibration.from)).toBeGreaterThanOrEqual(target - 90 * D);
    expect(Date.parse(a!.calibration.to)).toBeLessThan(target - 3 * D);
    expect(a!.p10[0]).toBeLessThanOrEqual(a!.p50[0]!);
    expect(a!.p50[0]).toBeLessThanOrEqual(a!.p90[0]!);
    expect(a!.p10[1]).toBeNull();
    expect(a!.p90[2]).toBeNull();
  });
  it("ayrı kalibrasyon verisi yoksa bant üretmez", () => {
    expect(
      calibratedWindBands(
        rows.filter((r) => r.t < target - 100 * D),
        target,
        [{ pred: 50, ws: 8 }],
        100
      )
    ).toBeNull();
  });
});
