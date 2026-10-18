import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyProvisionalYear, mergeProduction, mergeProvisional, provisionalRange } from "@/lib/pool/provisional";

const H = 3_600_000;
const T = (s: string) => Date.parse(`${s}Z`);

describe("geçici üretim (EPİAŞ gerçek zamanlı üretimi)", () => {
  it("UEVM varsa o, yoksa geçici değer; UEVM gelince kesinleşir", () => {
    const uevm = new Map<number, number | null>([[T("2026-09-30T12:00:00"), 5], [T("2026-10-01T12:00:00"), null]]);
    const prov = new Map<number, number | null>([[T("2026-09-30T12:00:00"), 4.9], [T("2026-10-01T12:00:00"), 6]]);
    const m = mergeProduction(uevm, prov);
    expect(m.get(T("2026-09-30T12:00:00"))).toEqual({ mwh: 5, source: "UEVM" });
    expect(m.get(T("2026-10-01T12:00:00"))).toEqual({ mwh: 6, source: "GZÜ" });
    uevm.set(T("2026-10-01T12:00:00"), 6.1);
    expect(mergeProduction(uevm, prov).get(T("2026-10-01T12:00:00"))).toEqual({ mwh: 6.1, source: "UEVM" });
  });

  it("çekilecek aralık: UEVM ya da son çekimin ertesinden bugün − 2'ye", () => {
    expect(provisionalRange({ today: "2026-10-19", lastUevmDay: "2026-09-30", fetchedThrough: null })).toEqual({ from: "2026-10-01", to: "2026-10-17" });
    expect(provisionalRange({ today: "2026-10-19", lastUevmDay: "2026-09-30", fetchedThrough: "2026-10-16" })).toEqual({ from: "2026-10-17", to: "2026-10-17" });
    expect(provisionalRange({ today: "2026-10-19", lastUevmDay: "2026-09-30", fetchedThrough: "2026-10-17" })).toBeNull();
    // UEVM'si hiç olmayan santralde en çok 120 gün geriye
    expect(provisionalRange({ today: "2026-10-19", lastUevmDay: null, fetchedThrough: null })?.from).toBe("2026-06-21");
  });

  it("belgeye yalnız o yılın saatleri yazılır", () => {
    const d0 = emptyProvisionalYear(1, 2026, 99, "40WX");
    const vals = new Map<number, number>([[T("2026-10-01T10:00:00"), 3], [T("2027-01-01T10:00:00"), 9]]);
    const d1 = mergeProvisional(d0, vals, "2026-10-16", "x");
    expect(d1.values[(T("2026-10-01T10:00:00") - T("2026-01-01T00:00:00")) / H]).toBe(3);
    // Değer yalnız 1 Ekim'de: son çekilmiş gün o
    expect(d1.fetchedThrough).toBe("2026-10-01");
    expect(d0.values.every((v) => v === null)).toBe(true);
  });

  it("son gün yalnız değer gelen güne kadar ilerler: gelmeyen gün yeniden istenir; gece saati eksikliği engel değil", () => {
    const day = (d: string, n = 24) => new Map(Array.from({ length: n }, (_, h) => [T(`${d}T${String(h).padStart(2, "0")}:00:00`), 1] as [number, number]));
    const d0 = emptyProvisionalYear(1, 2026, 99, "40WX");
    // 15 Ekim gece saatleri eksik (18 saat), 16 Ekim hiç gelmedi
    const d1 = mergeProvisional(d0, day("2026-10-15", 18), "2026-10-16", "x");
    expect(d1.fetchedThrough).toBe("2026-10-15");
    expect(provisionalRange({ today: "2026-10-18", lastUevmDay: "2026-09-30", fetchedThrough: d1.fetchedThrough })).toEqual({ from: "2026-10-16", to: "2026-10-16" });
    // Eksik saatler sonradan gelince ilerler; daha eski bir çekim geri götürmez
    const d2 = mergeProvisional(d1, day("2026-10-16"), "2026-10-16", "y");
    expect(d2.fetchedThrough).toBe("2026-10-16");
    expect(mergeProvisional(d2, new Map(), "2026-10-10", "z").fetchedThrough).toBe("2026-10-16");
  });
});

describe("gerçekleşen üretim okuyucusu", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "realized-"));
    process.env.POOL_DIR = dir;
  });
  afterAll(() => {
    delete process.env.POOL_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("geçici saatleri ayrı sayar", async () => {
    const { writeProvisionalYear } = await import("@/lib/pool/pool-store");
    const { realizedHours } = await import("@/lib/services/realized-production");
    const doc = mergeProvisional(emptyProvisionalYear(7, 2026, 99, "40WX"), new Map([[T("2026-10-02T11:00:00"), 2.5]]), "2026-10-02", "x");
    await writeProvisionalYear(doc);
    const r = await realizedHours(7, "2026-10-02", "2026-10-02");
    expect(r).toEqual({ hours: [{ t: T("2026-10-02T11:00:00"), mwh: 2.5, source: "GZÜ" }], provisional: 1, final: 0 });
  });
});
