import { describe, expect, it } from "vitest";
import {
  emptyDsiDoc,
  latestNationalDate,
  mergeDsi,
  parseNational,
  parseProvince,
  type DsiDamDoc,
} from "@/lib/pool/dsi-dam-codec";
import { damOutlook, energyOccupancyByDay } from "@/lib/analysis/dsi-dam";
import { syncDsiDam, type DsiGet } from "@/lib/services/dsi-dam";

const nat = (purpose: string, date: string, occ: number, vol: number) => ({
  damPurpose: purpose,
  observationDate: date,
  averageOccupancyRatePercent: occ,
  activeVolumeMillionM3: vol,
});
const prov = (date: string, occ: number) => ({
  provincePlateCode: 6,
  provinceName: "Ankara",
  observationDate: date,
  occupancyRatePercent: occ,
  suppliedWaterMillionM3PerDay: 1.4,
  activeVolumeMillionM3: 398,
  drinkingWaterSupplyDaysRange: "278-436",
});

describe("parseNational / parseProvince", () => {
  it("geçerli satırları alır, bozuk olanı atlar ve sayar", () => {
    const r = parseNational([
      nat("Energy", "2026-10-26", 58.6, 46.3),
      nat("Hydro", "2026-10-26", 50, 1),
      nat("Energy", "26.10.2026", 50, 1),
      nat("Energy", "2026-10-27", 140, 1),
      { damPurpose: "Energy" },
    ]);
    expect(r.rows).toEqual([
      {
        purpose: "Energy",
        date: "2026-10-26",
        occupancyPct: 58.6,
        activeVolumeMm3: 46.3,
      },
    ]);
    expect(r.skipped).toBe(4);
    const p = parseProvince([prov("2026-10-26T00:00:00", 27.5), { provinceName: "x" }]);
    expect(p.rows[0]).toMatchObject({
      plate: "6",
      name: "Ankara",
      date: "2026-10-26",
      supplyDays: "278-436",
    });
    expect(p.skipped).toBe(1);
  });

  it("yanıt dizi değilse hata verir (API biçimi değişti)", () => {
    expect(() => parseNational({ error: "x" })).toThrow("dizi değil");
    expect(() => parseProvince(null)).toThrow("dizi değil");
  });
});

describe("mergeDsi", () => {
  it("yeni günü ekler, aynı günün değişen değerini günceller, aynı değeri saymaz", () => {
    const doc = emptyDsiDoc();
    const first = mergeDsi(
      doc,
      parseNational([nat("Energy", "2026-10-26", 58.6, 46.3)]).rows,
      parseProvince([prov("2026-10-26", 27.4)]).rows
    );
    expect(first).toEqual({ added: 2, changed: 0 });
    const second = mergeDsi(
      doc,
      parseNational([
        nat("Energy", "2026-10-26", 58.6, 46.3),
        nat("Energy", "2026-10-27", 58.3, 46),
      ]).rows,
      parseProvince([prov("2026-10-26", 27.5)]).rows
    );
    expect(second).toEqual({ added: 1, changed: 1 });
    expect(doc.national.Energy["2026-10-27"].occupancyPct).toBe(58.3);
    expect(doc.provinces["6"].days["2026-10-26"].occupancyPct).toBe(27.5);
    expect(latestNationalDate(doc)).toBe("2026-10-27");
    expect(latestNationalDate(doc, "Irrigation")).toBeNull();
  });
});

