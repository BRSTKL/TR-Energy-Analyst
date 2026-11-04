import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PTF_BASE_MODEL, PTF_SHADOW_HYDRO } from "@/lib/ptf/champion";
import { readPtfChampion } from "@/lib/ptf/champion-store";
import type { PtfForecastLog } from "@/lib/ptf/forecast-log";
import { writePtfLog } from "@/lib/ptf/forecast-log-store";

const iso = (base: string, i: number) => new Date(Date.parse(`${base}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
const actualOf = (i: number) => Array(24).fill(3000 + (i % 7) * 100);

// Gerçekleşen PTF: 2026-09-01'den 120 gün (veri tabanı yerine)
vi.mock("@/lib/services/ptf-history", () => ({
  loadPtfHistory: async () => {
    const m = new Map<string, { ptf: number[] }>();
    for (let i = 0; i < 120; i++) m.set(iso("2026-09-01", i), { ptf: actualOf(i) });
    return m;
  },
}));

const { decidePtfChampion } = await import("@/lib/services/ptf-champion");

function dayLog(i: number, hydroRatio: number, onTime = true): PtfForecastLog {
  const date = iso("2026-09-01", i);
  const a = actualOf(i)[0];
  const e = 300 + (i % 5) * 20;
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, p50: a + e, q10: null, q90: null }));
  return {
    format: 1,
    targetDate: date,
    issuedAt: "x",
    cutoff: "x",
    onTime,
    modelId: PTF_BASE_MODEL,
    hours,
    members: {},
    shadow: { [PTF_SHADOW_HYDRO]: Array(24).fill(a + e * hydroRatio) },
    inputs: { windKind: 1, fallbacks: [], live: [] },
    band: { days: 0, recentMae: null },
    cap: 4500,
  } as PtfForecastLog;
}

describe("decidePtfChampion (geçici veri havuzuyla)", () => {
  let dir: string;
  const prev = process.env.POOL_DIR;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ptf-champ-svc-"));
    process.env.POOL_DIR = dir;
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.POOL_DIR;
    else process.env.POOL_DIR = prev;
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function seed(days: number, hydroRatio: number) {
    for (let i = 0; i < days; i++) await writePtfLog(dayLog(i, hydroRatio));
  }

  /** Karar anı: hedef günden önceki gün 10:00 UTC (kesimden önce) */
  const at = (i: number) => new Date(`${iso("2026-09-01", i - 1)}T10:00:00Z`);

  it("28 gün dolmadan karar yok", async () => {
    await seed(20, 0.8);
    const d = await decidePtfChampion(iso("2026-09-01", 20), at(20));
    expect(d.decision).toBeNull();
    expect(d.reviewed).toBe(false);
  });

  it("hatayı %10 düşüren gölge sürüm terfi eder; defter yalnız commit ile yazılır", async () => {
    await seed(46, 0.9);
    const target = iso("2026-09-01", 46);
    const d = await decidePtfChampion(target, at(46));
    expect(d.decision?.to).toBe(PTF_SHADOW_HYDRO);
    expect(d.decision?.reason).toContain("terfi");
    expect(d.decision?.reason).not.toContain("maliyet");
    // commit çağrılmadan dosya yok
    expect((await readPtfChampion()).state).toBeNull();
    await d.commit();
    const reg = await readPtfChampion();
    expect(reg.state).toMatchObject({ modelId: PTF_SHADOW_HYDRO, since: target });
    expect(reg.state?.history[0]).toMatchObject({ modelId: PTF_BASE_MODEL, from: iso("2026-09-01", 0), to: target });
    // bekleme süresinde ikinci karar yok
    const again = await decidePtfChampion(iso("2026-09-01", 47), at(47));
    expect(again.decision).toBeNull();
    expect(again.registry.state?.modelId).toBe(PTF_SHADOW_HYDRO);
  });

  it("karar çıkmasa da sınama deftere yazılır ve bir hafta içinde yeniden sınanmaz", async () => {
    await seed(50, 1);
    const target = iso("2026-09-01", 46);
    const d = await decidePtfChampion(target, at(46));
    expect(d.decision).toBeNull();
    expect(d.reviewed).toBe(true);
    await d.commit();
    expect(await readPtfChampion()).toMatchObject({ state: null, reviewedOn: target });
    const next = await decidePtfChampion(iso("2026-09-01", 47), at(47));
    expect(next.reviewed).toBe(false);
    const week = await decidePtfChampion(iso("2026-09-01", 53), at(53));
    expect(week.reviewed).toBe(true);
  });

  it("geçmiş ya da bugünkü hedef için karar üretmez (geçmiş gün denemesi)", async () => {
    await seed(46, 0.9);
    const d = await decidePtfChampion(iso("2026-09-01", 46), new Date("2026-12-31T00:00:00Z"));
    expect(d.decision).toBeNull();
    expect(d.reviewed).toBe(false);
  });

  it("fark yoksa sürüm değişmez", async () => {
    await seed(46, 1);
    const d = await decidePtfChampion(iso("2026-09-01", 46), at(46));
    expect(d.decision).toBeNull();
    await d.commit();
    expect((await readPtfChampion()).state).toBeNull();
  });

  it("kesimden sonra yazılmış kayıt skora girmez", async () => {
    for (let i = 0; i < 46; i++) await writePtfLog(dayLog(i, 0.8, false));
    const d = await decidePtfChampion(iso("2026-09-01", 46), at(46));
    expect(d.decision).toBeNull();
  });
});
