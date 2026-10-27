import { describe, expect, it } from "vitest";
import {
  REFERENCE_MIN_DAYS,
  buildDailyMarket,
  combinedRamp,
  dayClass,
  daySlice,
  emptyRt,
  eveningRamp,
  isValidDay,
  lastSystemDay,
  mixHours,
  netLoad,
  referenceBand,
  sunPlanBaseline,
  sunPlanBaselineFor,
  sunPlanRatio,
  sunPlanSuspect,
  supplyNetLoad,
  systemDay,
  type DailyInput,
  type Series24,
} from "@/lib/analysis/daily-market";
import type { MarketHour } from "@/lib/analysis/market-summary";
import { emptySystemYear, hourIndex, writeSystemMonth } from "@/lib/pool/system-codec";

const fill = (v: number | null): Series24 => Array(24).fill(v);
const hours = (f: (h: number) => number | null): Series24 => Array.from({ length: 24 }, (_, h) => f(h));

const ramp10 = hours((h) => ({ 15: 30000, 16: 32000, 17: 36000, 18: 40000, 19: 41000, 20: 39000, 21: 37000, 22: 35000 })[h] ?? 20000);
const ramp11 = hours((h) => ({ 15: 30000, 16: 33000, 17: 37000, 18: 41000, 19: 42000, 20: 40000, 21: 38000, 22: 36000 })[h] ?? 20000);

/** Bir gün için saatlik PTF geçmişi: tarihlerin hepsine aynı seri */
function history(from: string, to: string, f: (date: string) => number): Map<string, Series24> {
  const out = new Map<string, Series24>();
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    out.set(d, fill(f(d)));
  }
  return out;
}

const market = (date: string, f: (h: number) => { ptf: number; smf: number; dir?: string } | null): Array<MarketHour | null> =>
  Array.from({ length: 24 }, (_, h) => {
    const m = f(h);
    return m ? { t: Date.parse(`${date}T${String(h).padStart(2, "0")}:00:00Z`), ptf: m.ptf, smf: m.smf, systemDirection: m.dir ?? "DEFICIT", gipPrice: null } : null;
  });

function input(over: Partial<DailyInput> = {}): DailyInput {
  const rt = emptyRt();
  rt.wind = fill(2000);
  rt.sun = fill(0);
  return {
    date: "2026-10-26",
    market: market("2026-10-26", (h) => ({ ptf: 1000 + h * 100, smf: 1000 + h * 100 + 50 })),
    system: {
      consumption: fill(40000),
      rt,
      rtImportExport: fill(-500),
      kgupSun: fill(0),
      netInstruction: fill(10),
      upDelivered: fill(20),
      downDelivered: fill(-10),
    },
    history: new Map(),
    ...over,
  };
}

describe("günlük piyasa panosu: net yük ve rampa", () => {
  it("net yük = tüketim − gerçek zamanlı rüzgâr − KGÜP güneşi; eksik girdi null, sıfır değil", () => {
    const net = netLoad(fill(40000), fill(2000), hours((h) => (h === 5 ? null : 10000)));
    expect(net[0]).toBe(28000);
    expect(net[5]).toBeNull();
    expect(netLoad(hours((h) => (h === 1 ? null : 1)), fill(0), fill(0))[1]).toBeNull();
  });

  it("güneş KGÜP planından alınır: gerçek zamanlı (lisanslı) güneş net yükü yanlış yükseltir", () => {
    // Öğlen: tüketim 42000, rüzgâr 3000, KGÜP güneşi 17000 (lisanssız dahil), gerçek zamanlı güneş 3300 (yalnız lisanslı)
    const plan = netLoad(fill(42000), fill(3000), fill(17000))[0]!;
    const licensedOnly = netLoad(fill(42000), fill(3000), fill(3300))[0]!;
    expect(plan).toBe(22000);
    expect(licensedOnly - plan).toBe(13700);
  });

  it("akşam rampası: 15:00–22:00 arasında en büyük 3 saatlik artış", () => {
    const v: Record<number, number> = { 15: 30000, 16: 32000, 17: 36000, 18: 40000, 19: 41000, 20: 39000, 21: 37000, 22: 35000 };
    const ramp = eveningRamp(hours((h) => v[h] ?? 20000))!;
    expect([ramp.fromHour, ramp.toHour, ramp.rise]).toEqual([15, 18, 10000]);
    expect(ramp.perHour).toBeCloseTo(3333.33, 1);
  });

  it("rampa: uç saati eksik pencere atlanır; artış yoksa ya da veri yoksa null", () => {
    const v: Record<number, number | null> = { 15: 30000, 16: 32000, 17: 36000, 18: null, 19: 41000, 20: 39000, 21: 37000, 22: 35000 };
    const ramp = eveningRamp(hours((h) => (h in v ? v[h] : 20000)))!;
    // 15→18 atlanır; 16→19: 41000 − 32000
    expect([ramp.fromHour, ramp.toHour, ramp.rise]).toEqual([16, 19, 9000]);
    expect(eveningRamp(hours((h) => 50000 - h * 100))).toBeNull();
    expect(eveningRamp(fill(null))).toBeNull();
  });
});

