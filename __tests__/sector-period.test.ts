import { describe, it, expect } from "vitest";
import { lastFullMonth } from "@/lib/sector/period";

describe("Sektör analiz dönemi", () => {
  it("son tam ay: ay sonuysa o ay, yarım aysa bir önceki", () => {
    expect(lastFullMonth("2026-08-31")).toBe(8);
    expect(lastFullMonth("2026-10-15")).toBe(9);
    expect(lastFullMonth("2025-12-31")).toBe(12);
    expect(lastFullMonth("2024-02-29")).toBe(2);
  });
});
