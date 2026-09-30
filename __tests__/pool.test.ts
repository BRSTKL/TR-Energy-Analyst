import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  emptyYear, hoursInYear, isFinalFetch, monthStatus, monthsInRange, needsFetch, readRange, writeMonth,
} from "@/lib/pool/pool-codec";
import { listPoolPlants, readPoolYear, writePoolYear } from "@/lib/pool/pool-store";

const h = (iso: string) => new Date(`${iso}:00:00Z`);

describe("havuz biçimi", () => {
  it("yıl saat sayısı artık yılı bilir", () => {
    expect(hoursInYear(2025)).toBe(8760);
    expect(hoursInYear(2024)).toBe(8784);
  });

  it("ay yazma: sadece o ayın saatleri, eski değer silinir, çekim kaydı düşer", () => {
    const doc = emptyYear(1001, 2026);
    writeMonth(doc, "uevm", 2, [
      { timestamp: h("2026-02-01T00"), value: 1.23456 },
      { timestamp: h("2026-02-28T23"), value: 2 },
      { timestamp: h("2026-03-01T00"), value: 9 }, // ay dışı
    ], new Date("2026-03-05T00:00:00Z"));
    const feb0 = 31 * 24;
    expect(doc.uevm[feb0]).toBe(1.235);
    expect(doc.uevm[feb0 + 28 * 24 - 1]).toBe(2);
    expect(doc.uevm[feb0 + 28 * 24]).toBeNull();
    expect(doc.fetched.uevm["02"]).toBe("2026-03-05T00:00:00.000Z");

    writeMonth(doc, "uevm", 2, [{ timestamp: h("2026-02-01T00"), value: 5 }], new Date("2026-06-01T00:00:00Z"));
    expect(doc.uevm[feb0]).toBe(5);
    expect(doc.uevm[feb0 + 28 * 24 - 1]).toBeNull();
  });

  it("durum: eksik, geçici, kesin", () => {
    const doc = emptyYear(1, 2026);
    expect(monthStatus(doc, "kgupFirst", 1)).toBe("missing");
    writeMonth(doc, "kgupFirst", 1, [], new Date("2026-02-10T00:00:00Z"));
    expect(monthStatus(doc, "kgupFirst", 1)).toBe("provisional");
    expect(isFinalFetch(2026, 1, "2026-05-02T00:00:00Z")).toBe(true);
    writeMonth(doc, "kgupFirst", 1, [], new Date("2026-05-02T00:00:00Z"));
    expect(monthStatus(doc, "kgupFirst", 1)).toBe("final");
  });

  it("yeniden çekme: eksik ve bayat geçici evet, taze geçici ve kesin hayır", () => {
    const doc = emptyYear(1, 2026);
    const now = new Date("2026-09-30T12:00:00Z");
    expect(needsFetch(doc, "uevm", 8, now)).toBe(true);
    writeMonth(doc, "uevm", 8, [], new Date("2026-09-30T08:00:00Z"));
    expect(needsFetch(doc, "uevm", 8, now)).toBe(false);
    expect(needsFetch(doc, "uevm", 8, new Date("2026-10-02T00:00:00Z"))).toBe(true);
    writeMonth(doc, "uevm", 1, [], new Date("2026-09-01T00:00:00Z"));
    expect(needsFetch(doc, "uevm", 1, now)).toBe(false);
  });

  it("ay aralığı yıl sınırını geçer", () => {
    expect(monthsInRange("2025-11-15", "2026-02-01")).toEqual([
      { year: 2025, month: 11 }, { year: 2025, month: 12 }, { year: 2026, month: 1 }, { year: 2026, month: 2 },
    ]);
  });

  it("aralık okuma iki yılı birleştirir, boş saatleri atlar", () => {
    const a = emptyYear(7, 2025);
    const b = emptyYear(7, 2026);
    writeMonth(a, "uevm", 12, [{ timestamp: h("2025-12-31T23"), value: 3 }], new Date());
    writeMonth(b, "kgupFirst", 1, [{ timestamp: h("2026-01-01T00"), value: 4 }], new Date());
    const rows = readRange([b, a], "2025-12-31", "2026-01-01");
    expect(rows.map((r) => [r.timestamp.toISOString(), r.kgupFirst, r.uevm])).toEqual([
      ["2025-12-31T23:00:00.000Z", null, 3],
      ["2026-01-01T00:00:00.000Z", 4, null],
    ]);
  });
});

describe("havuz dosyaları", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "pool-"));
    process.env.POOL_DIR = dir;
  });
  afterAll(() => {
    delete process.env.POOL_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("yaz, oku, listele", async () => {
    expect(await readPoolYear(42, 2026)).toBeNull();
    const doc = writeMonth(emptyYear(42, 2026), "uevm", 3, [{ timestamp: h("2026-03-01T05"), value: 7 }], new Date());
    await writePoolYear(doc);
    const back = await readPoolYear(42, 2026);
    expect(back?.uevm[(31 + 28) * 24 + 5]).toBe(7);
    expect(await listPoolPlants()).toEqual([42]);
  });
});
