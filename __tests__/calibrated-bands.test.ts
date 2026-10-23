import { describe, it, expect } from "vitest";
import { calibratedBands } from "@/lib/solar-engine/models/calibrated-bands";
const D = 86400000;
const target = Date.UTC(2026, 9, 23);
const rows = Array.from({ length: 6000 }, (_, i) => ({
  t: target - 300 * D + i * 3600000,
  pred: 50,
  actual: 50 + (((i * 7) % 31) - 15),
}));
describe("Mevsimsel güneş bandı", () => {
  it("hedef ve sonraki gerçekleşenler bandı değiştirmez", () => {
    const before = calibratedBands(rows, target, [0, 30, 50, null], 100);
    const after = calibratedBands(
      [
        ...rows,
        { t: target, pred: 50, actual: 9999 },
        { t: target + D, pred: 50, actual: 9999 },
      ],
      target,
      [0, 30, 50, null],
      100
    );
    expect(after).toEqual(before);
    expect(before).not.toBeNull();
  });
  it("bandı sıralı, fiziksel sınırda ve eksik saatleri eksik tutar", () => {
    const b = calibratedBands(rows, target, [0, 30, 50, null], 100)!;
    expect(b.p10[3]).toBeNull();
    expect(b.p10[0]).toBe(0);
    for (let i = 0; i < 3; i++) {
      expect(b.p10[i]!).toBeLessThanOrEqual(b.p50[i]!);
      expect(b.p50[i]!).toBeLessThanOrEqual(b.p90[i]!);
      expect(b.p90[i]!).toBeLessThanOrEqual(100);
    }
  });
  it("ayrı kalibrasyon örneği yoksa bant üretmez", () =>
    expect(
      calibratedBands(
        rows.filter((r) => r.t < target - 100 * D),
        target,
        [50],
        100
      )
    ).toBeNull());
});