describe("günlük piyasa panosu: arz tarafı net yük ve birleşik rampa", () => {

  it("arz tarafı net yük = rüzgâr ve güneş dışındaki gerçek zamanlı kaynaklar + net ithalat (eksi: ihracat)", () => {
    const rt = emptyRt();
    for (const k of Object.keys(rt) as Array<keyof typeof rt>) rt[k] = fill(0);
    rt.wind = fill(3000);
    rt.sun = fill(3300);
    rt.dam = fill(5000);
    rt.lignite = fill(9000);
    rt.naturalGas = fill(8000);
    const net = supplyNetLoad(rt, fill(-800));
    // 5000 + 9000 + 8000 − 800: rüzgâr ve güneş dahil değil
    expect(net[0]).toBe(21200);
    expect(supplyNetLoad(rt, hours((h) => (h === 2 ? null : 0)))[2]).toBeNull();
    rt.lignite = hours((h) => (h === 3 ? null : 9000));
    expect(supplyNetLoad(rt, fill(0))[3]).toBeNull();
  });

  it("birleşik rampa: iki tanımın ortalaması ve aralığı; pencere tüketim taraflının", () => {
    const r = combinedRamp(ramp10, ramp11)!;
    expect([r.fromHour, r.toHour]).toEqual([15, 18]);
    expect([r.rise, r.low, r.high, r.definitions]).toEqual([10500, 10000, 11000, 2]);
    expect(r.perHour).toBe(3500);
  });

  it("birleşik rampa: tek tanım varsa o (aralık daralır, 1 tanım), hiçbiri yoksa null", () => {
    const one = combinedRamp(fill(null), ramp11)!;
    expect([one.rise, one.low, one.high, one.definitions]).toEqual([11000, 11000, 11000, 1]);
    const other = combinedRamp(ramp10, fill(null))!;
    expect(other.definitions).toBe(1);
    expect(other.rise).toBe(10000);
    expect(combinedRamp(fill(null), fill(null))).toBeNull();
    expect(combinedRamp(hours((h) => 50000 - h * 10), fill(null))).toBeNull();
  });

  it("günlük özet: iki tanım varsa rampa cümlesi aralığı söyler; arz taraflı seri satırlarda", () => {
    const sys = input().system;
    sys.consumption = ramp10;
    for (const k of Object.keys(sys.rt) as Array<keyof typeof sys.rt>) sys.rt[k] = fill(0);
    sys.rt.lignite = ramp11;
    sys.rtImportExport = fill(0);
    sys.kgupSun = fill(0);
    const d = buildDailyMarket(input({ system: sys }));
    expect(d.net.ramp).toMatchObject({ fromHour: 15, toHour: 18, rise: 10500, low: 10000, high: 11000, definitions: 2 });
    expect(d.rows[17].netSupply).toBe(37000);
    expect(d.rows[17].net).toBe(36000);
    expect(d.sentences.join("\n")).toContain("net yük yaklaşık 10,5 GW arttı (iki tanım arasında 10,0 GW–11,0 GW");
    expect(d.warnings.join(" ")).not.toContain("tek tanımla");
  });

  it("yalnız tüketim taraflı hesaplanabiliyorsa tek tanım uyarısı çıkar", () => {
    const sys = input().system;
    sys.consumption = ramp10;
    sys.rtImportExport = fill(null);
    const d = buildDailyMarket(input({ system: sys }));
    expect(d.net.ramp?.definitions).toBe(1);
    expect(d.warnings.join(" ")).toContain("tek tanımla hesaplandı");
    expect(d.sentences.join(" ")).toContain("tek tanımla");
  });
});

