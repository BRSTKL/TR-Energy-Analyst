import { describe, it, expect } from "vitest";
import { energy, nf, tlAxis, tlCompact } from "@/lib/format";

describe("Ekran sayı biçimi (tr-TR)", () => {
  it("ondalık virgül, binlik nokta", () => {
    expect(nf(1234.56, 1)).toBe("1.234,6");
    expect(nf(NaN)).toBe("0");
  });
  it("kısa TL tutarı", () => {
    expect(tlCompact(929_603_934.66)).toBe("929,6 M ₺");
    expect(tlCompact(850_000)).toBe("850 bin ₺");
    expect(tlCompact(1_234_000_000)).toBe("1,2 milyar ₺");
    expect(tlCompact(-2_600_000)).toBe("-2,6 M ₺");
    expect(tlCompact(950)).toBe("950 ₺");
  });
  it("eksen: 40000k ₺ yerine 40 M ₺", () => {
    expect(tlAxis(40_000_000)).toBe("40 M ₺");
    expect(tlAxis(2_500_000)).toBe("2,5 M ₺");
    expect(tlAxis(500_000)).toBe("500 bin ₺");
    expect(tlAxis(0)).toBe("0 ₺");
  });
  it("enerji", () => {
    expect(energy(275_764.9)).toBe("275,8 GWh");
    expect(energy(9_500)).toBe("9.500 MWh");
  });
});
