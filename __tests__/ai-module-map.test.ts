import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

test("harita yeni kaynakları alır; yok sayılan, silinen ve kapsam dışı dosyaları almaz", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-map-test-"));
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  try {
    execFileSync("git", ["init", "--quiet", root]);
    write(".gitignore", "scripts/tmp/\nlib/ignored.ts\n");
    write("lib/existing.ts", "/** Mevcut kaynak. */");
    write("lib/deleted.ts", "/** Silinmiş kaynak. */");
    execFileSync("git", ["add", "."], { cwd: root });
    fs.unlinkSync(path.join(root, "lib/deleted.ts"));
    write("lib/new.ts", "/** Yeni kaynak. */");
    write("lib/ignored.ts", "/** Yok sayılan. */");
    write("scripts/tmp/private.ts", "/** Özel betik. */");
    write("data/private.ts", "/** Kapsam dışı. */");
    const run = () => {
      execFileSync(process.execPath, ["--import", path.resolve("node_modules/tsx/dist/loader.mjs"), path.resolve("scripts/ai-module-map.mts")], { cwd: root });
      return fs.readFileSync(path.join(root, "ai/MODULE_MAP.md"), "utf8");
    };
    const map = run();
    expect(map).toContain("lib/new.ts");
    expect(map.match(/`lib\/existing.ts`/g)).toHaveLength(1);
    for (const excluded of ["deleted.ts", "ignored.ts", "private.ts"]) expect(map).not.toContain(excluded);
    expect(run()).toBe(map);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
