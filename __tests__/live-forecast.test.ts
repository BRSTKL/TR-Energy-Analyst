import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { liveFetchDays, liveForecastUrl, liveResponseProblem, liveWeatherHours } from "@/lib/weather/live-forecast";

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

  it("eski ya da boş canlı yanıt yakalanır (26.10.2026: Next.js fetch önbelleği 22 Ekim yanıtını döndürüyordu)", () => {
    const now = Date.UTC(2026, 9, 26, 12, 5); // 15:05 Türkiye
    const day = (d: string) => Array.from({ length: 24 }, (_, i) => `${d}T${String(i).padStart(2, "0")}:00`);
    const vals = (n: number, v: number | null) => Array(n).fill(v);
    const good = { time: [...day("2026-10-26"), ...day("2026-10-27"), ...day("2026-10-28")], shortwave_radiation: vals(72, 100) };
    expect(liveResponseProblem(good, now, ["shortwave_radiation"])).toBeNull();
    const stale = { time: [...day("2026-10-22"), ...day("2026-10-23"), ...day("2026-10-24")], shortwave_radiation: vals(72, 100) };
    expect(liveResponseProblem(stale, now, ["shortwave_radiation"])).toMatch(/2026-10-27/);
    const empty = { ...good, shortwave_radiation: vals(72, null) };
    expect(liveResponseProblem(empty, now, ["shortwave_radiation"])).toMatch(/değer yok/);
    // birden çok sütundan biri dolu yeter (ICON / GFS soneki)
    expect(liveResponseProblem({ ...good, a_icon_eu: vals(72, null) }, now, ["a_icon_eu", "shortwave_radiation"])).toBeNull();
    // Türkiye gece yarısını geçince yarın bir sonraki gün olur
    const twoDays = { time: good.time.slice(0, 48), shortwave_radiation: vals(48, 100) };
    expect(liveResponseProblem(twoDays, now, ["shortwave_radiation"])).toBeNull();
    expect(liveResponseProblem(twoDays, Date.UTC(2026, 9, 26, 21, 30), ["shortwave_radiation"])).toMatch(/2026-10-28/);
  });

  it("sunucu tarafı her fetch önbelleksiz (Next.js sunucusunda varsayılan bir yıl saklıyordu)", () => {
    const files = [
      "lib/solar-engine/forecast.ts",
      "lib/solar-engine/pipeline.ts",
      "lib/wind-engine/forecast.ts",
      "lib/wind-engine/data/live-nwp.ts",
      "lib/wind-engine/daily-support.ts",
      "lib/weather/open-meteo.ts",
      "lib/weather/nwp-models.ts",
      "lib/weather/satellite.ts",
      "lib/weather/snow.ts",
      "lib/weather/reanalysis-wind.ts",
      "lib/weather/wind-forecast-archive.ts",
      "lib/weather/wind-nwp-archive.ts",
      "lib/services/epias-service.ts",
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      const calls = src.split(/\bfetch\(/).slice(1);
      expect(calls.length, f).toBeGreaterThan(0);
      for (const c of calls) expect(c.slice(0, 400), f).toContain('cache: "no-store"');
    }
  });

  it("öbür günün son saati için bir gün fazla istenir (ışınım bir saat geri kayar)", () => {
    const days = liveFetchDays(2);
    expect(days).toBe(4);
    const res = (n: number) => {
      const time = Array.from({ length: n * 24 }, (_, i) => new Date(Date.UTC(2026, 9, 26) + i * HOUR).toISOString().slice(0, 16));
      const v = time.map(() => 50);
      return { latitude: 0, longitude: 0, hourly: { time, shortwave_radiation: v, direct_radiation: v, diffuse_radiation: v, temperature_2m: v, cloud_cover: v } };
    };
    const from = Date.UTC(2026, 9, 27); // duvar saati: yarın 00:00
    const filled = (n: number) => liveWeatherHours(res(n), from, from + 48 * HOUR).filter((h) => h.ghi !== null).length;
    expect(filled(3)).toBe(47); // eski istek: 28 Ekim 23:00–24:00 boş kalıyordu
    expect(filled(days)).toBe(48);
    expect(liveForecastUrl(37, 32, days)).toContain("forecast_days=4");
  });
});