describe("günlük piyasa panosu: KGÜP güneş planı eksik mi", () => {
  const noon = (v: number) => hours((h) => (h >= 8 && h <= 16 ? v : 0));

  it("oran: gündüz saatlerinde KGÜP güneşi / gerçek zamanlı güneş; gündüz saati azsa null", () => {
    expect(sunPlanRatio(noon(15000), noon(3000))).toBe(5);
    expect(sunPlanRatio(fill(0), fill(0))).toBeNull();
    // Yalnız 2 saat 800 MW'ın üstünde: yetersiz
    expect(sunPlanRatio(hours((h) => (h < 2 ? 5000 : 0)), hours((h) => (h < 2 ? 1000 : 0)))).toBeNull();
    expect(sunPlanRatio(fill(null), noon(3000))).toBeNull();
  });

  it("son günlerin ortancası; 7 günden azsa yok", () => {
    expect(sunPlanBaseline([4, 5, 6, 5, 4.5, 5.5, 5])).toBe(5);
    expect(sunPlanBaseline([4, 5, null, 5, 6, 5.5, 5, 6])).toBe(5);
    expect(sunPlanBaseline([4, 5, 6, 5, 4.5, 5.5])).toBeNull();
  });

  it("şüphe: oran 1'in altı ya da son 4 haftanın %70'inin altı; normal gün ve oran yok değil", () => {
    expect(sunPlanSuspect(0.6, null)).toBe(true);
    expect(sunPlanSuspect(2.5, 5)).toBe(true);
    expect(sunPlanSuspect(3.6, 5)).toBe(false);
    expect(sunPlanSuspect(5, 5)).toBe(false);
    expect(sunPlanSuspect(2.5, null)).toBe(false);
    expect(sunPlanSuspect(null, 5)).toBe(false);
  });

  it("havuz belgesinden taban: önceki 28 günün oranı", () => {
    const doc = emptySystemYear(2026);
    const from = (Date.UTC(2026, 8, 1) - Date.UTC(2026, 0, 1)) / 3_600_000;
    for (let day = 0; day < 20; day++) {
      for (let h = 8; h <= 16; h++) {
        doc.kgup.sun[from + day * 24 + h] = 15000;
        doc.rt.sun[from + day * 24 + h] = 3000;
      }
    }
    expect(sunPlanBaselineFor(doc, "2026-09-21")).toBe(5);
    expect(sunPlanBaselineFor(doc, "2026-09-05")).toBeNull(); // yalnız 4 önceki gün
    expect(sunPlanBaselineFor(null, "2026-09-21")).toBeNull();
  });

  it("plan eksik görünen gün: tüketim taraflı net yük, güneş planı ve lisanssız band gösterilmez; rampa yalnız arz taraflı; uyarı", () => {
    const sys = input().system;
    sys.consumption = ramp10;
    for (const k of Object.keys(sys.rt) as Array<keyof typeof sys.rt>) sys.rt[k] = fill(0);
    sys.rt.lignite = ramp11;
    sys.rt.sun = noon(3000);
    sys.rtImportExport = fill(0);
    sys.kgupSun = noon(4000); // oran 1,33; taban 5 → %70'in altı
    const d = buildDailyMarket(input({ system: sys, sunPlanBaseline: 5 }));
    expect(d.sunPlan.suspect).toBe(true);
    expect(d.sunPlan.ratio).toBeCloseTo(1.333, 2);
    expect(d.rows.every((r) => r.net === null && r.sunPlan === null)).toBe(true);
    expect(d.mix.every((m) => m.unlicensedSun === null)).toBe(true);
    expect(d.net.hours).toBe(0);
    expect(d.net.ramp).toMatchObject({ rise: 11000, definitions: 1 });
    expect(d.warnings.join(" ")).toContain("KGÜP güneş planı eksik görünüyor");
    expect(d.warnings.join(" ")).not.toContain("Net yük hesaplanamadı");
    expect(d.sentences.join(" ")).toContain("Akşam rampası");
    expect(d.sentences.join(" ")).not.toContain("Net yük en düşük");
  });

  it("plan tutarlı gün: şüphe yok, net yük ve birleşik rampa var", () => {
    const sys = input().system;
    sys.consumption = ramp10;
    for (const k of Object.keys(sys.rt) as Array<keyof typeof sys.rt>) sys.rt[k] = fill(0);
    sys.rt.lignite = ramp11;
    sys.rt.sun = noon(3000);
    sys.rtImportExport = fill(0);
    sys.kgupSun = noon(15000);
    const d = buildDailyMarket(input({ system: sys, sunPlanBaseline: 5 }));
    expect(d.sunPlan.suspect).toBe(false);
    expect(d.net.hours).toBe(24);
    expect(d.net.ramp?.definitions).toBe(2);
  });
});

