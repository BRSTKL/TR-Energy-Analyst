import { it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const state = vi.hoisted(() => ({ dir: "", daily: {} as Record<string, number> }));
vi.mock("@/lib/pool/pool-store", () => ({ poolDir: () => state.dir }));
vi.mock("@/lib/solar-engine/learning/scorecard-data", () => ({
  scorecard: async () => ({
    rows: [
      {
        epiasPlantId: 1,
        modelId: "wind-median-d2-uevm-v1",
        exLoss: { model: { daily: state.daily } },
      },
      {
        epiasPlantId: 1,
        modelId: "wind-median-correction-v1",
        exLoss: {
          model: {
            daily: Object.fromEntries(Object.keys(state.daily).map((d) => [d, 80])),
          },
        },
      },
    ],
  }),
}));
import { readChampions, reviewChampions } from "@/lib/solar-engine/learning/champions";
import { writeForecastLog } from "@/lib/solar-engine/learning/forecast-log-store";
import type { ForecastLog } from "@/lib/solar-engine/learning/forecast-log";
const options = { targetDate: "2026-10-30", tech: "RES" as const };
beforeEach(async () => {
  state.dir = await fs.mkdtemp(path.join(os.tmpdir(), "wind-champ-"));
  state.daily = Object.fromEntries(
    Array.from({ length: 28 }, (_, i) => [
      new Date(Date.UTC(2026, 8, 30 + i)).toISOString().slice(0, 10),
      100,
    ])
  );
});
afterEach(async () => {
  await fs.rm(state.dir, { recursive: true, force: true });
});
async function log(day: string, partial = false) {
  await writeForecastLog(
    {
      tech: "RES",
      targetDate: day,
      onTime: true,
      model: { id: "wind-median-d2-uevm-v1", trainingMonths: 4 },
      plants: [{ epiasPlantId: 1, status: "ok", name: "RES", hours: Array(24).fill(10) }],
      shadow: [
        {
          modelId: "wind-median-correction-v1",
          plants: [
            {
              epiasPlantId: 1,
              status: "ok",
              hours: partial ? [8, ...Array(23).fill(null)] : Array(24).fill(8),
            },
          ],
        },
      ],
    } as ForecastLog,
    "wind"
  );
}
async function fullLogs(partial = false) {
  for (const d of Object.keys(state.daily)) await log(d, partial);
}
it("ilk 28 gerçek gün dolmadan rüzgâr terfisi yapmaz", async () => {
  await log("2026-10-15");
  expect((await reviewChampions([1], Date.UTC(2026, 9, 29), options)).decisions).toEqual(
    []
  );
});
it("rüzgâr kararını yalnız commit sonrası ayrı dosyaya yazar", async () => {
  await fullLogs();
  const result = await reviewChampions([1], Date.UTC(2026, 9, 29), options);
  expect(result.decisions[0]?.to).toBe("wind-median-correction-v1");
  expect((await readChampions("RES")).plants).toEqual({});
  await result.commit();
  expect((await readChampions("RES")).plants["1"].modelId).toBe(
    "wind-median-correction-v1"
  );
  expect((await readChampions()).plants).toEqual({});
});
it("ilk geç kaydı atlar; zamanında kanıtı kullanır", async () => {
  await writeForecastLog(
    { tech: "RES", targetDate: "2026-09-29", onTime: false } as ForecastLog,
    "wind"
  );
  await fullLogs();
  expect(
    (await reviewChampions([1], Date.UTC(2026, 9, 29), options)).decisions[0]?.to
  ).toBe("wind-median-correction-v1");
});

it("tek saati dolu ucuz gölge 28 günde terfi etmez", async () => {
  await fullLogs(true);
  expect((await reviewChampions([1], Date.UTC(2026, 9, 29), options)).decisions).toEqual(
    []
  );
});
