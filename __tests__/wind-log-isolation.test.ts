import { describe, it, expect } from "vitest";
import {
  forecastLogPath,
  writeForecastLog,
} from "@/lib/solar-engine/learning/forecast-log-store";
import type { ForecastLog } from "@/lib/solar-engine/learning/forecast-log";
describe("Tahmin kayıtlarının teknoloji ayrımı", () => {
  it("varsayılan güneş yolu aynı kalır, rüzgâr ayrı dizine gider", () => {
    expect(forecastLogPath("2026-10-23")).toContain("/solar/2026-10/2026-10-23.json.gz");
    expect(forecastLogPath("2026-10-23", "wind")).toContain(
      "/wind/2026-10/2026-10-23.json.gz"
    );
  });
  it("yanlış teknolojiyle dosya yazmaz", async () => {
    await expect(writeForecastLog({ tech: "RES" } as ForecastLog)).rejects.toThrow(
      "teknolojisi"
    );
    await expect(
      writeForecastLog({ tech: "GES" } as ForecastLog, "wind")
    ).rejects.toThrow("teknolojisi");
  });
});
