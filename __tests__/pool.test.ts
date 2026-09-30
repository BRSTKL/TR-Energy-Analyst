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

  it("yeniden çekme: eksik evet; biten geçici ay haftada bir, devam eden ay günde bir; kesin hayır", () => {
    const doc = emptyYear(1, 2026);
    const now = new Date("2026-09-30T12:00:00Z");
    expect(needsFetch(doc, "uevm", 8, now)).toBe(true);
    writeMonth(doc, "uevm", 8, [], new Date("2026-09-29T08:00:00Z"));
    expect(needsFetch(doc, "uevm", 8, now)).toBe(false);
    expect(needsFetch(doc, "uevm", 8, new Date("2026-10-06T09:00:00Z"))).toBe(true);
    writeMonth(doc, "uevm", 9, [], new Date("2026-09-29T08:00:00Z"));
    expect(needsFetch(doc, "uevm", 9, now)).toBe(true);
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

describe("eksik tamamlama", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "pool-sync-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const day = (d: string) => `${d}T00:00:00+03:00`;
  function fakeFetchers(log: string[], fail?: (start: string) => boolean) {
    return {
      listUevcbs: async () => { log.push("uevcb"); return [{ id: 11, name: "U1" }, { id: 12, name: "U2" }]; },
      kgup: async (u: number, s: string) => { log.push(`kgup:${u}:${s}`); return [{ date: day(s), time: "01:00", toplam: 2 }]; },
      uevm: async (_: number, s: string) => {
        log.push(`uevm:${s}`);
        if (fail?.(s)) throw new Error("403");
        return [{ date: day(s), hour: "01:00", total: 3, wind: 3 }];
      },
    };
  }

  it("ilk çağrı EPİAŞ'tan çeker, ikinci çağrı havuzdan okur, gelecek ay atlanır", async () => {
    process.env.POOL_DIR = dir;
    const { ensurePlantCoverage } = await import("@/lib/pool/pool-sync");
    const now = new Date("2026-09-30T09:00:00Z");
    const log: string[] = [];
    const a = await ensurePlantCoverage(5, "2026-01-01", "2026-10-31", "FIRST", { now, fetchers: fakeFetchers(log) });
    expect(a.months.map((m) => m.source)).toEqual([...Array(9).fill("epias"), "future"]);
    // Birimler bir kez çözülür: dönem başı ve sonu (yeni santrale sonradan birim eklenebilir)
    expect(log.filter((l) => l === "uevcb")).toHaveLength(2);
    // KGÜP iki birimin toplamı
    expect(a.kgup.values.get(Date.UTC(2026, 0, 1, 1))).toBe(4);
    expect(a.uevm.values.get(Date.UTC(2026, 0, 1, 1))).toBe(3);
    expect(a.uevm.byFuel.wind).toBe(27);

    log.length = 0;
    const b = await ensurePlantCoverage(5, "2026-01-01", "2026-03-31", "FIRST", { now, fetchers: fakeFetchers(log) });
    expect(log).toEqual([]);
    expect(b.months.every((m) => m.source === "pool")).toBe(true);
    expect(b.uevcbs.map((u) => u.id)).toEqual([11, 12]);
    delete process.env.POOL_DIR;
  });

  it("başarısız ay kaydedilmez, tekrar çağrı sadece onu çeker", async () => {
    process.env.POOL_DIR = dir;
    const { ensurePlantCoverage } = await import("@/lib/pool/pool-sync");
    const now = new Date("2026-09-30T09:00:00Z");
    const log: string[] = [];
    const a = await ensurePlantCoverage(6, "2025-01-01", "2025-03-31", "FIRST", {
      now, fetchers: fakeFetchers(log, (s) => s === "2025-02-01"),
    });
    // İlk hatadan sonra kalan aylar denenmez
    expect(a.months.map((m) => m.source)).toEqual(["epias", "failed", "failed"]);
    expect(log.filter((l) => l.includes("2025-03"))).toEqual([]);
    log.length = 0;
    const b = await ensurePlantCoverage(6, "2025-01-01", "2025-03-31", "FIRST", { now, fetchers: fakeFetchers(log) });
    expect(b.months.map((m) => m.source)).toEqual(["pool", "epias", "epias"]);
    expect(log.filter((l) => l.includes("2025-01"))).toEqual([]);
    delete process.env.POOL_DIR;
  });
});

describe("yeni santral", () => {
  it("dönem başındaki verisiz aylar işletme öncesi sayılır, eksik uyarısı üretmez", async () => {
    const { mergePlantSeries } = await import("@/lib/epias-plant/plant-data");
    const k = new Map<number, number>();
    const u = new Map<number, number>();
    for (let t = Date.UTC(2026, 1, 1); t < Date.UTC(2026, 3, 1); t += 3_600_000) { k.set(t, 1); u.set(t, 1); }
    const m = mergePlantSeries(
      { values: k, byFuel: {}, skipped: 0 }, { values: u, byFuel: {}, skipped: 0 }, "2026-01-01", "2026-03-31"
    );
    expect(m.coverage.map((c) => Boolean(c.preOperation))).toEqual([true, false, false]);
    expect(m.checks.some((c) => c.level === "warning")).toBe(false);
    expect(m.checks[0].message).toContain("Şubat 2026");
  });

  it("KGÜP boş, UEVM dolu: uzlaştırma birimleri ay sonuna göre yeniden bulunur", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pool-new-"));
    process.env.POOL_DIR = dir;
    const { ensurePlantCoverage } = await import("@/lib/pool/pool-sync");
    const lists: Record<string, Array<{ id: number; name: string }>> = { "2026-03-01": [{ id: 1, name: "eski" }] };
    const c = await ensurePlantCoverage(9, "2026-03-01", "2026-03-31", "FIRST", {
      now: new Date("2026-09-30T09:00:00Z"),
      fetchers: {
        listUevcbs: async (_: number, d: string) => lists[d] ?? [{ id: 1, name: "eski" }, { id: 2, name: "yeni" }],
        kgup: async (id: number, s: string) => (id === 2 ? [{ date: `${s}T00:00:00+03:00`, time: "01:00", toplam: 5 }] : []),
        uevm: async (_: number, s: string) => [{ date: `${s}T00:00:00+03:00`, hour: "01:00", total: 4 }],
      },
    });
    expect(c.uevcbs.map((u) => u.id)).toEqual([1, 2]);
    expect(c.kgup.values.get(Date.UTC(2026, 2, 1, 1))).toBe(5);
    delete process.env.POOL_DIR;
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("proje ekranı veri kontrolleri", () => {
  const series = (f: (t: number) => number | undefined, from: number, to: number) => {
    const values = new Map<number, number>();
    for (let t = from; t < to; t += 3_600_000) { const v = f(t); if (v !== undefined) values.set(t, v); }
    return { values, byFuel: {}, skipped: 0 };
  };
  const jan = Date.UTC(2026, 0, 1), mar = Date.UTC(2026, 2, 1), apr = Date.UTC(2026, 3, 1);

  it("dönem sonunda UEVM'si olmayan ay yayımlanmamış sayılır", async () => {
    const { mergePlantSeries } = await import("@/lib/epias-plant/plant-data");
    const m = mergePlantSeries(
      series(() => 1, jan, apr), series(() => 1, jan, mar), "2026-01-01", "2026-03-31", new Date("2026-04-10T00:00:00Z")
    );
    expect(m.coverage.map((c) => Boolean(c.unpublished))).toEqual([false, false, true]);
    expect(m.checks.some((c) => c.level === "warning")).toBe(false);
    expect(m.checks.some((c) => c.message.includes("Mart 2026") && c.message.includes("yayımlamadı"))).toBe(true);
  });

  it("çoğu saatte sıfır plan: eşleşme uyarısı yerine eksik plan uyarısı", async () => {
    const { mergePlantSeries } = await import("@/lib/epias-plant/plant-data");
    const k = series((t) => ((t / 3_600_000) % 3 === 0 ? 1 : 0), jan, mar);
    const u = series(() => 1, jan, mar);
    const m = mergePlantSeries(k, u, "2026-01-01", "2026-02-28");
    const warnings = m.checks.filter((c) => c.level === "warning").map((c) => c.message);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Plan eksik bildirilmiş");
  });
});

describe("ay ortasında devreye giren santral", () => {
  it("ilk veri saatinden önceki saatler eksik sayılmaz", async () => {
    const { mergePlantSeries } = await import("@/lib/epias-plant/plant-data");
    const values = new Map<number, number>();
    for (let t = Date.UTC(2026, 7, 4); t < Date.UTC(2026, 8, 1); t += 3_600_000) values.set(t, 1);
    const m = mergePlantSeries(
      { values, byFuel: {}, skipped: 0 }, { values: new Map(values), byFuel: {}, skipped: 0 }, "2026-07-01", "2026-08-31"
    );
    expect(m.coverage.map((c) => [c.month, c.hours, Boolean(c.preOperation)])).toEqual([["2026-07", 744, true], ["2026-08", 672, false]]);
    expect(m.checks.some((c) => c.level === "warning")).toBe(false);
    expect(m.checks[0].message).toContain("4 Ağustos 2026");
  });
});
