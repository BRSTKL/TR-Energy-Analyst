import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const state = { updatedAt: new Date("2026-01-01T00:00:00Z") };
vi.mock("@/lib/prisma", () => ({
  prisma: { project: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "yok" ? null : { updatedAt: state.updatedAt, plants: [], pricingProfiles: [] }) } },
}));
vi.mock("@/lib/services/project-records", () => ({ projectPeriod: async () => null }));

const dir = mkdtempSync(path.join(tmpdir(), "tre-resp-"));
process.env.RESPONSE_CACHE_DIR = dir;
const { cachedForProject, clearResponseCache, persistedJson, pruneResponseDisk } = await import("@/lib/services/response-cache");

const files = (project: string) => {
  try {
    return readdirSync(path.join(dir, project));
  } catch {
    return [];
  }
};

beforeEach(() => {
  clearResponseCache();
  state.updatedAt = new Date("2026-01-01T00:00:00Z");
  rmSync(dir, { recursive: true, force: true });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("yanıt önbelleği: disk katmanı", () => {
  it("bellek boşalınca (başka süreç / yeniden başlatma) sonuç diskten gelir, hesap yeniden yapılmaz", async () => {
    const compute = vi.fn(async () => ({ a: 1, list: [1, 2] }));
    expect(await cachedForProject("p1", "results", compute, { persist: true })).toEqual({ a: 1, list: [1, 2] });
    expect(files("p1")).toHaveLength(1);
    clearResponseCache();
    expect(await cachedForProject("p1", "results", compute, { persist: true })).toEqual({ a: 1, list: [1, 2] });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("veri sürümü değişince diskteki eski sonuç kullanılmaz ve üzerine yazılır", async () => {
    const compute = vi.fn(async () => ({ n: compute.mock.calls.length }));
    await cachedForProject("p1", "results", compute, { persist: true });
    clearResponseCache();
    state.updatedAt = new Date("2026-02-01T00:00:00Z");
    expect(await cachedForProject("p1", "results", compute, { persist: true })).toEqual({ n: 2 });
    expect(files("p1")).toHaveLength(1);
    clearResponseCache();
    expect(await cachedForProject("p1", "results", compute, { persist: true })).toEqual({ n: 2 });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("farklı anahtarlar ayrı dosyadır; persist verilmeyen hesap diske yazılmaz", async () => {
    await cachedForProject("p1", "results", async () => 1, { persist: true });
    await cachedForProject("p1", "dsg?plants=a,b", async () => 2, { persist: true });
    await cachedForProject("p1", "kpis", async () => new Map([[1, 2]]));
    expect(files("p1")).toHaveLength(2);
  });

  it("bozuk dosya yok sayılır ve hesap yapılır", async () => {
    await cachedForProject("p1", "results", async () => 1, { persist: true });
    writeFileSync(path.join(dir, "p1", files("p1")[0]), "bozuk");
    clearResponseCache();
    const compute = vi.fn(async () => 7);
    expect(await cachedForProject("p1", "results", compute, { persist: true })).toBe(7);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("proje yoksa ya da kimlik dosya adına uygun değilse diske dokunulmaz", async () => {
    expect(await cachedForProject("yok", "results", async () => 5, { persist: true })).toBe(5);
    expect(await cachedForProject("../kacak", "results", async () => 6, { persist: true })).toBe(6);
    expect(readdirSync(tmpdir()).includes("kacak")).toBe(false);
    expect(files("yok")).toHaveLength(0);
  });

  it("temizlik yalnız uzun süredir kullanılmayan dosyayı siler", async () => {
    await cachedForProject("p1", "eski", async () => 1, { persist: true });
    const old = path.join(dir, "p1", files("p1")[0]);
    const past = new Date(Date.now() - 20 * 86_400_000);
    utimesSync(old, past, past);
    await cachedForProject("p1", "yeni", async () => 2, { persist: true });
    expect(await pruneResponseDisk(14)).toBe(1);
    expect(files("p1")).toHaveLength(1);
  });
});

describe("persistedJson", () => {
  it("sürüm aynıyken diskten okur, değişince yeniden hesaplar", async () => {
    const compute = vi.fn(async () => ({ plants: [1, 2] }));
    expect(await persistedJson("_companies", "plants-2026", "v1", compute)).toEqual({ plants: [1, 2] });
    expect(await persistedJson("_companies", "plants-2026", "v1", compute)).toEqual({ plants: [1, 2] });
    expect(compute).toHaveBeenCalledTimes(1);
    await persistedJson("_companies", "plants-2026", "v2", compute);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(files("_companies")).toHaveLength(1);
  });
  it("shouldPersist false ise sonuç diske yazılmaz", async () => {
    const compute = vi.fn(async () => ({ errors: ["liste alınamadı"] }));
    await persistedJson("_companies", "plants-2025", "v1", compute, (v) => v.errors.length === 0);
    await persistedJson("_companies", "plants-2025", "v1", compute, (v) => v.errors.length === 0);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(files("_companies")).toHaveLength(0);
  });
});
