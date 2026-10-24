import { it, expect } from "vitest";
import { selectWindForecast } from "@/lib/wind-engine/learning/select-forecast";
import { WIND_BASE_MODEL, WIND_CORRECTION_MODEL } from "@/lib/wind-engine/registry";
import type { ProjectWindForecast } from "@/lib/wind-engine/forecast";
const forecast = (): ProjectWindForecast => ({
  project: { id: "p", name: "p" },
  generatedAt: "",
  weatherFetchedAt: "",
  days: ["2026-10-25", "2026-10-26"],
  total: Array(48).fill(10),
  plants: [
    {
      epiasPlantId: 1,
      name: "RES",
      organizationName: null,
      locationText: "",
      locationSource: null,
      status: "ok",
      hours: Array(48).fill(10),
      rampProbabilities: [0.5],
    },
  ],
  shadow: [
    {
      modelId: WIND_CORRECTION_MODEL,
      plants: [{ epiasPlantId: 1, status: "ok", hours: Array(48).fill(8) }],
    },
  ],
});
it("seçili rüzgâr adayını ana yapar; temel kaybolmaz ve toplamlar uyuşur", () => {
  const result = selectWindForecast(forecast(), { "1": WIND_CORRECTION_MODEL });
  expect(result.plants[0].hours).toEqual(Array(48).fill(8));
  expect(result.plants[0].modelId).toBe(WIND_CORRECTION_MODEL);
  expect(result.total).toEqual(Array(48).fill(8));
  expect(result.plants[0].daily).toEqual([192, 192]);
  expect(result.plants[0].rampProbabilities).toBeUndefined();
  expect(
    result.shadow?.find((s) => s.modelId === WIND_BASE_MODEL)?.plants[0].hours
  ).toEqual(Array(48).fill(10));
});
it("eksik adayda temel tahmine döner; kısmi saatleri başarı saymaz", () => {
  const f = forecast();
  f.shadow![0].plants[0].hours![4] = null;
  const result = selectWindForecast(f, { "1": WIND_CORRECTION_MODEL });
  expect(result.plants[0].modelId).toBe(WIND_BASE_MODEL);
  expect(result.plants[0].hours?.[4]).toBe(10);
  expect(result.plants[0].warning).toContain("temel");
});
it("ilk günün kısıntı adayını ikinci günün bilinmeyen fiyatı engellemez", () => {
  const f = forecast();
  f.shadow![0].plants[0].hours = [...Array(24).fill(8), ...Array(24).fill(null)];
  const r = selectWindForecast(f, { "1": WIND_CORRECTION_MODEL });
  expect(r.plants[0].modelId).toBe(WIND_CORRECTION_MODEL);
  expect(r.plants[0].hours).toEqual([...Array(24).fill(8), ...Array(24).fill(10)]);
  expect(r.plants[0].day2ModelId).toBe(WIND_BASE_MODEL);
  expect(r.plants[0].warning).toContain("Öbür gün");
});
