import { describe, expect, it } from "vitest";
import { isRole, ROLES, SECTION_ORDER, type TodaySection } from "@/lib/ui/today-view";

const ALL: TodaySection[] = ["tomorrow", "score", "market", "alerts", "portfolio"];

describe("Bugün görünümü", () => {
  it("her rol bütün bölümleri tam bir kez gösterir (hiçbiri gizlenmez)", () => {
    for (const r of ROLES) expect([...SECTION_ORDER[r.id]].sort()).toEqual([...ALL].sort());
  });
  it("isRole yalnız bilinen rolleri kabul eder", () => {
    expect(isRole("producer")).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});
