import { describe, expect, it } from "vitest";
import { isOpenMeteoDailyLimit, openMeteoCallWeight } from "@/lib/weather/open-meteo";

describe("Open-Meteo günlük pay", () => {
  it("çağrı ağırlığı değişken ve gün sayısıyla orantılı, en az 1", () => {
    expect(openMeteoCallWeight(5, 3)).toBe(1);
    expect(openMeteoCallWeight(21, 14)).toBeCloseTo(2.1);
    expect(openMeteoCallWeight(21, 28)).toBeCloseTo(4.2);
    // Bütün yıl yerine yalnız bayat ay: ~12 kat ucuz
    expect(openMeteoCallWeight(21, 365) / openMeteoCallWeight(21, 30)).toBeGreaterThan(12);
  });
  it("günlük sınır hatasını tanır, saatlik ya da başka hatayı değil", () => {
    expect(isOpenMeteoDailyLimit(new Error("Open-Meteo: 429 Daily API request limit exceeded. Please try again tomorrow."))).toBe(true);
    expect(isOpenMeteoDailyLimit(new Error("Open-Meteo: 429 Hourly API request limit exceeded."))).toBe(false);
    expect(isOpenMeteoDailyLimit(new Error("Open-Meteo: 500 "))).toBe(false);
  });
});
