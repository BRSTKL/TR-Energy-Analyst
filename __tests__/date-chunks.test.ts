import { describe, it, expect } from "vitest";
import { formatDay, monthChunks } from "../lib/date-chunks";

describe("Tarih aralığını aylara bölme", () => {
  it("Tam yılı 12 takvim ayına böler (Şubat ve 31 çeken aylar doğru)", () => {
    const c = monthChunks("2025-01-01", "2025-12-31");
    expect(c).toHaveLength(12);
    expect(c[0]).toEqual({ start: "2025-01-01", end: "2025-01-31", label: "Oca 2025" });
    expect(c[1].end).toBe("2025-02-28");
    expect(c[11]).toEqual({ start: "2025-12-01", end: "2025-12-31", label: "Ara 2025" });
  });

  it("Ay ortasında başlayıp biten aralığın ilk ve son parçasını kırpar; yıl geçişini doğru yapar", () => {
    const c = monthChunks("2024-11-15", "2025-01-10");
    expect(c.map((x) => [x.start, x.end])).toEqual([
      ["2024-11-15", "2024-11-30"],
      ["2024-12-01", "2024-12-31"],
      ["2025-01-01", "2025-01-10"],
    ]);
    expect(monthChunks("2024-02-01", "2024-02-29")).toHaveLength(1); // artık yıl
  });

  it("Tek gün, ters veya boş aralık", () => {
    expect(monthChunks("2026-09-24", "2026-09-24")).toEqual([{ start: "2026-09-24", end: "2026-09-24", label: "Eyl 2026" }]);
    expect(monthChunks("2026-09-24", "2026-09-01")).toEqual([]);
    expect(monthChunks("", "2026-09-01")).toEqual([]);
  });

  it("Tarihi gün.ay.yıl biçiminde gösterir", () => {
    expect(formatDay("2025-01-31")).toBe("31.01.2025");
  });
});
