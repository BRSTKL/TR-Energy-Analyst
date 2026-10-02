import { describe, expect, it } from "vitest";
import { placeLabels } from "@/lib/chart-labels";

describe("placeLabels", () => {
  it("yalnız nokta: etiket üstte", () => {
    expect(placeLabels([{ x: 100, y: 100, r: 6, name: "Enko" }])).toEqual(["top"]);
  });

  it("üst üste yakın noktalar: etiketler birbirine ve noktalara binmez", () => {
    const pts = [
      { x: 200, y: 100, r: 6, name: "Enerjisa Müşteri" },
      { x: 198, y: 120, r: 6, name: "Erkim" },
      { x: 220, y: 130, r: 6, name: "Gökada" },
    ];
    const sides = placeLabels(pts);
    // Erkim'in üst etiketi Enerjisa noktasına biner: başka yan seçilmeli
    expect(sides[1]).not.toBe("top");
    expect(new Set(sides).size).toBeGreaterThan(1);
  });
});
