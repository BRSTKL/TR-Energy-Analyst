import { describe, it, expect } from "vitest";
import { emptyUmmYear, mergeUmmYears, ummMonthQuery, ummMonthStatus, ummNeedsFetch, writeUmmMonth, type UmmYear } from "../lib/pool/umm-codec";
import { ensureUmmCoverage, type UmmStore } from "../lib/pool/umm-sync";

const msg = (id: number, start = "2025-03-05T10:00:00+03:00") => ({ id, caseStartDate: start, powerPlantName: `S${id}`, faultDetails: [] });

describe("writeUmmMonth", () => {
  it("bildirimleri kimliğe göre tekilleştirir, geçersiz satırı atlar", () => {
    const { doc, skipped } = writeUmmMonth(emptyUmmYear(2025), 3, [msg(1), msg(2), msg(1), { reason: "kimliksiz" }], new Date("2025-03-10T00:00:00Z"));
    expect(skipped).toBe(1);
    expect(doc.months["03"].ids).toEqual([1, 2]);
    expect(Object.keys(doc.messages).sort()).toEqual(["1", "2"]);
  });

  it("ay yeniden çekilince dönmeyen bildirim silinir, başka ayda geçen kalır", () => {
    const d = emptyUmmYear(2025);
    writeUmmMonth(d, 3, [msg(1), msg(2)], new Date("2025-03-10T00:00:00Z"));
    writeUmmMonth(d, 4, [msg(2, "2025-03-31T20:00:00+03:00"), msg(3)], new Date("2025-04-10T00:00:00Z"));
    // Mart yeniden çekilir: 1 artık yok, 2 Nisan listesinde de var
    writeUmmMonth(d, 3, [msg(4)], new Date("2025-07-10T00:00:00Z"));
    expect(Object.keys(d.messages).sort()).toEqual(["2", "3", "4"]);
  });
});

describe("yenileme kuralları", () => {
  it("santral havuzuyla aynı: eksik, geçici (bekleme süresi), kesin", () => {
    const d = emptyUmmYear(2025);
    expect(ummNeedsFetch(d, 3, new Date("2025-04-01T00:00:00Z"))).toBe(true);
    writeUmmMonth(d, 3, [], new Date("2025-04-02T00:00:00Z")); // ay bittikten sonra, kesinleşmeden
    expect(ummMonthStatus(d, 3)).toBe("provisional");
    expect(ummNeedsFetch(d, 3, new Date("2025-04-05T00:00:00Z"))).toBe(false); // 7 gün dolmadı
    expect(ummNeedsFetch(d, 3, new Date("2025-04-10T00:00:00Z"))).toBe(true);
    writeUmmMonth(d, 3, [], new Date("2025-07-15T00:00:00Z")); // ay sonundan 90 gün sonra
    expect(ummMonthStatus(d, 3)).toBe("final");
    expect(ummNeedsFetch(d, 3, new Date("2026-01-01T00:00:00Z"))).toBe(false);
  });

  it("sorgu gövdesi ayın ilk ve son anını Türkiye saatiyle verir; devam eden ayda bitiş bir saat öncesi", () => {
    expect(ummMonthQuery(2024, 2)).toEqual({ startDate: "2024-02-01T00:00:00+03:00", endDate: "2024-02-29T23:59:59+03:00", regionId: 1 });
    // 13.10.2026 15:20 UTC = 18:20 Türkiye → bitiş 17:00
    expect(ummMonthQuery(2026, 10, new Date("2026-10-13T15:20:00Z"))?.endDate).toBe("2026-10-13T17:00:00+03:00");
    // Biten ay: tam ay sonu
    expect(ummMonthQuery(2026, 9, new Date("2026-10-13T15:20:00Z"))?.endDate).toBe("2026-09-30T23:59:59+03:00");
    // Ayın ilk saati: sorgulanacak geçmiş saat yok
    expect(ummMonthQuery(2026, 11, new Date("2026-10-31T21:30:00Z"))).toBeNull();
  });
});

describe("ensureUmmCoverage", () => {
  function memoryStore(): UmmStore & { docs: Map<number, UmmYear>; writes: number } {
    const docs = new Map<number, UmmYear>();
    const s = {
      docs,
      writes: 0,
      read: async (y: number) => (docs.has(y) ? structuredClone(docs.get(y)!) : null),
      write: async (d: UmmYear) => {
        s.writes++;
        docs.set(d.year, structuredClone(d));
      },
    };
    return s;
  }

  it("eksik ayları çeker, gelecekteki ayı çekmez, ikinci çağrıda havuzdan okur", async () => {
    const store = memoryStore();
    const calls: string[] = [];
    const fetcher = async (q: { startDate: string }) => {
      calls.push(q.startDate.slice(0, 7));
      return [msg(Number(q.startDate.slice(5, 7)) * 10)];
    };
    const now = new Date("2025-12-20T00:00:00Z");
    const r1 = await ensureUmmCoverage("2025-11", "2026-01", fetcher, { now, store });
    expect(r1.map((r) => r.source)).toEqual(["epias", "epias", "future"]);
    expect(calls).toEqual(["2025-11", "2025-12"]);

    const r2 = await ensureUmmCoverage("2025-11", "2025-12", fetcher, { now: new Date("2025-12-20T12:00:00Z"), store });
    expect(r2.map((r) => r.source)).toEqual(["pool", "pool"]);
    expect(calls).toHaveLength(2);
  });

  it("hata veren ay kaydedilir, kalan aylar yazılır", async () => {
    const store = memoryStore();
    const fetcher = async (q: { startDate: string }) => {
      if (q.startDate.startsWith("2025-02")) throw new Error("ağ hatası");
      return [msg(Number(q.startDate.slice(5, 7)))];
    };
    const r = await ensureUmmCoverage("2025-01", "2025-03", fetcher, { now: new Date("2025-12-01T00:00:00Z"), store });
    expect(r.map((x) => x.source)).toEqual(["epias", "failed", "epias"]);
    expect(Object.keys(store.docs.get(2025)!.months).sort()).toEqual(["01", "03"]);
    expect(mergeUmmYears([store.docs.get(2025)!]).map((m) => m.id)).toEqual([1, 3]);
  });
});