describe("günlük piyasa panosu: gün sınıfı ve kıyas bandı", () => {
  it("tarih doğrulama: biçim ve takvim", () => {
    expect(isValidDay("2026-10-26")).toBe(true);
    expect(isValidDay("2024-02-29")).toBe(true);
    for (const bad of ["2026-13-40", "2026-02-30", "2025-02-29", "abc", "2026-1-1", "", "2026-10-26T00:00"]) expect(isValidDay(bad)).toBe(false);
  });

  it("gün sınıfı: tatil, yarım gün, hafta sonu, hafta içi", () => {
    expect(dayClass("2026-10-26")).toBe("weekday"); // Pazartesi
    expect(dayClass("2026-10-24")).toBe("weekend"); // Cumartesi
    expect(dayClass("2026-10-29")).toBe("holiday");
    expect(dayClass("2026-10-28")).toBe("half");
    expect(dayClass("2026-01-01")).toBe("holiday");
  });

  it("band yalnız aynı sınıftaki günlerden: hafta içi günü hafta sonu fiyatlarını katmaz", () => {
    const h = history("2026-09-26", "2026-10-25", (d) => (["weekend"].includes(dayClass(d)) ? 500 : 2000));
    const weekday = referenceBand("2026-10-26", h)!;
    expect(weekday.dayClass).toBe("weekday");
    expect(weekday.days).toBe(20);
    expect(weekday.median[0]).toBe(2000);
    expect([weekday.low[12], weekday.high[12]]).toEqual([2000, 2000]);
    const weekend = referenceBand("2026-10-24", h)!;
    expect(weekend.dayClass).toBe("weekend");
    expect(weekend.median[7]).toBe(500);
  });

  it("çeyrekler arası bant: değerler yayılınca low < median < high", () => {
    let i = 0;
    const h = history("2026-09-28", "2026-10-25", () => 1000 + 100 * i++);
    const b = referenceBand("2026-10-26", h)!;
    expect(b.low[3]!).toBeLessThan(b.median[3]!);
    expect(b.median[3]!).toBeLessThan(b.high[3]!);
  });

  it("yetersiz gün (az benzer gün ya da hiç yok): band yok", () => {
    const few = history("2026-10-19", "2026-10-23", () => 2000); // 5 hafta içi günü
    expect(few.size).toBeLessThan(REFERENCE_MIN_DAYS);
    expect(referenceBand("2026-10-26", few)).toBeNull();
    expect(referenceBand("2026-10-26", new Map())).toBeNull();
    // Tatil günü: son 28 günde tatil yok
    expect(referenceBand("2026-10-29", history("2026-09-28", "2026-10-25", () => 2000))).toBeNull();
  });
});

