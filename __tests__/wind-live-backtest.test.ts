import { it, expect } from "vitest";
import {
  trainingForWindDay,
  matchedWindHours,
  uniqueWindPlants,
  completeWindMonth,
} from "@/lib/wind-engine/learning/live-backtest";
const DAY = 86400000,
  H = 3600000;
it("eğitim canlıdaki gibi son bilinen üretimde biter ve tam 120 günlük pencere kullanır", () => {
  const target = Date.UTC(2026, 8, 1),
    end = target - 3 * DAY;
  const hours = Array.from({ length: 125 * 24 }, (_, i) => ({
    t: end - 122 * DAY + i * H,
    uevm: 1,
  }));
  const result = trainingForWindDay(hours, target);
  expect(result.end).toBe(end);
  expect(result.from).toBe(end - 120 * DAY);
  expect(result.hours).toHaveLength(120 * 24);
  expect(result.hours.at(-1)?.t).toBe(end - H);
  const changed = hours.map((h) => (h.t >= end ? { ...h, uevm: 999 } : h));
  expect(trainingForWindDay(changed, target)).toEqual(result);
});
it("son üretim daha eskiyse canlıdaki gibi pencereyi geriye taşır", () => {
  const target = Date.UTC(2026, 8, 1);
  const rows = [
    { t: target - 5 * DAY, uevm: 2 },
    { t: target - 4 * DAY, uevm: null },
  ];
  expect(trainingForWindDay(rows, target).end).toBe(target - 5 * DAY + H);
});
it("bir tahmin eksik veya geçersizse saat bütün kıyastan düşer", () => {
  const rows = [
    { t: 1, uevm: 5, base: 4, kgup: 6 },
    { t: 2, uevm: 5, base: null, kgup: 6 },
    { t: 3, uevm: 5, base: NaN, kgup: 6 },
  ];
  expect(
    matchedWindHours(rows, ["base", "kgup"], new Set([1, 2, 3])).map((h) => h.t)
  ).toEqual([1]);
});
it("aynı santralde çelişkili kapasite veya koordinatı sessizce seçmez", () => {
  const p = {
    epiasPlantId: 1,
    name: "RES",
    capacityMw: 10,
    capacitySource: "USER",
    latitude: 40,
    longitude: 29,
    locationSource: "USER",
  };
  expect(uniqueWindPlants([p, { ...p, name: "diğer kayıt" }])).toHaveLength(1);
  expect(() => uniqueWindPlants([p, { ...p, capacityMw: 20 }])).toThrow("çelişki");
  expect(() => uniqueWindPlants([p, { ...p, longitude: 30 }])).toThrow("çelişki");
});
it("son kısmi ayı tam ay saymaz; eşik en eski veri sınırıdır", () => {
  expect(completeWindMonth([Date.UTC(2026, 8, 30, 23), Date.UTC(2026, 9, 22, 23)])).toBe(
    "2026-09"
  );
  expect(completeWindMonth([Date.UTC(2026, 8, 29, 23), Date.UTC(2026, 9, 22, 23)])).toBe(
    "2026-08"
  );
});
it("son ay kısmi ise yüzde90 kapsasa da ana özete girmez", async () => {
  const { windMonthEligible } = await import("@/lib/wind-engine/learning/live-backtest");
  expect(windMonthEligible("2026-09", 0.99, "2026-08")).toBe(false);
  expect(windMonthEligible("2026-08", 0.95, "2026-08")).toBe(true);
  expect(windMonthEligible("2026-08", 0.89, "2026-08")).toBe(false);
});
