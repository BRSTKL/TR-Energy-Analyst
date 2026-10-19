/**
 * Rüzgâr üretim tahmini geriye dönük testi (kullanıcı 18.10.2026; güneşteki scripts/forecast-backtest.mts'in rüzgâr
 * karşılığı). Konumu ve geçmiş rüzgâr tahmini olan proje rüzgâr santralleri; test ayları Nisan 2025 – sonAy, her ay o aydan
 * önceki bütün verilerle eğitilir (2025-01'den, genişleyen pencere; eğitim ay başından 1 gün öncesine kadar: bilgi zamanı).
 * Model lib/forecast/wind-forecast.ts (güç eğrisi, `d2` tahmin rüzgârıyla). Adaylar: rüzgâr modeli (d2; temiz, ana
 * sonuç), ilk KGÜP (şirket, ana rakip), D-2 kalıcılık (48 saat önceki üretim; canlıda yok, kıyas tabanı); rüzgâr modeli
 * d1 ayrıca iyimser üst sınır (kesimden sonraki tahmin). Maliyet lib/forecast/production-backtest.ts (dönemin kuralı +
 * KÜPST). Saat kümeleri: tüm saatler, sıfır fiyat hariç, ve ADİL: kayıp saatleri (lib/services/wind-loss.ts; geçmiş
 * rüzgârla işaretlenen planlı kısıntı ve iki kaynaklı ≥ 6 saatlik plansız kayıp) bütün adaylardan çıkarılır.
 * Geçmiş tahminler önce `scripts/wind-forecast-sync.mts` ile çekilmiş olmalı. EPİAŞ'a gidilmez.
 * Rüzgâr motoru adayı (Aşama 23.2): "model + yoğunluk" aynı güç eğrisini hava yoğunluğuna göre eşdeğer hızla kurar
 * (lib/wind-engine/models/baseline.ts; d2 sıcaklık ve basınç, arşivde yoksa yoğunluksuzla aynı). Adaylar eşleştirilmiş
 * saatlerde değerlendirilir: eski sonuçtan birkaç saat farklı olabilir.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-forecast-backtest.mts [sonAy=karnedeki son tam ay]
 * Çıktı: .cache/forecast/wind-backtest.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import { evaluateForecasts, type CandidateResult } from "@/lib/forecast/production-backtest";
import { fitWindForecast } from "@/lib/forecast/wind-forecast";
import { fitWindBaseline, type WindEngineHour } from "@/lib/wind-engine/models/baseline";
import { hourMeanWind } from "@/lib/forecast/wind-loss";
import { readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { windLossStates } from "@/lib/services/wind-loss";
import { readWindForecastYear } from "@/lib/weather/weather-store";
import { karnePeriodEnd, lastFullMonth } from "@/lib/sector/period";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const defaultEnd = (() => {
  const y = new Date().getUTCFullYear();
  const e = karnePeriodEnd(y);
  return e ? `${y}-${String(lastFullMonth(e)).padStart(2, "0")}` : `${y}-08`;
})();
const [ly, lm] = (process.argv[2] ?? defaultEnd).split("-").map(Number);
const TRAIN_FROM = Date.UTC(2025, 0, 1);
const FIRST_TEST = { y: 2025, m: 4 };
const months: Array<{ y: number; m: number }> = [];
for (let y = FIRST_TEST.y, m = FIRST_TEST.m; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push({ y, m });
const end = Date.UTC(ly, lm, 1);

const market = new Map<number, MarketPriceRecord>(
  (await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(TRAIN_FROM), lt: new Date(end) } } })).map((m) => [
    m.timestamp.getTime(),
    { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice },
  ])
);

type Hour = WindEngineHour & { kgupFinal: number | null; lag48: number | null; fcD2: number | null; fcD1: number | null; fcRho: number | null };
type Sets = Record<string, Record<string, CandidateResult>>;
const plants = new Map(
  (await prisma.powerPlant.findMany({ where: { type: "RES", projectId: { not: null }, epiasPlantId: { not: null }, latitude: { not: null } }, select: { epiasPlantId: true, name: true, capacityMw: true, capacitySource: true } })).map((r) => [
    r.epiasPlantId!,
    r,
  ])
);
const results: Array<{ id: number; name: string; capacityMw: number; capacitySource: string | null; months: number; sets: Sets; lostHours: { planned: number; unplanned: number }; final: Record<string, CandidateResult> }> = [];
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

for (const [id, p] of plants) {
  if (!(await readPoolPlantInfo(id))?.location) continue;
  // Saatler: üretim, ilk / son KGÜP, PTF, 48 saat önceki üretim, d1 / d2 tahmin rüzgârı (saat ortalaması)
  const stamps = { d1: new Map<number, [number | null, number | null]>(), d2: new Map<number, [number | null, number | null]>() };
  // Yoğunluk için damga başına sıcaklık, yüzey ve deniz seviyesi basıncı
  const met = { d1: new Map<number, [number | null, number | null, number | null]>(), d2: new Map<number, [number | null, number | null, number | null]>() };
  let elevation: number | null = null;
  const hours: Hour[] = [];
  const uevmAt = new Map<number, number | null>();
  for (let y = 2025; y <= ly; y++) {
    const fc = await readWindForecastYear(id, y);
    if (fc) {
      const s0 = Date.parse(fc.start);
      for (const l of ["d1", "d2"] as const) fc.ws[l].forEach((w, i) => stamps[l].set(s0 + i * HOUR, [w, fc.dir[l][i]]));
      if (fc.temp) for (const l of ["d1", "d2"] as const) fc.temp[l].forEach((x, i) => met[l].set(s0 + i * HOUR, [x, fc.sp?.[l][i] ?? null, fc.msl?.[l][i] ?? null]));
      if (typeof fc.elevation === "number") elevation = fc.elevation;
    }
  }
  if (!stamps.d2.size) continue;
  const mean = (l: "d1" | "d2", t: number) => {
    const a = stamps[l].get(t);
    const b = stamps[l].get(t + HOUR);
    return hourMeanWind(a?.[0] ?? null, b?.[0] ?? null, a?.[1] ?? null, b?.[1] ?? null);
  };
  const avg = (x: number | null | undefined, y: number | null | undefined) => (x == null || y == null ? (x ?? y ?? null) : (x + y) / 2);
  const metMean = (l: "d1" | "d2", t: number, k: 0 | 1 | 2) => avg(met[l].get(t)?.[k], met[l].get(t + HOUR)?.[k]);
  for (let y = 2025; y <= ly; y++) {
    const d = await readPoolYear(id, y);
    if (!d) continue;
    const s0 = Date.parse(d.start);
    for (let i = 0; i < d.uevm.length; i++) {
      const t = s0 + i * HOUR;
      if (t < TRAIN_FROM || t >= end) continue;
      const u = d.uevm[i] === null ? null : Math.max(0, d.uevm[i]!);
      uevmAt.set(t, u);
      const w1 = mean("d1", t);
      const w2 = mean("d2", t);
      hours.push({ t, uevm: u, kgupFirst: d.kgupFirst[i], kgupFinal: d.kgupFinal?.[i] ?? null, ptf: market.get(t)?.ptf ?? null, ws: { d1: w1.ws, d2: w2.ws }, dir: { d1: w1.dir, d2: w2.dir }, temp: { d1: metMean("d1", t, 0), d2: metMean("d2", t, 0) }, pressure: { d1: metMean("d1", t, 1), d2: metMean("d2", t, 1) }, msl: { d1: metMean("d1", t, 2), d2: metMean("d2", t, 2) }, lag48: null, fcD2: null, fcD1: null, fcRho: null });
    }
  }
  for (const h of hours) h.lag48 = uevmAt.get(h.t - 48 * HOUR) ?? null;
  const tested: Hour[] = [];
  let used = 0;
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const to = Date.UTC(y, m, 1);
    const trainingEnd = from - DAY; // D-2'nin üretimi D-1 12:00'da elde: ayın ilk günü için en geç ay başından 2 gün önce
    const train = hours.filter((h) => h.t < trainingEnd);
    let d2: ReturnType<typeof fitWindForecast>;
    let d1: ReturnType<typeof fitWindForecast>;
    let rho: ReturnType<typeof fitWindBaseline>;
    try {
      d2 = fitWindForecast(train, p.capacityMw, { lead: "d2", trainingEnd });
      rho = fitWindBaseline(train, p.capacityMw, { lead: "d2", trainingEnd, density: true, elevationM: elevation });
      d1 = fitWindForecast(train, p.capacityMw, { lead: "d1", trainingEnd, leak: true });
    } catch (e) {
      if ((e as Error).name === "LeakageError") throw e;
      continue; // eğitim verisi yetersiz (devreye alma öncesi)
    }
    used++;
    for (const h of hours) if (h.t >= from && h.t < to) tested.push({ ...h, fcD2: d2.predict(h), fcD1: d1.predict(h), fcRho: rho.predict(h) });
  }
  if (!tested.length) continue;
  const states = await windLossStates(id, p.capacityMw, p.capacitySource);
  const state = (h: Hour) => states?.get(h.t);
  // Ana adaylar; d1 (sızıntılı üst sınır) ayrı çağrıda, ana adayların saatleriyle (ana kümeyi daraltmasın; denetim 18.10)
  const candidates = { "rüzgâr modeli": (h: Hour) => h.fcD2, "model + yoğunluk": (h: Hour) => h.fcRho, "ilk KGÜP": (h: Hour) => h.kgupFirst, "D-2": (h: Hour) => h.lag48 };
  const mainHours = (h: Hour) => h.fcD2 !== null && h.fcRho !== null && h.kgupFirst !== null && h.lag48 !== null;
  const withUpper = (filter: (h: Hour) => boolean) => ({
    ...evaluateForecasts(tested, candidates, market, "RES", filter),
    "rüzgâr modeli d1 (üst sınır)": evaluateForecasts(tested, { d1: (h: Hour) => (mainHours(h) ? h.fcD1 : null) }, market, "RES", filter).d1,
  });
  // Ana sonuç: tüm saatler. exPlanned / exLoss maskesinin "planlı" etiketi ilk KGÜP'e bakar: KGÜP'ün bildiği kısıntıyı
  // çıkardığı için modelden yana yanlıdır, ikincil (denetim 18.10)
  const sets: Sets = {
    all: withUpper(() => true),
    exZero: withUpper((h) => h.ptf === null || (h.ptf ?? 0) > 1),
    exPlanned: withUpper((h) => state(h) !== "planned"),
    exLoss: withUpper((h) => state(h) !== "planned" && state(h) !== "unplanned"),
  };
  const final = evaluateForecasts(tested, { "rüzgâr modeli": (h: Hour) => h.fcD2, "son KGÜP": (h: Hour) => h.kgupFinal }, market, "RES");
  const lostHours = { planned: tested.filter((h) => state(h) === "planned").length, unplanned: tested.filter((h) => state(h) === "unplanned").length };
  results.push({ id, name: p.name, capacityMw: p.capacityMw, capacitySource: p.capacitySource, months: used, sets, lostHours, final });
  const a = sets.all;
  const tl = (n: string) => a[n].totalTl / Math.max(1, a[n].uevmMwh);
  console.log(
    `${p.name.slice(0, 24).padEnd(24)} tüm saatler · hata %: model ${nf(a["rüzgâr modeli"].maePct)} KGÜP ${nf(a["ilk KGÜP"].maePct)} D-2 ${nf(a["D-2"].maePct)}  ` +
      `TL/MWh: model ${nf(tl("rüzgâr modeli"))} KGÜP ${nf(tl("ilk KGÜP"))}  ${a["rüzgâr modeli"].totalTl < a["ilk KGÜP"].totalTl ? "model ✓" : ""}`
  );
}

fs.mkdirSync(path.join(process.cwd(), ".cache", "forecast"), { recursive: true });
fs.writeFileSync(
  path.join(process.cwd(), ".cache", "forecast", "wind-backtest.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), period: { from: `${FIRST_TEST.y}-${String(FIRST_TEST.m).padStart(2, "0")}`, to: `${ly}-${String(lm).padStart(2, "0")}` }, plants: results })
);

const SET_LABEL: Record<string, string> = {
  all: "Tüm saatler (ana sonuç)",
  exZero: "Sıfır fiyat hariç (hafifçe modelden yana)",
  exPlanned: "Planlı kısıntı hariç (modelden yana: KGÜP'ün bildiği kısıntı çıkar)",
  exLoss: "Bütün kayıp saatleri hariç (modelden yana)",
};
const sum = (k: string, n: string, f: "totalTl" | "uevmMwh" | "hours") => results.reduce((s, r) => s + r.sets[k][n][f], 0);
const maeW = (k: string, n: string) => results.reduce((s, r) => s + r.sets[k][n].maeMwh * r.sets[k][n].hours, 0) / Math.max(1, sum(k, n, "uevmMwh"));
for (const k of Object.keys(SET_LABEL)) {
  console.log(`\n${SET_LABEL[k]} (${results.length} santral, ${sum(k, "ilk KGÜP", "hours")} saat):`);
  for (const n of ["rüzgâr modeli", "model + yoğunluk", "ilk KGÜP", "D-2", "rüzgâr modeli d1 (üst sınır)"]) {
    const wins = n === "ilk KGÜP" ? "" : `  ilk KGÜP'ten ucuz santral ${results.filter((r) => r.sets[k][n].totalTl < r.sets[k]["ilk KGÜP"].totalTl).length} / ${results.length}`;
    const vsBase = n === "model + yoğunluk" ? `  rüzgâr modelinden ucuz santral ${results.filter((r) => r.sets[k][n].totalTl < r.sets[k]["rüzgâr modeli"].totalTl).length} / ${results.length}` : "";
    console.log(`  ${n.padEnd(30)} ${nf(sum(k, n, "totalTl") / 1e6, 2)} M TL  (${nf(sum(k, n, "totalTl") / sum(k, n, "uevmMwh"))} TL/MWh, hata %${nf(maeW(k, n) * 100)})${wins}${vsBase}`);
  }
}
const fin = results.filter((r) => r.final["son KGÜP"].hours > 0);
console.log(`\nReferans (son planı olan saatler, ${fin.length} santral): rüzgâr modeli ${nf(fin.reduce((s, r) => s + r.final["rüzgâr modeli"].totalTl, 0) / 1e6, 2)} M TL, son KGÜP ${nf(fin.reduce((s, r) => s + r.final["son KGÜP"].totalTl, 0) / 1e6, 2)} M TL`);
await prisma.$disconnect();
