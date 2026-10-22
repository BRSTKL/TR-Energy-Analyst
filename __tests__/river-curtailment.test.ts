import { describe, expect, it } from "vitest";
import { detectRiverCurtailment, RIVER_MIN_RUN_HOURS, zoneOfProvince } from "@/lib/analysis/river-curtailment";

const start = "2026-04-01T00:00:00.000Z";
const H = 3_600_000;
const t0 = Date.parse(start);

describe("akarsu olası kısıntı", () => {
  it("planı varken en az 6 saat sıfıra yakın üretim kısıntı; kayıp = plan − üretim", () => {
    const kgup = new Array(12).fill(20);
    const uevm = [20, 20, 0, 0.5, 0, 0, 0, 0, 20, 20, 20, 20];
    const r = detectRiverCurtailment({ start, kgup, uevm });
    expect(Array.from(r.keys())).toEqual([2, 3, 4, 5, 6, 7]);
    expect(r.get(3)).toBe(19.5);
  });

  it("6 saatten kısa duruş, küçük plan ve kısmi düşüş sayılmaz", () => {
    const short = detectRiverCurtailment({ start, kgup: new Array(8).fill(20), uevm: [20, 0, 0, 0, 0, 0, 20, 20] });
    expect(short.size).toBe(0);
    const tiny = detectRiverCurtailment({ start, kgup: new Array(8).fill(0.5), uevm: new Array(8).fill(0) });
    expect(tiny.size).toBe(0);
    const partial = detectRiverCurtailment({ start, kgup: new Array(8).fill(20), uevm: new Array(8).fill(10) });
    expect(partial.size).toBe(0);
    expect(RIVER_MIN_RUN_HOURS).toBe(6);
  });

  it("arıza / bakım bildirimiyle çakışan saat sayılmaz, duruş bölünür", () => {
    const kgup = new Array(14).fill(20);
    const uevm = new Array(14).fill(0);
    // Bildirim 6–8. saatler: kalan duruşlar 0–5 (6 saat, sayılır) ve 8–13 (6 saat, sayılır)
    const r = detectRiverCurtailment({ start, kgup, uevm }, [{ start: t0 + 6 * H, end: t0 + 8 * H }]);
    expect(Array.from(r.keys())).toEqual([0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13]);
  });

  it("verisi olmayan saat duruşu böler; yıl sonunda süren duruş da kapanır", () => {
    const kgup: Array<number | null> = new Array(10).fill(20);
    const uevm: Array<number | null> = new Array(10).fill(0);
    uevm[3] = null;
    const r = detectRiverCurtailment({ start, kgup, uevm });
    // 0–2 (3 saat) kısa, sayılmaz; 4–9 (6 saat) sayılır
    expect(Array.from(r.keys())).toEqual([4, 5, 6, 7, 8, 9]);
    const tail = detectRiverCurtailment({ start, kgup: new Array(8).fill(20), uevm: [20, 20, 0, 0, 0, 0, 0, 0] });
    expect(tail.size).toBe(6);
  });

  it("il → bölge", () => {
    expect(zoneOfProvince("GİRESUN")).toBe("Doğu Karadeniz");
    expect(zoneOfProvince("Adana")).toBe("Akdeniz");
    expect(zoneOfProvince("KONYA")).toBe("İç Anadolu");
    expect(zoneOfProvince(null)).toBeNull();
  });
});
