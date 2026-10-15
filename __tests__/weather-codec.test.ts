import { describe, it, expect } from "vitest";
import { apiVariableNames, emptyWeatherYear, filledHours, mergeWeather, weatherAt } from "@/lib/weather/weather-codec";

const res = (time: string[], values: Record<string, Array<number | null>>) => ({ latitude: 37.75, longitude: 33.5, hourly: { time, ...values } });

describe("Hava verisi kodlayıcısı (15.2)", () => {
  it("21 değişken: 7 değişken × (en yeni, 1 gün önce, 2 gün önce)", () => {
    const names = apiVariableNames();
    expect(names).toHaveLength(21);
    expect(names).toContain("shortwave_radiation_previous_day2");
    expect(names).toContain("temperature_2m");
  });

  it("ışınım damgası önceki saatin ortalaması: üretim saatine bir saat geri yazılır; anlık değişken kaymaz", () => {
    const doc = emptyWeatherYear(1, 2026, 37.8, 33.6);
    mergeWeather(
      doc,
      res(["2026-06-21T05:00", "2026-06-21T06:00", "2026-06-21T07:00"], {
        shortwave_radiation_previous_day2: [0, 14, 142],
        temperature_2m_previous_day2: [12.1, 13.0, 15.5],
      }),
      ["06"],
      "2026-10-15T00:00:00.000Z"
    );
    const h = (hh: number) => Date.UTC(2026, 5, 21, hh);
    expect(weatherAt(doc, "d2", "shortwave_radiation", h(5))).toBe(14); // 05:00–06:00 üretim saati ← 06:00 damgası
    expect(weatherAt(doc, "d2", "shortwave_radiation", h(6))).toBe(142);
    expect(weatherAt(doc, "d2", "shortwave_radiation", h(4))).toBe(0);
    expect(weatherAt(doc, "d2", "temperature_2m", h(6))).toBe(13.0); // anlık: saat başı
    expect(doc.gridLatitude).toBe(37.75);
    expect(doc.fetched["06"]).toBe("2026-10-15T00:00:00.000Z");
  });

  it("yıl sınırı: ertesi yılın ilk damgası bu yılın son üretim saatine; yıl dışı saatler ve null yazılmaz", () => {
    const doc = emptyWeatherYear(1, 2025, 37.8, 33.6);
    doc.series.d1.temperature_2m[0] = 5;
    mergeWeather(
      doc,
      res(["2025-01-01T00:00", "2025-12-31T23:00", "2026-01-01T00:00", "2026-01-01T01:00"], {
        shortwave_radiation_previous_day1: [0, 0, 7, 9],
        temperature_2m_previous_day1: [null, 3, 4, 5],
      }),
      ["12"],
      "x"
    );
    const n = doc.series.d1.shortwave_radiation.length;
    expect(doc.series.d1.shortwave_radiation[n - 1]).toBe(7); // 2025-12-31 23:00–24:00 ← 2026-01-01T00:00 damgası
    expect(doc.series.d1.temperature_2m[0]).toBe(5); // null mevcut değeri silmez
    expect(doc.series.d1.temperature_2m[n - 1]).toBe(3);
    expect(filledHours(doc, "d1", "temperature_2m")).toBe(2); // 2026 saatleri yazılmadı
  });
});
