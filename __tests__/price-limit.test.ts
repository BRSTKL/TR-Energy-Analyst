import { describe, expect, it } from "vitest";
import { hourLevel, inferPriceLimit, type PriceDay } from "@/lib/analysis/price-limit";

const day = (date: string, ptf: Array<number | null>): PriceDay => ({ date, ptf: [...ptf, ...Array(24 - ptf.length).fill(null)] });
const flat = (date: string, v: number) => day(date, Array(24).fill(v));

describe("inferPriceLimit", () => {
  it("son pencerede en az 3 saat görülen en yüksek değeri tavan sayar", () => {
    const days = [flat("2026-01-01", 3400), day("2026-01-02", [3400, 3400, 3400, 2000]), day("2026-05-01", [4500, 4500, 4500, 4500, 3000]), flat("2026-05-02", 3000)];
    const l = inferPriceLimit(days, 2)!;
    expect(l.cap).toBe(4500);
    expect(l.hoursInWindow).toBe(4);
    expect(l.firstSeen).toBe("2026-05-01");
    expect(l.previousCap).toBe(3400);
  });

  it("tek seferlik tepeyi (3 saatten az) tavan saymaz", () => {
    const days = [day("2026-05-01", [4500, 3000, 3000, 3000]), flat("2026-05-02", 3000)];
    expect(inferPriceLimit(days, 5, 3)!.cap).toBe(3000);
  });

  it("veri yoksa ya da yalnız sıfırlarsa null", () => {
    expect(inferPriceLimit([])).toBeNull();
    expect(inferPriceLimit([flat("2026-05-01", 0)])).toBeNull();
  });

  it("son 7 gündeki tavan saatlerini sayar", () => {
    const days = Array.from({ length: 10 }, (_, i) => day(`2026-05-${String(i + 1).padStart(2, "0")}`, [4500, 4500, 4500, 100]));
    const l = inferPriceLimit(days)!;
    expect(l.hoursLast7).toBe(21);
    expect(l.hoursInWindow).toBe(30);
  });
});

describe("hourLevel", () => {
  const limit = inferPriceLimit([flat("2026-05-01", 4500)])!;
  it("tavan, yakın, sıfır ve olağan saati ayırır", () => {
    expect(hourLevel(4500, limit)).toBe("cap");
    expect(hourLevel(4100, limit)).toBe("near");
    expect(hourLevel(0, limit)).toBe("zero");
    expect(hourLevel(2500, limit)).toBeNull();
    expect(hourLevel(null, limit)).toBeNull();
  });
  it("limit yoksa yalnız sıfır fiyat işaretlenir", () => {
    expect(hourLevel(4500, null)).toBeNull();
    expect(hourLevel(0.5, null)).toBe("zero");
  });
});
