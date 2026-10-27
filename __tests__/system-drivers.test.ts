import { describe, expect, it } from "vitest";
import {
  dominantDriver,
  hourOfDayDrivers,
  monthlyDrivers,
  planGapDays,
  summarizeDrivers,
  systemYearHours,
  type DriverHour,
  type Group,
} from "@/lib/analysis/system-drivers";
import {
  emptySystemYear,
  hourIndex,
  SYSTEM_FORMAT,
  systemMonthQuery,
  systemNeedsFetch,
  upgradeSystemYear,
  writeSystemMonth,
  type SystemMonthRaw,
} from "@/lib/pool/system-codec";
import { ensureSystemCoverage } from "@/lib/pool/system-sync";
import { hourlyLossAccumulator, isOutageCause } from "@/lib/analysis/hourly-loss";

const dev = (d: Partial<Record<Group, number>>): Record<Group, number> => ({ wind: 0, sun: 0, river: 0, load: 0, dam: 0, gas: 0, coal: 0, other: 0, ...d });
const hour = (iso: string, direction: DriverHour["direction"], d: Partial<Record<Group, number>>, net: number | null = null): DriverHour => ({
  t: Date.parse(iso),
  direction,
  dev: dev(d),
  net,
});

describe("sistem yönü: baskın kaynak", () => {
  it("açıkta en eksi, fazlada en artı sürükleyen; dengeleyenler sayılmaz", () => {
    expect(dominantDriver(hour("2026-09-01T10:00:00Z", "DEFICIT", { wind: -50, sun: -300, load: -100, dam: -900 }))).toBe("sun");
    expect(dominantDriver(hour("2026-09-01T10:00:00Z", "SURPLUS", { wind: 400, load: 100, gas: 900 }))).toBe("wind");
  });

  it("hiçbir sürükleyen o yönde sapmadıysa açıklanamayan", () => {
    expect(dominantDriver(hour("2026-09-01T10:00:00Z", "DEFICIT", { wind: 50, sun: 10, coal: -500 }))).toBe("none");
  });

  it("özet: yön sayıları, ortalama sapma, uyum ve ay / saat kırılımı", () => {
    const hs = [
      hour("2026-08-31T23:00:00Z", "DEFICIT", { load: -400, wind: 100 }, 300),
      hour("2026-09-01T10:00:00Z", "DEFICIT", { sun: -200, wind: 50 }, 200),
      hour("2026-09-01T11:00:00Z", "SURPLUS", { wind: 300 }, -250),
      // Uyumsuz: sürükleyenler fazla yönde, sistem açıkta
      hour("2026-09-01T12:00:00Z", "DEFICIT", { wind: 100 }, 50),
    ];
    const s = summarizeDrivers(hs);
    expect(s.hours).toBe(4);
    expect(s.deficit.hours).toBe(3);
    expect(s.deficit.dominant).toMatchObject({ load: 1, sun: 1, none: 1 });
    expect(s.surplus.dominant.wind).toBe(1);
    expect(s.deficit.meanDev.wind).toBeCloseTo(250 / 3);
    // İtme: yalnız saatin yönündeki sapma (açıkta rüzgârın +100'ü sayılmaz)
    expect(s.deficit.push).toEqual({ load: 400 / 3, sun: 200 / 3, wind: 0, river: 0 });
    expect(s.surplus.push.wind).toBe(300);
    expect(s.deficit.instructed).toBeNull();
    expect(s.agreementPct).toBe(75);
    // Dengeli isabet: açıkta 2/3, fazlada 1/1 → %83,3 (ham %75)
    expect(s.deficitAgreementPct).toBeCloseTo(200 / 3);
    expect(s.surplusAgreementPct).toBe(100);
    expect(s.balancedAgreementPct).toBeCloseTo(250 / 3);
    expect(s.netCorrelation!).toBeLessThan(0);

    const months = monthlyDrivers(hs);
    expect(months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    expect(months[1].hours).toBe(3);
    const byHour = hourOfDayDrivers(hs);
    expect(byHour[10].dominant.deficit.sun).toBe(1);
    expect(byHour[11].surplusHours).toBe(1);
    expect(byHour[23].dominant.deficit.load).toBe(1);
    expect(byHour[23].push.deficit.load).toBe(400);
    expect(byHour[0].deficitHours).toBe(0);
  });
});

/** Bir saatlik EPİAŞ cevabı: KGÜP, UEVM ve tüketim alanları */
function rawHour(date: string, o: { kgupWind: number; uevmWind: number; lep: number; consumption: number; net?: number }): SystemMonthRaw {
  return {
    dpp: [{ date, ruzgar: o.kgupWind, gunes: 0, akarsu: 0, barajli: 0, dogalgaz: 10, linyit: 0, ithalKomur: 0, tasKomur: 0, fuelOil: 0, jeotermal: 0, biokutle: 0, nafta: 0, diger: 0 }],
    uevm: [{ date, wind: o.uevmWind, sun: 0, river: 0, dam: 0, naturalGas: 8, lng: 1, lignite: 0, importedCoal: 0, stoneCoal: 0, asphaltite: 5, fueloil: 0, geothermal: 0, biomass: 0, naphtha: 0, other: 0 }],
    lep: [{ date, lep: o.lep }],
    uecm: [{ period: date, hour: date, swv: o.consumption }],
    // Gerçek zamanlı tüketim UEÇM'den yüksek ölçülür ve hesapta kullanılmaz
    consumption: [{ date, consumption: o.consumption + 1500 }],
    up: [{ date, upRegulationDelivered: 100, net: o.net ?? 60 }],
    down: [{ date, downRegulationDelivered: -40, net: o.net ?? 60 }],
    // Gerçek zamanlı üretim: rüzgâr UEVM'den 50 düşük, lisanssız güneş yok; ithalat / ihracat 700
    rt: [{ date, total: o.uevmWind - 50 + 20, wind: o.uevmWind - 50, sun: 3, dammedHydro: 7, naturalGas: 4, lng: 2, importCoal: 1, wasteheat: 1, asphaltiteCoal: 2, importExport: 700 }],
  };
}

describe("sistem geneli havuz biçimi", () => {
  it("saat sırası duvar saatiyle; başka yılın saati alınmaz", () => {
    expect(hourIndex(2026, "2026-01-01T00:00:00+03:00")).toBe(0);
    expect(hourIndex(2026, "2026-01-02T05:00:00+03:00")).toBe(29);
    expect(hourIndex(2026, "2025-12-31T23:00:00+03:00")).toBeNull();
  });

  it("ay yazımı: kaynak eşleme, LNG doğalgaza, asfaltit diğere; ay dışı saat yazılmaz", () => {
    const doc = emptySystemYear(2026);
    const raw = rawHour("2026-09-01T00:00:00+03:00", { kgupWind: 1000, uevmWind: 900, lep: 40000, consumption: 41000 });
    // Yük tahmini sonraki ayın saatini de döndürür
    raw.lep.push({ date: "2026-10-01T00:00:00+03:00", lep: 1 });
    const { hours } = writeSystemMonth(doc, 9, raw, new Date("2026-10-20T00:00:00Z"));
    const i = hourIndex(2026, "2026-09-01T00:00:00+03:00")!;
    expect(hours).toMatchObject({ dpp: 1, uevm: 1, lep: 1, uecm: 1, consumption: 1, instructions: 1 });
    expect(doc.uecm[i]).toBe(41000);
    expect(doc.kgup.wind[i]).toBe(1000);
    expect(doc.uevm.wind[i]).toBe(900);
    expect(doc.uevm.naturalGas[i]).toBe(9);
    expect(doc.uevm.other[i]).toBe(5);
    expect(doc.netInstruction[i]).toBe(60);
    expect(doc.lep[hourIndex(2026, "2026-10-01T00:00:00+03:00")!]).toBeNull();

    // Yeniden yazımda ayın eski saatleri silinir
    writeSystemMonth(doc, 9, { dpp: [], uevm: [], lep: [], uecm: [], consumption: [], up: [], down: [], rt: [] }, new Date("2026-10-27T00:00:00Z"));
    expect(doc.kgup.wind[i]).toBeNull();
    expect(doc.rt.wind[i]).toBeNull();
    expect(doc.rtImportExport[i]).toBeNull();
  });

  it("gerçek zamanlı üretim: kaynak eşleme (LNG doğalgaza, asfaltit ve atık ısı diğere), ithalat / ihracat ayrı seri", () => {
    const doc = emptySystemYear(2026);
    const raw = rawHour("2026-09-01T00:00:00+03:00", { kgupWind: 1000, uevmWind: 900, lep: 40000, consumption: 41000 });
    const { hours } = writeSystemMonth(doc, 9, raw, new Date("2026-10-20T00:00:00Z"));
    const i = hourIndex(2026, "2026-09-01T00:00:00+03:00")!;
    expect(hours.rt).toBe(1);
    expect(doc.rt.wind[i]).toBe(850);
    expect(doc.rt.sun[i]).toBe(3);
    expect(doc.rt.dam[i]).toBe(7);
    expect(doc.rt.naturalGas[i]).toBe(6);
    expect(doc.rt.importedCoal[i]).toBe(1);
    expect(doc.rt.other[i]).toBe(3);
    expect(doc.rtImportExport[i]).toBe(700);
    // Cevapta olmayan saat 0 değil boş
    expect(doc.rt.wind[i + 1]).toBeNull();
    expect(doc.rtImportExport[i + 1]).toBeNull();
  });

  it("saatler: sapma işaretleri (artı = fazlaya iter), tüketimden ayın ortanca farkı çıkar, eksik saat atlanır", () => {
    const doc = emptySystemYear(2026);
    // Gerçek zamanlı tüketim = consumption + 1500 (rawHour); ham fark (tahmin − tüketim): −2500, −1500, −1000 → ortanca −1500
    const raw = rawHour("2026-09-01T00:00:00+03:00", { kgupWind: 1000, uevmWind: 900, lep: 40000, consumption: 41000 });
    const more = [
      rawHour("2026-09-01T01:00:00+03:00", { kgupWind: 1000, uevmWind: 1000, lep: 40000, consumption: 40000 }),
      rawHour("2026-09-01T02:00:00+03:00", { kgupWind: 1000, uevmWind: 1000, lep: 40000, consumption: 39500 }),
      rawHour("2026-09-01T03:00:00+03:00", { kgupWind: 1000, uevmWind: 1000, lep: 40000, consumption: 30000 }),
    ];
    more[2].lep = []; // tüketim tahmini yok: saat atlanır
    for (const m of more) for (const k of Object.keys(raw) as Array<keyof SystemMonthRaw>) raw[k].push(...m[k]);
    writeSystemMonth(doc, 9, raw, new Date("2026-10-20T00:00:00Z"));
    const t = Date.parse("2026-09-01T00:00:00Z");
    const hs = systemYearHours(doc, new Map([0, 1, 2, 3].map((k) => [t + k * 3_600_000, "DEFICIT" as const])));
    expect(hs).toHaveLength(3);
    expect(hs[0].dev.wind).toBe(-100);
    expect(hs.map((h) => h.dev.load)).toEqual([-1000, 0, 500]);
    expect(hs[0].dev.gas).toBe(-1);
    expect(dominantDriver(hs[0])).toBe("load");
    // Teslim edilen talimat: YAL artı, YAT artıya çevrilir
    expect([hs[0].up, hs[0].down]).toEqual([100, 40]);
    expect(summarizeDrivers(hs).deficit.instructed).toEqual({ up: 100, down: 40 });
  });

  it("kısıntı düzeltmesi: ölçülen kayıp rüzgâr / güneş sapmasına geri eklenir ve ayrıca raporlanır", () => {
    const doc = emptySystemYear(2026);
    // Rüzgâr planı 1000, üretim 900: düzeltmesiz −100; 80 MWh kısıntı geri eklenince −20 (tahmin hatası)
    writeSystemMonth(doc, 9, rawHour("2026-09-01T00:00:00+03:00", { kgupWind: 1000, uevmWind: 900, lep: 100, consumption: 100 }), new Date("2026-10-20T00:00:00Z"));
    const t = Date.parse("2026-09-01T00:00:00Z");
    const i = hourIndex(2026, "2026-09-01T00:00:00+03:00")!;
    const wind = new Array(8760).fill(0);
    const sun = new Array(8760).fill(0);
    wind[i] = 80;
    sun[i] = 5;
    const dir = new Map([[t, "SURPLUS" as const]]);
    const plain = systemYearHours(doc, dir);
    const fixed = systemYearHours(doc, dir, undefined, { wind, sun });
    expect(plain[0].dev.wind).toBe(-100);
    expect(plain[0].curtailed).toBeUndefined();
    expect(fixed[0].dev.wind).toBe(-20);
    expect(fixed[0].dev.sun).toBe(5);
    expect(summarizeDrivers(fixed).surplus.curtailed).toEqual({ wind: 80, sun: 5, river: 0 });
    expect(summarizeDrivers(plain).surplus.curtailed).toEqual({ wind: 0, sun: 0, river: 0 });
  });

  it("saatlik kayıp toplayıcı: yıla göre saat sırası, iki seri, bildirimle dışarıda bırakılan", () => {
    const acc = hourlyLossAccumulator("RES", [2025, 2026]);
    acc.addPlant();
    acc.addPlant();
    acc.add(Date.parse("2026-01-01T05:00:00Z"), 10, "long");
    acc.add(Date.parse("2026-01-01T05:00:00Z"), 2.5, "long");
    acc.add(Date.parse("2025-12-31T23:00:00Z"), 4, "short");
    acc.add(Date.parse("2024-06-01T00:00:00Z"), 99, "long"); // kapsam dışı yıl
    acc.exclude(7);
    const f = acc.toFile(new Date("2026-10-20T00:00:00Z"));
    expect(f.plants).toBe(2);
    expect(f.excludedMwh).toBe(7);
    expect(f.years["2026"].long[5]).toBe(12.5);
    expect(f.years["2025"].short[8759]).toBe(4);
    expect(f.years["2025"].long.reduce((a, b) => a + b, 0)).toBe(0);
    expect([isOutageCause("fault"), isOutageCause("maintenance"), isOutageCause("curtailment"), isOutageCause(null)]).toEqual([true, true, false, false]);
  });

  it("plan eksik gün: günlük UEVM KGÜP'ün 1,5 katını aşarsa gün bütünüyle dışarıda", () => {
    const doc = emptySystemYear(2026);
    const day = (d: string, kgupWind: number, uevmWind: number) => {
      const raw = rawHour(`${d}T12:00:00+03:00`, { kgupWind, uevmWind, lep: 100, consumption: 100 });
      raw.dpp.push({ ...(raw.dpp[0] as object), date: `${d}T13:00:00+03:00` });
      raw.uevm.push({ ...(raw.uevm[0] as object), date: `${d}T13:00:00+03:00` });
      raw.lep.push({ date: `${d}T13:00:00+03:00`, lep: 100 });
      raw.consumption.push({ date: `${d}T13:00:00+03:00`, consumption: 100 });
      raw.uecm.push({ hour: `${d}T13:00:00+03:00`, swv: 100 });
      return raw;
    };
    const a = day("2026-09-01", 1000, 1400); // 1,4 kat: tahmin hatası, kalır
    const b = day("2026-09-02", 1000, 1600); // 1,6 kat: plan eksik
    for (const k of Object.keys(a) as Array<keyof SystemMonthRaw>) a[k].push(...b[k]);
    writeSystemMonth(doc, 9, a, new Date("2026-10-20T00:00:00Z"));
    expect(Array.from(planGapDays(doc).entries())).toEqual([["2026-09-02", ["wind"]]]);
    const dir = new Map<number, "DEFICIT" | "SURPLUS">();
    for (const d of ["2026-09-01", "2026-09-02"]) for (const h of [12, 13]) dir.set(Date.parse(`${d}T${h}:00:00Z`), "SURPLUS");
    const hs = systemYearHours(doc, dir);
    expect(hs.map((h) => new Date(h.t).toISOString().slice(0, 13))).toEqual(["2026-09-01T12", "2026-09-01T13"]);
  });

  it("eski biçimdeki belge (UEÇM yok) yeni biçime taşınır ve bütün ayları yeniden çekilecek sayılır", () => {
    const old = emptySystemYear(2025) as Partial<ReturnType<typeof emptySystemYear>>;
    delete old.format;
    delete old.uecm;
    old.fetched = { "01": "2026-10-20T00:00:00.000Z" };
    const doc = upgradeSystemYear(old as ReturnType<typeof emptySystemYear>);
    expect(doc.format).toBe(SYSTEM_FORMAT);
    expect(doc.uecm).toHaveLength(8760);
    expect(systemNeedsFetch(doc, 1, new Date("2026-10-21T00:00:00Z"))).toBe(true);
  });

  it("biçim 2 belge (gerçek zamanlı üretim yok) biçim 3'e taşınır; mevcut seriler korunur", () => {
    const old = emptySystemYear(2026) as Partial<ReturnType<typeof emptySystemYear>>;
    old.format = 2;
    delete old.rt;
    delete old.rtImportExport;
    old.lep![5] = 123;
    old.fetched = { "09": "2026-10-20T00:00:00.000Z" };
    const doc = upgradeSystemYear(old as ReturnType<typeof emptySystemYear>);
    expect(doc.format).toBe(SYSTEM_FORMAT);
    expect(SYSTEM_FORMAT).toBe(3);
    expect(doc.rt.wind).toHaveLength(8760);
    expect(doc.rt.wind.every((v) => v === null)).toBe(true);
    expect(doc.rtImportExport).toHaveLength(8760);
    expect(doc.lep[5]).toBe(123);
    expect(systemNeedsFetch(doc, 9, new Date("2026-10-21T00:00:00Z"))).toBe(true);
  });

  it("günlük yenileme: ay içinde çekilen ay her Türkiye günü bir kez yenilenir; dün boşsa en az bir saat sonra yeniden denenir", () => {
    const doc = emptySystemYear(2026);
    const yesterdayLast = hourIndex(2026, "2026-10-20T23:00:00+03:00")!;
    // 20 Ekim 13:00'te (Türkiye) çekildi; aynı gün sonraki çalışmalar yeniden çekmez
    doc.fetched["10"] = "2026-10-20T10:00:00.000Z";
    doc.consumption[hourIndex(2026, "2026-10-19T23:00:00+03:00")!] = 30000;
    expect(systemNeedsFetch(doc, 10, new Date("2026-10-20T20:30:00Z"))).toBe(false);
    // Türkiye saatiyle gece yarısından sonra (21 Ekim 00:30) yeni gün: yenilenir
    expect(systemNeedsFetch(doc, 10, new Date("2026-10-20T21:30:00Z"))).toBe(true);
    // 21 Ekim 00:10'da çekildi, ama dünün (20 Ekim) son saati boş: bir saat dolmadan beklenir, sonra yeniden denenir
    doc.fetched["10"] = "2026-10-20T21:10:00.000Z";
    expect(systemNeedsFetch(doc, 10, new Date("2026-10-20T21:40:00Z"))).toBe(false);
    expect(systemNeedsFetch(doc, 10, new Date("2026-10-20T22:30:00Z"))).toBe(true);
    // Dünün son saati doluysa gün içinde bir daha çekilmez
    doc.consumption[yesterdayLast] = 31000;
    expect(systemNeedsFetch(doc, 10, new Date("2026-10-20T22:30:00Z"))).toBe(false);
    expect(systemNeedsFetch(doc, 10, new Date("2026-10-21T21:30:00Z"))).toBe(true);
  });

  it("yenileme: eksik ay çekilir, yeni çekilen geçici ay bekler, içinde bulunulan ay düne kadar", () => {
    const now = new Date("2026-10-20T09:00:00Z");
    expect(systemNeedsFetch(null, 9, now)).toBe(true);
    const doc = emptySystemYear(2026);
    doc.fetched["09"] = "2026-10-18T00:00:00.000Z";
    expect(systemNeedsFetch(doc, 9, now)).toBe(false);
    expect(systemNeedsFetch(doc, 9, new Date("2026-10-26T00:00:00Z"))).toBe(true);
    expect(systemMonthQuery(2026, 10, now)).toEqual({ startDate: "2026-10-01T00:00:00+03:00", endDate: "2026-10-19T23:00:00+03:00" });
    expect(systemMonthQuery(2026, 11, now)).toBeNull();
  });

  it("tamamlama: gelecek ay çekilmez, havuzdaki atlanır, hatalı ay kaydedilip devam edilir", async () => {
    const saved: Record<number, ReturnType<typeof emptySystemYear>> = {};
    const store = { read: async (y: number) => saved[y] ?? null, write: async (d: ReturnType<typeof emptySystemYear>) => void (saved[d.year] = d) };
    const asked: string[] = [];
    const fetcher = async (q: { startDate: string; endDate: string }) => {
      asked.push(q.startDate.slice(0, 7));
      if (q.startDate.startsWith("2026-08")) throw new Error("EPİAŞ 500");
      return rawHour(q.startDate, { kgupWind: 1, uevmWind: 1, lep: 1, consumption: 1 });
    };
    const now = new Date("2026-10-20T09:00:00Z");
    const r1 = await ensureSystemCoverage("2026-08", "2026-11", fetcher, { now, store });
    expect(r1.map((r) => r.source)).toEqual(["failed", "epias", "epias", "future"]);
    const r2 = await ensureSystemCoverage("2026-08", "2026-10", fetcher, { now, store });
    expect(r2.map((r) => r.source)).toEqual(["failed", "pool", "pool"]);
    expect(asked).toEqual(["2026-08", "2026-09", "2026-10", "2026-08"]);
  });
});