describe("günlük piyasa panosu: gün özeti", () => {
  it("fiyat özeti, yön sayıları, kapsama; sayılar sonlu", () => {
    const m = market("2026-10-26", (h) => ({ ptf: h < 2 ? 0 : 1000 + h * 100, smf: 1500, dir: h < 20 ? "DEFICIT" : h < 22 ? "SURPLUS" : "BALANCED" }));
    const d = buildDailyMarket(input({ market: m }));
    expect(d.prices.hours).toBe(24);
    expect(d.prices.zeroHours).toBe(2);
    expect(d.prices.ptfMax).toEqual({ hour: 23, value: 3300 });
    expect(d.prices.ptfMin!.value).toBe(0);
    expect(d.direction).toEqual({ deficit: 20, balanced: 2, surplus: 2, unknown: 0 });
    expect(d.coverage).toEqual({ market: 24, consumption: 24, wind: 24, sunPlan: 24 });
    expect(JSON.stringify(d)).not.toMatch(/NaN|Infinity|undefined/);
    // Yön toplamı 24
    expect(Object.values(d.direction).reduce((a, b) => a + b, 0)).toBe(24);
  });

  it("makas ortalama |SMF − PTF|; kıyas bandı varsa günün ortalaması ortancayla karşılaştırılır", () => {
    const h = history("2026-09-28", "2026-10-25", () => 2000);
    const m = market("2026-10-26", () => ({ ptf: 2200, smf: 2000 }));
    const d = buildDailyMarket(input({ market: m, history: h }));
    expect(d.prices.spreadMean).toBe(200);
    expect(d.prices.vsReferencePct).toBeCloseTo(10, 6);
    expect(d.sentences[0]).toContain("+%10");
    expect(d.rows[3].refMedian).toBe(2000);
  });

  it("eksik piyasa saati null kalır; uyarı çıkar; eksik sistem verisinde net yük hesaplanmaz", () => {
    const m = market("2026-10-26", (h) => (h === 4 ? null : { ptf: 1000, smf: 1000 }));
    const sys = input().system;
    sys.consumption = fill(null);
    const d = buildDailyMarket(input({ market: m, system: sys }));
    expect(d.prices.hours).toBe(23);
    expect(d.rows[4].ptf).toBeNull();
    expect(d.warnings.join(" ")).toContain("Piyasa verisi 23/24");
    expect(d.warnings.join(" ")).toContain("Net yük hesaplanamadı");
    expect(d.net.hours).toBe(0);
    expect(d.net.ramp).toBeNull();
    expect(d.sentences.join(" ")).not.toContain("Net yük");
    expect(d.warnings.join(" ")).toContain("Kıyas bandı yok");
  });

  it("hiç piyasa verisi yok: özet boş, cümle uydurulmaz", () => {
    const d = buildDailyMarket(input({ market: market("2026-10-26", () => null) }));
    expect(d.prices.ptfMean).toBeNull();
    expect(d.prices.ptfMax).toBeNull();
    expect(d.direction.unknown).toBe(24);
    expect(d.sentences.some((s) => s.startsWith("PTF"))).toBe(false);
  });

  it("net yük cümleleri: en düşük / en yüksek saat, akşam rampası; PTF zirvesi net yük zirvesine bir saat yakınsa söylenir", () => {
    const sys = input().system;
    const net: Record<number, number> = { 12: 24700, 15: 33400, 16: 37600, 17: 40700, 18: 40600 };
    sys.consumption = hours((h) => 30000 + (net[h] !== undefined ? net[h] - 30000 : 0)); // rüzgâr 2000, güneş planı 0
    sys.rt.wind = fill(0);
    const m = market("2026-10-26", (h) => ({ ptf: h === 16 ? 4500 : 3000, smf: 3000 }));
    const d = buildDailyMarket(input({ system: sys, market: m }));
    expect(d.net.min).toEqual({ hour: 12, value: 24700 });
    expect(d.net.max).toEqual({ hour: 17, value: 40700 });
    expect(d.net.ramp).toMatchObject({ fromHour: 15, toHour: 18, rise: 7200 });
    const text = d.sentences.join("\n");
    expect(text).toContain("Akşam rampası: 15:00–18:00 arasında net yük 7,2 GW arttı");
    expect(text).toContain("net yükün en yüksek saatinin (17:00) en çok bir saat yakınında");
  });
});