describe("syncDsiDam", () => {
  const harness = (
    published: string,
    doc: DsiDamDoc | null,
    national: unknown = [nat("Energy", published, 58, 46)]
  ) => {
    const calls: Array<{ path: string; params?: Record<string, string> }> = [];
    const get: DsiGet = async (path, params) => {
      calls.push({ path, params });
      if (path.includes("latest-published-date")) return { publishedDataDate: published };
      if (path.includes("national")) return national;
      return [prov(published, 27)];
    };
    const written: DsiDamDoc[] = [];
    return {
      calls,
      get,
      read: async () => (doc ? structuredClone(doc) : null),
      write: async (d: DsiDamDoc) => void written.push(d),
      written,
    };
  };

  it("boş havuzda 2024-01-01'den çeker ve yazar", async () => {
    const h = harness("2026-10-27", null);
    const r = await syncDsiDam({ ...h, now: new Date("2026-10-27T15:00:00Z") });
    expect(r.status).toBe("synced");
    expect(h.calls[1].params).toEqual({ from: "2024-01-01", to: "2026-10-27" });
    expect(h.written[0].publishedDate).toBe("2026-10-27");
    expect(h.written[0].national.Energy["2026-10-27"].occupancyPct).toBe(58);
  });

  it("havuz yayım gününü içeriyor ve çekim yeniyse yalnız yayım gününü sorar", async () => {
    const doc = emptyDsiDoc();
    doc.publishedDate = "2026-10-27";
    doc.fetchedAt = "2026-10-27T14:00:00.000Z";
    const h = harness("2026-10-27", doc);
    const r = await syncDsiDam({ ...h, now: new Date("2026-10-27T15:00:00Z") });
    expect(r.status).toBe("fresh");
    expect(h.calls).toHaveLength(1);
    expect(h.written).toHaveLength(0);
  });

  it("son kayıtlı günden 14 gün geriden çeker (DSİ düzeltmeleri)", async () => {
    const doc = emptyDsiDoc();
    doc.national.Energy["2026-10-20"] = { occupancyPct: 59, activeVolumeMm3: 46.6 };
    doc.publishedDate = "2026-10-20";
    doc.fetchedAt = "2026-10-20T15:00:00.000Z";
    const h = harness("2026-10-27", doc);
    await syncDsiDam({ ...h, now: new Date("2026-10-27T15:00:00Z") });
    expect(h.calls[1].params).toEqual({ from: "2026-10-06", to: "2026-10-27" });
  });

  it("ülke serisi boşsa ya da biçim bozuksa yazmadan hata verir", async () => {
    const empty = harness("2026-10-27", null, []);
    await expect(syncDsiDam({ ...empty })).rejects.toThrow("boş");
    expect(empty.written).toHaveLength(0);
    const bad = harness("2026-10-27", null, { error: "x" });
    await expect(syncDsiDam({ ...bad })).rejects.toThrow("dizi değil");
    expect(bad.written).toHaveLength(0);
  });

  it("yayım tarihi geçersizse hata verir", async () => {
    const h = harness("yok", null);
    await expect(syncDsiDam({ ...h })).rejects.toThrow("yayım tarihi");
  });
});

describe("damOutlook / energyOccupancyByDay", () => {
  const doc = () => {
    const d = emptyDsiDoc();
    const put = (date: string, occ: number) => {
      d.national.Energy[date] = { occupancyPct: occ, activeVolumeMm3: occ / 2 };
      d.national.Irrigation[date] = { occupancyPct: occ + 1, activeVolumeMm3: 1 };
    };
    put("2025-10-24", 40);
    put("2026-10-19", 60);
    put("2026-10-26", 58.6);
    d.provinces["6"] = {
      name: "Ankara",
      days: {
        "2026-10-26": {
          occupancyPct: 27.4,
          activeVolumeMm3: 396,
          suppliedMm3PerDay: 1.4,
          supplyDays: "277-434",
        },
        "2026-10-19": {
          occupancyPct: 27.9,
          activeVolumeMm3: 400,
          suppliedMm3PerDay: 1.4,
          supplyDays: null,
        },
      },
    };
    return d;
  };

  it("değişimleri, yıllık karşılaştırmayı ve eski veriyi hesaplar", () => {
    const o = damOutlook(doc(), "2026-10-28")!;
    expect(o.asOf).toBe("2026-10-26");
    expect(o.staleDays).toBe(2);
    const energy = o.purposes.find((p) => p.purpose === "Energy")!;
    expect(energy).toMatchObject({ occupancyPct: 58.6, weekAgoPct: 60, yearAgoPct: 40 });
    expect(o.purposes.find((p) => p.purpose === "DrinkingWater")).toBeUndefined();
    expect(o.cities[0]).toMatchObject({
      name: "Ankara",
      occupancyPct: 27.4,
      weekAgoPct: 27.9,
    });
    expect(o.seasonYears).toEqual([2025, 2026]);
    expect(o.season.find((s) => s.md === "10-24")).toMatchObject({
      "2025": 40,
      md: "10-24",
    });
  });

  it("havuz boşsa null; günlük seride son bilinen değeri en çok 5 gün taşır", () => {
    expect(damOutlook(null, "2026-10-28")).toBeNull();
    expect(damOutlook(emptyDsiDoc(), "2026-10-28")).toBeNull();
    const m = energyOccupancyByDay(doc(), "2026-10-19", "2026-10-31");
    expect(m.get("2026-10-22")).toBe(60); // 19'unun değeri
    expect(m.get("2026-10-24")).toBe(60); // 5 gün sonra: hâlâ taşınır
    expect(m.get("2026-10-25")).toBeUndefined(); // 6 gün sonra: taşınmaz
    expect(m.get("2026-10-26")).toBe(58.6);
  });
});
