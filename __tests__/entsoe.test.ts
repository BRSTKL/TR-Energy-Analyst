import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptyEntsoeDoc,
  entsoePeriod,
  fxFor,
  isFullDay,
  latestFullDay,
  mergeHours,
  parseEcbTry,
  parseEntsoe,
  type EntsoeDoc,
} from "@/lib/pool/entsoe-codec";
import { syncEntsoe, type TextGet } from "@/lib/services/entsoe";

const fx = (name: string) =>
  fs.readFileSync(path.join(__dirname, "fixtures", "entsoe", name), "utf8");

const doc = (
  period: string,
  resolution: string,
  points: Array<[number, number]>,
  tag: "price.amount" | "quantity" = "price.amount"
) => `<?xml version="1.0"?>
<Publication_MarketDocument xmlns="urn:x"><type>A44</type><TimeSeries><mRID>1</mRID><curveType>A03</curveType><Period>
<timeInterval><start>${period.split("/")[0]}</start><end>${period.split("/")[1]}</end></timeInterval><resolution>${resolution}</resolution>
${points.map(([p, v]) => `<Point><position>${p}</position><${tag}>${v}</${tag}></Point>`).join("")}
</Period></TimeSeries></Publication_MarketDocument>`;

describe("parseEntsoe", () => {
  it("15 dakikalık fiyatı saatliğe ortalamayla indirir, Türkiye saatine çevirir", () => {
    // 2026-10-26T00:00Z başlangıç = Türkiye 03:00; 8 çeyrek = 2 saat
    const r = parseEntsoe(
      doc("2026-10-26T00:00Z/2026-10-26T02:00Z", "PT15M", [
        [1, 10],
        [2, 20],
        [3, 30],
        [4, 40],
        [5, 100],
        [6, 100],
        [7, 100],
        [8, 100],
      ]),
      "price.amount"
    );
    expect(r.kind).toBe("data");
    if (r.kind !== "data") return;
    const day = r.hours.get("2026-10-26")!;
    expect(day[3]).toBe(25);
    expect(day[4]).toBe(100);
    expect(day[5]).toBeNull();
  });

  it("eksik konumu öncekinin değeriyle doldurur ve son değeri dönem sonuna taşır (A03)", () => {
    const r = parseEntsoe(
      doc(
        "2026-10-26T00:00Z/2026-10-26T05:00Z",
        "PT60M",
        [
          [1, 5],
          [3, 9],
        ],
        "quantity"
      ),
      "quantity"
    );
    if (r.kind !== "data") throw new Error("veri bekleniyordu");
    const day = r.hours.get("2026-10-26")!;
    expect(day.slice(3, 8)).toEqual([5, 5, 9, 9, 9]);
    expect(r.points).toBe(2);
  });

  it("Türkiye gününü gece yarısında böler (UTC+3)", () => {
    const r = parseEntsoe(
      doc("2026-10-26T20:00Z/2026-10-26T23:00Z", "PT60M", [
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
      "price.amount"
    );
    if (r.kind !== "data") throw new Error("veri bekleniyordu");
    expect(r.hours.get("2026-10-26")![23]).toBe(1);
    expect(r.hours.get("2026-10-27")!.slice(0, 2)).toEqual([2, 3]);
  });

  it("gerçek yanıt: Bulgaristan gün öncesi (PT15M, eksik konumlu) iki gün", () => {
    const r = parseEntsoe(fx("bg-day-ahead.xml"), "price.amount");
    if (r.kind !== "data") throw new Error("veri bekleniyordu");
    expect(r.points).toBeGreaterThan(180);
    const d26 = r.hours.get("2026-10-26")!;
    expect(isFullDay(d26)).toBe(true);
    expect(d26.every((v) => (v as number) > -500 && (v as number) < 1000)).toBe(true);
  });

  it("gerçek yanıt: Türkiye → Bulgaristan akışı saatlik MW", () => {
    const r = parseEntsoe(fx("trbg.xml"), "quantity");
    if (r.kind !== "data") throw new Error("veri bekleniyordu");
    expect(isFullDay(r.hours.get("2026-10-26"))).toBe(true);
    expect(r.hours.get("2026-10-26")![0]).toBeGreaterThan(0);
  });

  it("veri yok (999) ve kimlik hatası Acknowledgement olarak gelir", () => {
    const none = parseEntsoe(fx("trdata.xml"), "price.amount");
    expect(none).toMatchObject({ kind: "ack", code: "999" });
    const bad = parseEntsoe(fx("badtoken.xml"), "price.amount");
    expect(bad).toMatchObject({ kind: "ack", code: "999" });
    expect((bad as { text: string }).text).toContain("Authentication");
    expect(() => parseEntsoe("<html>hata</html>", "price.amount")).toThrow(
      "ENTSO-E belgesi değil"
    );
  });
});

describe("mergeHours / yardımcılar", () => {
  it("yalnız dolu saatleri yazar, aynı değeri değişiklik saymaz", () => {
    const target: Record<string, Array<number | null>> = {};
    const a = new Map([
      ["2026-10-26", Array.from({ length: 24 }, (_, h) => (h < 3 ? h + 1 : null))],
    ]);
    expect(mergeHours(target, a)).toEqual({ added: 3, changed: 0 });
    expect(mergeHours(target, a)).toEqual({ added: 0, changed: 0 });
    const b = new Map([
      [
        "2026-10-26",
        Array.from({ length: 24 }, (_, h) => (h === 0 ? 9 : h === 5 ? 7 : null)),
      ],
    ]);
    expect(mergeHours(target, b)).toEqual({ added: 1, changed: 1 });
    expect(target["2026-10-26"][0]).toBe(9);
    expect(isFullDay(target["2026-10-26"])).toBe(false);
  });

  it("latestFullDay, entsoePeriod, fxFor, parseEcbTry", () => {
    const s = {
      "2026-10-25": Array(24).fill(1),
      "2026-10-26": Array(24).fill(1),
      "2026-10-27": [1, null, ...Array(22).fill(1)],
    };
    expect(latestFullDay(s)).toBe("2026-10-26");
    expect(entsoePeriod("2026-10-26")).toBe("202610252100");
    expect(fxFor({ "2026-10-23": 55.1 }, "2026-10-26")).toBe(55.1);
    expect(fxFor({ "2026-10-10": 55.1 }, "2026-10-26")).toBeNull();
    const ecb = `<gesmes:Envelope><Cube><Cube time="2026-10-27"><Cube currency="USD" rate="1.1"/><Cube currency="TRY" rate="55.513"/></Cube><Cube time="2023-05-01"><Cube currency="TRY" rate="20.1"/></Cube></Cube></gesmes:Envelope>`;
    expect(parseEcbTry(ecb)).toEqual({ "2026-10-27": 55.513 });
    expect(() => parseEcbTry("<x/>")).toThrow("ECB belgesi değil");
  });
});

describe("syncEntsoe", () => {
  const priceXml = (day: string) => {
    // Türkiye gününün 24 saati: UTC'de önceki gün 21:00'dan
    const start =
      new Date(Date.parse(`${day}T00:00:00Z`) - 3 * 3_600_000)
        .toISOString()
        .slice(0, 16) + "Z";
    const end =
      new Date(Date.parse(`${day}T00:00:00Z`) + 21 * 3_600_000)
        .toISOString()
        .slice(0, 16) + "Z";
    return doc(`${start}/${end}`, "PT60M", [[1, 100]]);
  };
  const ecb = `<gesmes:Envelope><Cube><Cube time="2026-10-27"><Cube currency="TRY" rate="55.5"/></Cube></Cube></gesmes:Envelope>`;
  const make = (respond: (params: Record<string, string>) => string) => {
    const calls: Array<Record<string, string>> = [];
    const get: TextGet = async (url, params) => {
      if (url.includes("ecb.europa.eu")) return ecb;
      calls.push(params ?? {});
      return respond(params ?? {});
    };
    const written: EntsoeDoc[] = [];
    return {
      get,
      calls,
      written,
      write: async (d: EntsoeDoc) => void written.push(structuredClone(d)),
    };
  };
  const now = new Date("2026-10-27T17:00:00Z"); // Türkiye 20:00

  it("boş havuzda 2024-01-01'den çeker; fiyat A44, akış A11 ve yön out → in", async () => {
    const h = make(() => priceXml("2026-10-27"));
    const r = await syncEntsoe({
      get: h.get,
      token: "t",
      read: async () => null,
      write: h.write,
      now,
    });
    expect(r.status).toBe("synced");
    expect(r.from).toBe("2024-01-01");
    expect(h.calls[0]).toMatchObject({
      documentType: "A44",
      in_Domain: "10YCA-BULGARIA-R",
      out_Domain: "10YCA-BULGARIA-R",
      periodStart: "202312312100",
    });
    const flow = h.calls.find(
      (c) => c.documentType === "A11" && c.in_Domain === "10YCA-BULGARIA-R"
    )!;
    expect(flow.out_Domain).toBe("10YTR-TEIAS----W"); // TR_BG: Türkiye'den Bulgaristan'a
    const last = h.written.at(-1)!;
    expect(last.fetchedAt).toBe(now.toISOString());
    expect(last.fx["2026-10-27"]).toBe(55.5);
    expect(last.prices.BG["2026-10-27"][5]).toBe(100);
    expect(h.written.slice(0, -1).every((d) => d.fetchedAt === null)).toBe(true); // ara kayıtlar tamamlanmış sayılmaz
  });

  it("havuz yeniyse çekmez; anahtar yoksa hata verir", async () => {
    const d = emptyEntsoeDoc();
    d.fetchedAt = "2026-10-27T16:40:00.000Z";
    const h = make(() => priceXml("2026-10-27"));
    expect(
      (
        await syncEntsoe({
          get: h.get,
          token: "t",
          read: async () => d,
          write: h.write,
          now,
        })
      ).status
    ).toBe("fresh");
    expect(h.calls).toHaveLength(0);
    await expect(
      syncEntsoe({ get: h.get, token: "", read: async () => d, write: h.write, now })
    ).rejects.toThrow("ENTSOE_TOKEN");
  });

  it("son tam günden 3 gün geriden çeker; 60 günden fazla geriye gitmez", async () => {
    const d = emptyEntsoeDoc();
    d.fetchedAt = "2026-10-20T10:00:00.000Z";
    for (const z of ["BG", "GR"] as const) d.prices[z]["2026-10-25"] = Array(24).fill(1);
    d.flows.TR_BG["2026-10-25"] = Array(24).fill(1);
    const h = make(() => priceXml("2026-10-27"));
    const r = await syncEntsoe({
      get: h.get,
      token: "t",
      read: async () => d,
      write: h.write,
      now,
    });
    // fiyat serileri ve TR_BG kendi son tam gününden (25'i) 3 gün geriden; akış serilerinin geri kalanı boş: 60 gün sınırı
    expect(r.from).toBe("2026-08-28");
    const bg = h.calls.find(
      (c) => c.documentType === "A44" && c.in_Domain === "10YCA-BULGARIA-R"
    )!;
    expect(bg.periodStart).toBe("202610212100");
    const old = emptyEntsoeDoc();
    old.fetchedAt = "2026-01-01T00:00:00.000Z";
    const r2 = await syncEntsoe({
      get: make(() => priceXml("2026-10-27")).get,
      token: "t",
      read: async () => old,
      write: async () => undefined,
      now,
    });
    expect(r2.from).toBe("2026-08-28");
  });

  it("hepsi 'veri yok' dönerse ya da başka hata kodu gelirse yazmadan hata verir", async () => {
    const none = make(() => fx("trdata.xml"));
    await expect(
      syncEntsoe({
        get: none.get,
        token: "t",
        read: async () => null,
        write: none.write,
        now,
      })
    ).rejects.toThrow("hiçbiri veri döndürmedi");
    expect(none.written).toHaveLength(0);
    const bad = make(() => fx("badtoken.xml").replace("999", "401"));
    await expect(
      syncEntsoe({
        get: bad.get,
        token: "t",
        read: async () => null,
        write: bad.write,
        now,
      })
    ).rejects.toThrow("401");
  });

  it("yarının fiyatı yoksa (999) diğer serilerle yazılır", async () => {
    const h = make((p) =>
      p.documentType === "A44" ? fx("trdata.xml") : priceXml("2026-10-27")
    );
    const r = await syncEntsoe({
      get: h.get,
      token: "t",
      read: async () => null,
      write: h.write,
      now,
    });
    expect(r.status).toBe("synced");
    expect(r.noData).toBeGreaterThan(0);
    expect(h.written.length).toBeGreaterThan(0);
  });

  it("ilk doldurma yarıda kesilirse kaldığı yerden sürer (ara kayıtlar tamamlanmış sayılmaz)", async () => {
    const saved: EntsoeDoc[] = [];
    const days = ["2024-01-02", "2024-02-02", "2024-03-02"];
    let n = 0;
    const flaky: TextGet = async (url, params) => {
      if (url.includes("ecb.europa.eu")) return ecb;
      // ilk iki parça (BG fiyatı) gelir, üçüncüde kesilir
      if (++n > 2) throw new Error("bağlantı koptu");
      return priceXml(days[n - 1]);
    };
    await expect(
      syncEntsoe({
        get: flaky,
        token: "t",
        read: async () => (saved.length ? saved.at(-1)! : null),
        write: async (d) => void saved.push(structuredClone(d)),
        now,
      })
    ).rejects.toThrow("bağlantı koptu");
    expect(saved.length).toBe(2);
    expect(saved.at(-1)!.fetchedAt).toBeNull();
    expect(Object.keys(saved.at(-1)!.prices.BG).length).toBeGreaterThan(0);
    // ikinci çalışma: BG'nin son tam gününden (2024-03-02 civarı) devam eder, 2024-01-01'e dönmez
    const second = make(() => priceXml("2026-10-27"));
    const r = await syncEntsoe({
      get: second.get,
      token: "t",
      read: async () => saved.at(-1)!,
      write: second.write,
      now,
    });
    const bg = second.calls.find(
      (c) => c.documentType === "A44" && c.in_Domain === "10YCA-BULGARIA-R"
    )!;
    expect(bg.periodStart > "202401010000").toBe(true);
    expect(r.status).toBe("synced");
  });

  it("zaman bütçesi dolarsa 'partial' döner, fetchedAt koymaz, hata vermez", async () => {
    const h = make(() => priceXml("2026-10-27"));
    const r = await syncEntsoe({
      get: h.get,
      token: "t",
      read: async () => null,
      write: h.write,
      now,
      budgetMs: -1,
    });
    expect(r.status).toBe("partial");
    expect(h.calls).toHaveLength(0);
    expect(h.written).toHaveLength(0);
  });
});
