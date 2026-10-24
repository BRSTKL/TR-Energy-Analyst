import { it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const state = vi.hoisted(() => ({
  dir: "",
  commit: vi.fn(),
  forecast: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/pool/pool-store", () => ({ poolDir: () => state.dir }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    powerPlant: { findMany: async () => [{ epiasPlantId: 1 }] },
    project: { findMany: async () => [{ id: "p" }] },
    $disconnect: async () => {},
  },
}));
vi.mock("@/lib/wind-engine/forecast", () => ({
  WIND_MODEL_ID: "wind-median-d2-uevm-v1",
  projectWindForecast: state.forecast,
}));
vi.mock("@/lib/solar-engine/learning/champions", () => ({
  reviewChampions: async () => ({
    registry: { plants: {} },
    decisions: [],
    commit: state.commit,
  }),
}));
vi.mock("@/lib/wind-engine/daily-support", () => ({
  refreshWindInputs: state.refresh,
  windRunMetadata: async () => ({ runInit: "2026-10-24T00:00:00Z", extra: [] }),
}));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
import { runDailyWindForecast } from "@/lib/wind-engine/pipeline";
import {
  readForecastLog,
  writeForecastLog,
} from "@/lib/solar-engine/learning/forecast-log-store";
import type { ForecastLog } from "@/lib/solar-engine/learning/forecast-log";
beforeEach(async () => {
  state.dir = await fs.mkdtemp(path.join(os.tmpdir(), "wind-pipeline-"));
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T08:00:00Z"));
  vi.clearAllMocks();
  state.forecast.mockResolvedValue({
    plants: [
      {
        epiasPlantId: 1,
        name: "RES",
        status: "ok",
        hours: Array(48).fill(8),
        modelId: "wind-median-d2-uevm-v1",
      },
    ],
    shadow: [],
  });
});
afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(state.dir, { recursive: true, force: true });
});
it("yarına tek değişmez 24 saatlik kayıt yazar", async () => {
  expect(await runDailyWindForecast()).toBe(0);
  const log = await readForecastLog("2026-10-25", "wind");
  expect(log?.plants[0].hours).toEqual(Array(24).fill(8));
  expect(log?.onTime).toBe(true);
  expect(log?.weather.runInit).toBe("2026-10-24T00:00:00Z");
  expect(log?.code).toMatch(/^[a-f0-9]{40}$/);
  state.forecast.mockClear();
  await runDailyWindForecast();
  expect(state.forecast).not.toHaveBeenCalled();
  expect(state.commit).toHaveBeenCalledTimes(1);
});
it("kuru çalışma ne kayıt ne şampiyon yazar", async () => {
  expect(await runDailyWindForecast({ dry: true })).toBe(0);
  expect(await readForecastLog("2026-10-25", "wind")).toBeNull();
  expect(state.commit).not.toHaveBeenCalled();
});
it("kesimde çalışmaya başlamaz", async () => {
  vi.setSystemTime(new Date("2026-10-24T09:30:00Z"));
  expect(await runDailyWindForecast()).toBe(1);
  expect(state.forecast).not.toHaveBeenCalled();
});
it("hesap sırasında kesim geçerse kayıt yazmaz", async () => {
  state.forecast.mockImplementation(async () => {
    vi.setSystemTime(new Date("2026-10-24T09:31:00Z"));
    return { plants: [{ epiasPlantId: 1, status: "ok", hours: Array(48).fill(8) }] };
  });
  expect(await runDailyWindForecast()).toBe(1);
  expect(await readForecastLog("2026-10-25", "wind")).toBeNull();
  expect(state.commit).not.toHaveBeenCalled();
});
it("kayıt yarışında kaybeden şampiyon defterini değiştirmez", async () => {
  state.forecast.mockImplementation(async () => {
    await writeForecastLog(
      { tech: "RES", targetDate: "2026-10-25", plants: [] } as unknown as ForecastLog,
      "wind"
    );
    return { plants: [{ epiasPlantId: 1, status: "ok", hours: Array(48).fill(8) }] };
  });
  expect(await runDailyWindForecast()).toBe(0);
  expect(state.commit).not.toHaveBeenCalled();
});
it("boş tahmini kaydetmez", async () => {
  state.forecast.mockResolvedValue({ plants: [], shadow: [] });
  expect(await runDailyWindForecast()).toBe(1);
  expect(await readForecastLog("2026-10-25", "wind")).toBeNull();
});
it("tek proje gerçek günlük kayıt yazamaz", async () => {
  await expect(runDailyWindForecast({ projectId: "p" })).rejects.toThrow("kuru");
  expect(await readForecastLog("2026-10-25", "wind")).toBeNull();
});
it("kısmi veya geçersiz hedef saatlerini başarılı saymaz", async () => {
  state.forecast.mockResolvedValue({
    plants: [
      {
        epiasPlantId: 1,
        name: "RES",
        status: "ok",
        hours: [...Array(24).fill(null), ...Array(24).fill(8)],
      },
    ],
  });
  expect(await runDailyWindForecast()).toBe(1);
  expect(await readForecastLog("2026-10-25", "wind")).toBeNull();
});
it("ana tahmin başarılıyken geçici gölge hatasını da yeniden dener", async () => {
  const p = { epiasPlantId: 1, name: "RES", status: "ok", hours: Array(48).fill(8) };
  state.forecast
    .mockResolvedValueOnce({
      plants: [p],
      shadow: [
        {
          modelId: "wind-ensemble-mean-v1",
          plants: [
            { epiasPlantId: 1, status: "no-data", message: "Open-Meteo HTTP 503" },
          ],
        },
      ],
    })
    .mockResolvedValue({
      plants: [p],
      shadow: [{ modelId: "wind-ensemble-mean-v1", plants: [p] }],
    });
  const running = runDailyWindForecast();
  await vi.waitFor(() => expect(state.forecast).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(11000);
  expect(await running).toBe(0);
  expect(
    (await readForecastLog("2026-10-25", "wind"))?.shadow?.[0].plants[0].status
  ).toBe("ok");
});
