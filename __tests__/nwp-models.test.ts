import { describe, expect, it } from "vitest";
import { emptyNwpYear, mergeNwp, nwpAt, nwpUrl } from "@/lib/weather/nwp-models";

describe("ek hava modelleri", () => {
  it("yalnız 2 gün önceki sürüm istenir; ışınım bir saat geri, anlık değişken saat başı yazılır", () => {
    const url = nwpUrl(37.87, 32.48, "2025-06-01", "2025-06-02", ["icon_eu", "gfs_global"]);
    expect(url).toContain("shortwave_radiation_previous_day2");
    expect(url).not.toMatch(/previous_day1|shortwave_radiation%2C/);
    const doc = emptyNwpYear(1, 2025, "icon_eu", 37.87, 32.48);
    const res = {
      hourly: {
        time: ["2025-06-21T10:00", "2025-06-21T11:00"],
        shortwave_radiation_previous_day2_icon_eu: [800, 900],
        temperature_2m_previous_day2_icon_eu: [25, 26],
        shortwave_radiation_previous_day2_gfs_global: [1, 2],
      },
    };
    mergeNwp(doc, res, true, ["06"], "2025-07-01T00:00:00Z");
    const t10 = Date.UTC(2025, 5, 21, 10);
    // Damga 11:00 = [10, 11) ortalaması → üretim saati 10
    expect(nwpAt(doc, "ghi", t10)).toBe(900);
    expect(nwpAt(doc, "ghi", t10 - 3_600_000)).toBe(800);
    expect(nwpAt(doc, "temp", t10)).toBe(25);
    expect(nwpAt(doc, "cloud", t10)).toBeNull();
    // Tek modelde sütun soneki yok: çok modelli yanıt okunmaz
    const single = mergeNwp(emptyNwpYear(1, 2025, "icon_eu", 37.87, 32.48), res, false, ["06"], "x");
    expect(nwpAt(single, "ghi", t10)).toBeNull();
  });
});
