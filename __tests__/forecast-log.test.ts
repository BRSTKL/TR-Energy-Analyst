import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FORECAST_LOG_SCHEMA, forecastCutoff, isOnTime, nextTargetDate, type ForecastLog } from "@/lib/solar-engine/learning/forecast-log";

describe("günlük tahmin kaydı: kesim", () => {
  it("D günü için kesim D-1 12:30 Türkiye (09:30 UTC)", () => {
    expect(new Date(forecastCutoff("2026-10-20")).toISOString()).toBe("2026-10-19T09:30:00.000Z");
  });

  it("kesimden önce yazılan kayıt zamanında; tam kesim anı değil", () => {
    expect(isOnTime(Date.parse("2026-10-19T09:29:59Z"), "2026-10-20")).toBe(true);
    expect(isOnTime(Date.parse("2026-10-19T09:30:00Z"), "2026-10-20")).toBe(false);
  });

  it("hedef gün Türkiye saatiyle yarın", () => {
    // 18 Ekim 23:30 UTC = 19 Ekim 02:30 Türkiye → 20 Ekim; 18 Ekim 18:30 Türkiye → 19 Ekim
    expect(nextTargetDate(Date.parse("2026-10-18T23:30:00Z"))).toBe("2026-10-20");
    expect(nextTargetDate(Date.parse("2026-10-18T15:30:00Z"))).toBe("2026-10-19");
  });
});

describe("günlük tahmin kaydı: dosya bir kez yazılır", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "forecast-log-"));
    process.env.POOL_DIR = dir;
  });
  afterAll(() => {
    delete process.env.POOL_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const log = (mwh: number): ForecastLog => ({
    schema: FORECAST_LOG_SCHEMA,
    tech: "GES",
    targetDate: "2026-10-20",
    issuedAt: "2026-10-19T06:30:00.000Z",
    cutoff: "2026-10-19T09:30:00.000Z",
    onTime: true,
    model: { id: "test", trainingMonths: 4 },
    weather: { source: "test", model: "test", runInit: null },
    code: null,
    plants: [{ epiasPlantId: 1, name: "A GES", status: "ok", hours: Array(24).fill(mwh) }],
  });

  it("ikinci yazım ilk kaydı değiştirmez", async () => {
    const { readForecastLog, writeForecastLog, listForecastLogs } = await import("@/lib/solar-engine/learning/forecast-log-store");
    expect(await writeForecastLog(log(1))).toBe(true);
    expect(await writeForecastLog(log(2))).toBe(false);
    expect((await readForecastLog("2026-10-20"))?.plants[0].hours?.[0]).toBe(1);
    expect(await listForecastLogs()).toEqual(["2026-10-20"]);
    expect(await readForecastLog("2026-10-21")).toBeNull();
    // Geçici dosya kalmaz, kayıt salt okunur
    const { forecastLogPath } = await import("@/lib/solar-engine/learning/forecast-log-store");
    const file = forecastLogPath("2026-10-20");
    expect(fs.readdirSync(path.dirname(file))).toEqual(["2026-10-20.json.gz"]);
    expect(fs.statSync(file).mode & 0o222).toBe(0);
  });
});
