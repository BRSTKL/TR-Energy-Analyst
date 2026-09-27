import { describe, it, expect } from "vitest";
import { describeGap, findDataGaps } from "@/lib/analysis/data-completeness";

const hours = (from: string, to: string) => {
  const out: number[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T23:00:00Z`); t += 3_600_000) out.push(t);
  return out;
};

describe("Veri bütünlüğü", () => {
  it("eksik ayı bulur, tam santrali raporlamaz", () => {
    const full = hours("2025-06-01", "2025-08-31");
    const noJuly = full.filter((t) => new Date(t).getUTCMonth() !== 6);
    const gaps = findDataGaps([
      { plantName: "Tam", timestamps: full },
      { plantName: "Boreas", timestamps: noJuly },
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].plantName).toBe("Boreas");
    expect(gaps[0].gapMonths).toEqual([{ month: "2025-07", hours: 0, expectedHours: 744 }]);
    expect(gaps[0].hours).toBe(full.length - 744);
    expect(describeGap(gaps[0])).toBe("Boreas: Temmuz 2025 yok");
  });

  it("kısmi ayı saat sayısıyla, yinelenen saatleri bir kez sayar", () => {
    const full = hours("2025-01-01", "2025-01-31");
    const partial = [...hours("2025-01-01", "2025-01-10"), ...hours("2025-01-01", "2025-01-02")];
    const gaps = findDataGaps([
      { plantName: "A", timestamps: full },
      { plantName: "B", timestamps: partial },
    ]);
    expect(gaps[0].gapMonths[0]).toEqual({ month: "2025-01", hours: 240, expectedHours: 744 });
    expect(describeGap(gaps[0])).toBe("B: Ocak 2025 eksik (240/744 saat)");
    expect(findDataGaps([])).toEqual([]);
  });
});
