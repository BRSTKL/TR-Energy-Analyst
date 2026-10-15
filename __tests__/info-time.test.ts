import { describe, it, expect } from "vitest";
import {
  assertAvailable,
  calendarFeature,
  decisionCutoff,
  LeakageError,
  leakingFeatures,
  productionFeature,
  weatherFeature,
  weatherLeadClean,
  weatherRunInit,
} from "@/lib/forecast/info-time";

const H = 3_600_000;
const wall = (s: string) => Date.parse(`${s}:00Z`); // duvar saati (Türkiye saati UTC alanında)
const D = wall("2026-06-21T00:00");
const at = (h: number) => D + h * H;

describe("Bilgi zamanı (15.3)", () => {
  it("kesim: hedef günün bir önceki günü 12:30 (gece yarısı ve 23:00 aynı günün kesimi)", () => {
    expect(decisionCutoff(at(0))).toBe(wall("2026-06-20T12:30"));
    expect(decisionCutoff(at(23))).toBe(wall("2026-06-20T12:30"));
  });

  it("hava çalışması: elle hesaplanmış örnekler", () => {
    // Üretim saati 23:00 (ışınım damgası ertesi gün 00:00 TR = 21:00 UTC) → 18Z çalışması; 2 gün önce: 19.06 18Z = 21:00 TR
    expect(weatherRunInit(at(24), 2)).toBe(wall("2026-06-19T21:00"));
    // 10:00 damgası (07 UTC) → 06Z; 1 gün önce: 20.06 06Z = 09:00 TR, yayım + 9 saat = 18:00 TR > kesim
    expect(weatherRunInit(at(10), 1)).toBe(wall("2026-06-20T09:00"));
    // 08:00 damgası (05 UTC, dilimin son saati) → bir sonraki çalışma 06Z (gözlem: 05.10.2026 05 UTC → 06Z)
    expect(weatherRunInit(at(8), 2)).toBe(wall("2026-06-19T09:00"));
  });

  it("2 gün önceki tahmin günün 24 saatinde temiz; 1 gün önceki yalnız 00–06; en yeni hiçbir saatte", () => {
    const clean = (lead: 0 | 1 | 2) => Array.from({ length: 24 }, (_, h) => h).filter((h) => weatherLeadClean(at(h), lead));
    expect(clean(2)).toHaveLength(24);
    expect(clean(1)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(clean(0)).toEqual([]);
  });

  it("üretim gecikmesi: D-2 kullanılabilir, D-1 kullanılamaz", () => {
    expect(leakingFeatures([productionFeature("cf_d2", wall("2026-06-19T23:00"))], at(12))).toEqual([]);
    expect(leakingFeatures([productionFeature("cf_d1", wall("2026-06-20T00:00"))], at(12))).toHaveLength(1);
  });

  it("kesim sonrası özellik hata verir; mesaj sızan özelliği adlandırır; takvim her zaman temiz", () => {
    const ok = [weatherFeature("ghi_d2", at(13), "mean", 2), weatherFeature("temp_d2", at(13), "instant", 2), calendarFeature("hour")];
    expect(() => assertAvailable(ok, at(13))).not.toThrow();
    const bad = [...ok, weatherFeature("ghi_d1", at(13), "mean", 1)];
    expect(() => assertAvailable(bad, at(13))).toThrow(LeakageError);
    try {
      assertAvailable(bad, at(13));
    } catch (e) {
      expect((e as LeakageError).features.map((f) => f.name)).toEqual(["ghi_d1"]);
      expect((e as Error).message).toMatch(/ghi_d1/);
      expect((e as Error).message).toMatch(/2026-06-20 12:30/);
    }
  });
});
