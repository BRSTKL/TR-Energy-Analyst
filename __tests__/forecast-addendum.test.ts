import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readForecastLog, writeForecastAddendum, writeForecastLog, type ForecastAddendum } from "@/lib/solar-engine/learning/forecast-log-store";
import type { ForecastLog } from "@/lib/solar-engine/learning/forecast-log";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "addendum-"));
const prev = process.env.POOL_DIR;
beforeAll(() => {
  process.env.POOL_DIR = dir;
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  if (prev === undefined) delete process.env.POOL_DIR;
  else process.env.POOL_DIR = prev;
});

const cutoff = "2026-11-18T09:30:00.000Z";
const log = (date: string, shadows: string[] = []): ForecastLog => ({
  schema: 1,
  tech: "GES",
  targetDate: date,
  issuedAt: "2026-11-18T06:30:00.000Z",
  cutoff,
  onTime: true,
  model: { id: "base", trainingMonths: 4 },
  weather: { source: "x", model: "x", runInit: null },
  code: null,
  plants: [{ epiasPlantId: 1, name: "A", status: "ok", hours: [1] }],
  shadow: shadows.map((modelId) => ({ modelId, plants: [{ epiasPlantId: 1, status: "ok", hours: [2] }] })),
});
const add = (date: string, modelId: string, issuedAt: string, value = 3): ForecastAddendum => ({
  schema: 1,
  tech: "GES",
  targetDate: date,
  issuedAt,
  cutoff,
  onTime: Date.parse(issuedAt) < Date.parse(cutoff),
  weather: { source: "WN3", runInit: null },
  code: null,
  shadow: { modelId, plants: [{ epiasPlantId: 1, status: "ok", hours: [value] }] },
});

describe("Gölge sürüm ek kaydı", () => {
  it("kesimden önce yazılan ek, okunurken ana kaydın gölgelerine katılır; ek bir kez yazılır", async () => {
    await writeForecastLog(log("2026-11-19"), "solar");
    expect(await writeForecastAddendum(add("2026-11-19", "wn3", "2026-11-18T08:20:00.000Z"), "solar")).toBe(true);
    expect(await writeForecastAddendum(add("2026-11-19", "wn3", "2026-11-18T08:40:00.000Z", 9), "solar")).toBe(false);
    const r = await readForecastLog("2026-11-19", "solar");
    expect(r!.shadow!.find((s) => s.modelId === "wn3")!.plants[0].hours).toEqual([3]);
  });

  it("kesimden sonra yazılan ek karneye girmez", async () => {
    await writeForecastLog(log("2026-11-20"), "solar");
    await writeForecastAddendum(add("2026-11-20", "wn3", "2026-11-18T09:45:00.000Z"), "solar");
    const r = await readForecastLog("2026-11-20", "solar");
    expect(r!.shadow!.some((s) => s.modelId === "wn3")).toBe(false);
  });

  it("ana kayıtta aynı sürüm varsa ek yok sayılır; ana kayıt yoksa ek tek başına okunmaz", async () => {
    await writeForecastLog(log("2026-11-21", ["wn3"]), "solar");
    await writeForecastAddendum(add("2026-11-21", "wn3", "2026-11-18T08:20:00.000Z"), "solar");
    const r = await readForecastLog("2026-11-21", "solar");
    expect(r!.shadow!.filter((s) => s.modelId === "wn3")).toHaveLength(1);
    expect(r!.shadow![0].plants[0].hours).toEqual([2]);
    await writeForecastAddendum(add("2026-11-22", "wn3", "2026-11-18T08:20:00.000Z"), "solar");
    expect(await readForecastLog("2026-11-22", "solar")).toBeNull();
  });

  it("geçersiz sürüm kimliği dosya yolu olarak kullanılamaz", async () => {
    await expect(writeForecastAddendum(add("2026-11-23", "../x", "2026-11-18T08:20:00.000Z"), "solar")).rejects.toThrow(/Geçersiz/);
  });
});
