import { it, expect } from "vitest";
import { forecastDaySummary, portfolioForecastHours } from "@/lib/forecast/display";
it("yarının tepesini öbür günün daha büyük değerine karıştırmaz", () => {
  const hours = [...Array(24).fill(10), ...Array(24).fill(30)];
  hours[5] = 20;
  expect(forecastDaySummary(hours, 0)).toEqual({
    totalMwh: 250,
    peakMwh: 20,
    peakHour: 5,
    availableHours: 24,
  });
  expect(forecastDaySummary(hours, 1)).toEqual({
    totalMwh: 720,
    peakMwh: 30,
    peakHour: 0,
    availableHours: 24,
  });
});
it("eksik saatleri sıfır veya tamamlanmış günlük toplam gibi göstermez", () => {
  const hours: Array<number | null> = Array(24).fill(2);
  hours[3] = null;
  expect(forecastDaySummary(hours, 0)).toEqual({
    totalMwh: null,
    peakMwh: null,
    peakHour: null,
    availableHours: 23,
  });
  expect(forecastDaySummary([], 0).totalMwh).toBeNull();
});
it("gerçek sıfır üretim kayıp veri değildir", () => {
  expect(forecastDaySummary(Array(24).fill(0), 0)).toEqual({
    totalMwh: 0,
    peakMwh: 0,
    peakHour: 0,
    availableHours: 24,
  });
});
it("portföyün bir santralinde eksik saat varsa eksik toplamı tam göstermez", () => {
  expect(
    portfolioForecastHours(
      [
        [1, 2],
        [3, null],
      ],
      2
    )
  ).toEqual([4, null]);
  expect(portfolioForecastHours([], 2)).toEqual([null, null]);
});
