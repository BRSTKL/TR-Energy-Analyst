import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_PAGES,
  PROJECT_TABS,
  projectPageOf,
} from "@/components/nav/project-nav";

describe("proje alt menüsü", () => {
  it("adresten sayfa adı", () => {
    expect(projectPageOf("/projects/abc/results")).toBe("results");
    expect(projectPageOf("/projects/abc/dsg")).toBe("dsg");
    expect(projectPageOf("/projects/abc/plants/extra")).toBe("plants");
    expect(projectPageOf("/projects")).toBeNull();
    expect(projectPageOf("/market")).toBeNull();
  });
  it("her sekme ve analiz bağlantısı gerçek bir proje sayfası", () => {
    const dir = path.join(process.cwd(), "app", "(dashboard)", "projects", "[id]");
    for (const p of [
      ...PROJECT_TABS.map((t) => t.page),
      ...ANALYSIS_PAGES.map((a) => a.page),
      "import",
    ])
      expect(fs.existsSync(path.join(dir, p, "page.tsx")), p).toBe(true);
  });
  it("proje sayfalarının hepsine menüden ulaşılır", () => {
    const dir = path.join(process.cwd(), "app", "(dashboard)", "projects", "[id]");
    const linked = new Set<string>([
      ...PROJECT_TABS.map((t) => t.page),
      ...ANALYSIS_PAGES.map((a) => a.page),
      "import",
    ]);
    const pages = fs
      .readdirSync(dir)
      .filter((f) => fs.existsSync(path.join(dir, f, "page.tsx")));
    for (const p of pages) expect(linked.has(p as never), `${p} menüde yok`).toBe(true);
  });
});
