import { describe, it, expect } from "vitest";
import { monthsOutsideFile } from "@/lib/import/request";

describe("dosya yüklemede EPİAŞ verisinin yerine geçme", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  it("dosyanın kapsamadığı dönem aylarını verir", () => {
    expect(
      monthsOutsideFile({ start: "2026-01-01", end: "2026-04-30" }, "2026-02-01T00:00:00.000Z", "2026-03-31T23:00:00.000Z", now)
    ).toEqual(["2026-01", "2026-04"]);
  });
  it("ayın bir kısmı eksikse o ay da çıkar; dönemi kapsayan dosyada boş", () => {
    expect(
      monthsOutsideFile({ start: "2026-01-01", end: "2026-02-28" }, "2026-01-01T00:00:00.000Z", "2026-02-20T23:00:00.000Z", now)
    ).toEqual(["2026-02"]);
    expect(
      monthsOutsideFile({ start: "2026-01-01", end: "2026-02-28" }, "2025-12-01T00:00:00.000Z", "2026-03-31T23:00:00.000Z", now)
    ).toEqual([]);
  });
  it("bugünden sonraki dönem beklenmez", () => {
    expect(
      monthsOutsideFile({ start: "2026-10-01", end: "2026-12-31" }, "2026-10-01T00:00:00.000Z", "2026-11-15T23:00:00.000Z", now)
    ).toEqual([]);
  });
});
