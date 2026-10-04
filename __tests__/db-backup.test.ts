import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listBackups, pruneBackups } from "../lib/db-backup";

describe("Veritabanı yedek saklama (db-backup)", () => {
  let dir: string;
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

  it("En yeni N yedeği tutar, eskileri siler; .db dışındaki dosyalara dokunmaz", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
    const names = [
      "dev-2026-09-20_10-00-00-import.db",
      "dev-2026-09-21_10-00-00-startup.db",
      "dev-2026-09-22_10-00-00-delete-project.db",
      "dev-2026-09-23_10-00-00-startup.db",
    ];
    for (const n of names) fs.writeFileSync(path.join(dir, n), "");
    fs.writeFileSync(path.join(dir, "notlar.txt"), "");

    expect(listBackups(dir)[0]).toBe(names[3]);
    const removed = pruneBackups(2, dir);

    // Genel yedeklerden en yeni 2 tutulur; silme öncesi yedek ayrıca korunur
    expect(removed.sort()).toEqual([names[0]]);
    expect(listBackups(dir)).toEqual([names[3], names[2], names[1]]);
    expect(fs.existsSync(path.join(dir, "notlar.txt"))).toBe(true);
  });

  it("Klasör yoksa boş liste döner", () => {
    dir = "";
    expect(listBackups(path.join(os.tmpdir(), "olmayan-klasor-xyz"))).toEqual([]);
  });
});
