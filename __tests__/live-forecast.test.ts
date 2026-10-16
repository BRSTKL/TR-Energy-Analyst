import { describe, it, expect } from "vitest";
import { liveForecastUrl, liveWeatherHours } from "@/lib/weather/live-forecast";

const HOUR = 3_600_000;

describe("Canlı hava tahmini hizalaması", () => {
  it("ışınım bir saat geri (damgadan önceki saatin ortalaması), anlık değişken aynı saat", () => {
    const res = {
      latitude: 37.5,
      longitude: 32.75,
      hourly: {
        time: ["2026-10-17T06:00", "2026-10-17T07:00", "2026-10-17T08:00"],
        shortwave_radiation: [0, 120, 300],
        direct_radiation: [0, 80, 200],
        diffuse_radiation: [0, 40, 100],
        temperature_2m: [10, 11, 13],
        cloud_cover: [0, 5, 10],
      },
    };
    const from = Date.UTC(2026, 9, 17, 6);
    const h = liveWeatherHours(res, from, from + 3 * HOUR);
    expect(h.map((x) => x.t)).toEqual([from, from + HOUR, from + 2 * HOUR]);
    // 06:00 üretim saatinin ışınımı 07:00 damgası
    expect(h[0]).toMatchObject({ ghi: 120, direct: 80, diffuse: 40, temp: 10, cloud: 0 });
    expect(h[1]).toMatchObject({ ghi: 300, temp: 11 });
    // son saatin ışınımı yanıtta yok
    expect(h[2]).toMatchObject({ ghi: null, temp: 13 });
  });

  it("aynı model ve Türkiye saati", () => {
    const u = liveForecastUrl(37.5, 32.75, 3);
    expect(u).toContain("models=ecmwf_ifs025");
    expect(u).toContain("timezone=Europe%2FIstanbul");
    expect(u).toContain("forecast_days=3");
  });
});