describe("günlük piyasa panosu: kaynak karması", () => {
  it("gruplar toplanır; lisanssız güneş = KGÜP − gerçek zamanlı güneş (en az 0); gerçek zamanlı yoksa saat null", () => {
    const rt = emptyRt();
    rt.wind = hours((h) => (h === 3 ? null : 2000));
    rt.sun = fill(3000);
    rt.lignite = fill(5000);
    rt.importedCoal = fill(4000);
    rt.stoneCoal = fill(100);
    rt.fueloil = fill(10);
    rt.biomass = fill(40);
    const mix = mixHours(rt, hours((h) => (h === 1 ? 2000 : 17000)));
    expect(mix[0].wind).toBe(2000);
    expect(mix[0].coal).toBe(9100);
    expect(mix[0].other).toBe(50);
    expect(mix[0].unlicensedSun).toBe(14000);
    expect(mix[1].unlicensedSun).toBe(0); // plan gerçek zamanlıdan küçük: eksiye inmez
    expect(mix[3].wind).toBeNull();
    expect(mix[3].unlicensedSun).toBeNull();
  });

  it("yıl serisinden gün dilimi", () => {
    const year = Array.from({ length: 100 }, (_, i) => i);
    expect(daySlice(year, 10)[0]).toBe(10);
    expect(daySlice(year, 90)[23]).toBeNull(); // yıl serisinin dışı
  });
});

describe("günlük piyasa panosu: havuz belgesinden gün", () => {
  const doc = () => {
    const d = emptySystemYear(2026);
    const date = "2026-10-26T05:00:00+03:00";
    writeSystemMonth(
      d,
      10,
      {
        dpp: [{ date, gunes: 700, ruzgar: 1 }],
        uevm: [],
        lep: [],
        uecm: [],
        consumption: [{ date, consumption: 31000 }],
        up: [],
        down: [],
        rt: [{ date, wind: 2500, sun: 30, importExport: -800 }],
      },
      new Date("2026-10-27T00:00:00Z")
    );
    return d;
  };

  it("günün 24 saatlik dilimi doğru saate düşer; verisiz saat null", () => {
    const day = systemDay(doc(), "2026-10-26");
    expect(day.consumption[5]).toBe(31000);
    expect(day.rt.wind[5]).toBe(2500);
    expect(day.rt.sun[5]).toBe(30);
    expect(day.kgupSun[5]).toBe(700);
    expect(day.rtImportExport[5]).toBe(-800);
    expect(day.consumption[4]).toBeNull();
    expect(day.rt.wind[6]).toBeNull();
    expect(day.consumption).toHaveLength(24);
  });

  it("belge yoksa ya da eski biçimde (rt yok) seriler null; hata atmaz", () => {
    expect(systemDay(null, "2026-10-26").rt.wind.every((v) => v === null)).toBe(true);
    const old = doc() as Partial<ReturnType<typeof doc>>;
    delete old.rt;
    delete old.rtImportExport;
    const day = systemDay(old as ReturnType<typeof doc>, "2026-10-26");
    expect(day.rt.wind.every((v) => v === null)).toBe(true);
    expect(day.consumption[5]).toBe(31000);
  });

  it("gerçek zamanlı üretimi olan son gün", () => {
    expect(lastSystemDay(doc())).toBe("2026-10-26");
    expect(lastSystemDay(emptySystemYear(2026))).toBeNull();
    expect(lastSystemDay(null)).toBeNull();
    expect(hourIndex(2026, "2026-10-26T05:00:00+03:00")).toBeGreaterThan(0);
  });
});
