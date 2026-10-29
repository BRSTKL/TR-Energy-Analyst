import { describe, expect, it } from "vitest";
import { forecastHref } from "@/lib/ui/last-project";

describe("forecastHref", () => {
  it("son proje varsa onun tahmini, yoksa proje listesi", () => {
    expect(forecastHref("cmuis9azz06rg2tpg8q13bt1a")).toBe(
      "/projects/cmuis9azz06rg2tpg8q13bt1a/forecast"
    );
    expect(forecastHref(null)).toBe("/projects");
  });
});
