import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listSnapshotFiles, readSnapshot, SNAPSHOT_FORMAT, wallParts, writeSnapshot, type Snapshot } from "@/lib/pool/snapshot-store";

describe("snapshot-store", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-"));
    process.env.POOL_DIR = dir;
  });
  afterAll(() => {
    delete process.env.POOL_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const snap = (takenAt: string): Snapshot => ({
    format: SNAPSHOT_FORMAT,
    takenAt,
    wall: wallParts(new Date(takenAt)).iso,
    today: wallParts(new Date(takenAt)).day,
    tomorrow: wallParts(new Date(takenAt)).tomorrow,
    series: [{ id: "ptf", target: "tomorrow", day: "2026-10-28", endpoint: "/x", ok: true, status: null, error: null, count: 1, items: [{ date: "2026-10-28T00:00:00+03:00", price: 3900 }] }],
  });

  it("Türkiye duvar saatini ve yarını verir (UTC+3, gün sınırını aşar)", () => {
    const w = wallParts(new Date("2026-10-27T21:30:00Z")); // 28 Ekim 00:30 TR
    expect(w.day).toBe("2026-10-28");
    expect(w.hhmm).toBe("0030");
    expect(w.tomorrow).toBe("2026-10-29");
    expect(w.iso).toBe("2026-10-28T00:30:00+03:00");
  });

  it("yazar, okur ve çekim zamanına göre listeler", async () => {
    const a = await writeSnapshot(snap("2026-10-27T09:25:00Z")); // 12:25 TR
    await writeSnapshot(snap("2026-10-27T05:02:00Z")); // 08:02 TR
    expect(a.endsWith(path.join("2026-10-27", "1225.json.gz"))).toBe(true);
    const files = await listSnapshotFiles();
    expect(files.map((f) => path.basename(f))).toEqual(["0802.json.gz", "1225.json.gz"]);
    const back = await readSnapshot(files[1]);
    expect(back.series[0].items).toEqual([{ date: "2026-10-28T00:00:00+03:00", price: 3900 }]);
    expect(back.wall).toBe("2026-10-27T12:25:00+03:00");
  });

  it("aynı dakikada ikinci yazma var olanı bozmaz, hata verir", async () => {
    const first = snap("2026-10-27T10:00:00Z");
    await writeSnapshot(first);
    const other = snap("2026-10-27T10:00:30Z");
    other.series = [];
    await expect(writeSnapshot(other)).rejects.toThrow();
    const files = await listSnapshotFiles();
    const kept = await readSnapshot(files.find((f) => f.endsWith("1300.json.gz"))!);
    expect(kept.series).toHaveLength(1);
    expect(fs.readdirSync(path.dirname(files[0])).some((n) => n.endsWith(".tmp"))).toBe(false);
  });

  it("klasör yoksa boş liste verir", async () => {
    process.env.POOL_DIR = path.join(dir, "yok");
    expect(await listSnapshotFiles()).toEqual([]);
    process.env.POOL_DIR = dir;
  });
});
