import {windOos} from "@/lib/wind-engine/learning/oos";
import {calibratedWindBands} from "@/lib/wind-engine/models/calibrated-bands";
/**
 * Rüzgâr motoru aday sürümlerinin geriye dönük testi (Aşama 23.3–23.8; güneşteki scripts/analysis/solar-candidates-backtest.mts'in
 * rüzgâr karşılığı). scripts/analysis/wind-forecast-backtest.mts ile aynı kurulum: konumu ve geçmiş rüzgâr tahmini olan proje rüzgâr
 * santralleri; test ayları Nisan 2025 – sonAy; her ay o aydan önceki bütün verilerle (2025-01'den genişleyen pencere)
 * eğitilir, eğitim ay başından 1 gün önce biter (bilgi zamanı); hava `d2`; maliyet dönemin kuralıyla
 * (lib/forecast/production-backtest.ts). Temel: "rüzgâr modeli" (medyan güç eğrisi, lib/forecast/wind-forecast.ts). Ana
 * rakip ilk KGÜP. Adaylar eşleştirilmiş saatlerde (bir aday boşsa saat hepsinden düşer). Ana sonuç tüm saatler.
 * Kümeler (`--set`):
 *   - `phys` (23.3): fiziksel güç eğrisi (lib/wind-engine/models/physical-curve.ts: parametreli eğri, yön çarpanı, göbek
 *     yüksekliği, kesme üssü, durma histerezisi) yoğunluksuz ve yoğunluklu.
 *   - `prob` (23.6): temel tahminin P10 / P50 / P90'ı (models/probabilistic.ts; tahmin hızı dilimli örneklem dışı hata, her
 *     test ayı için önceki aylar, en az 3 ay) ve P10–P90 kapsaması; rampa olasılığının Brier'i iklim rakibine karşı.
 *   - `curt` (23.7): temel tahminden beklenen kısıntı düşülür: P(PTF ≤ 1) (lib/forecast/zero-price.ts, bütün saatler, her
 *     test ayı önceki 12 ay) × santralin kısma oranı (gerçekleşen rüzgârla beklenen üretim, lib/forecast/wind-loss.ts
 *     `detectWindLoss`; etiket gecikmesi `LABEL_DELAY_DAYS`). "üst sınır (SIZINTI)" PTF'yi bilir: aday değil.
 *   - `corr` (23.5): temel tahminin üstüne öğrenen düzeltme (lib/wind-engine/models/correction.ts; kararlılık, rampa, son
 *     günlerin hatası); her test ayının düzeltmesi önceki en çok 12 ayın örneklem dışı hatasıyla (sıfır fiyatlı saatler
 *     hariç), değerlendirme Temmuz 2025'ten (en az 3 aylık geçmiş).
 *   - `blend` (23.8): karışım w × temel + (1 − w) × ilk KGÜP, w önceki ayların maliyetiyle (models/blend.ts). ANALİZ: ilk
 *     KGÜP canlıda bizde yok. Çıktıda zayıf tahminci santraller listesi.
 * Ayarlar baştan sabittir; sonuca göre değiştirilmez. Kazanan aday ancak gölge sürüm karnesiyle canlıya alınır.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/wind-candidates-backtest.mts [sonAy=YYYY-AA] --set phys|prob|curt|corr|blend
 * Çıktı: .cache/forecast/wind-candidates-<küme>.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import { evaluateForecasts, type CandidateResult } from "@/lib/forecast/production-backtest";
import { fitWindForecast } from "@/lib/forecast/wind-forecast";
import { detectWindLoss } from "@/lib/forecast/wind-loss";
import { brier, buildZeroPriceRows, curtailedForecast, curtailmentRate, fitZeroPrice, zeroPriceClimatology, type ZeroPriceRow } from "@/lib/forecast/zero-price";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadWindPlantData, type WindDataHour } from "@/lib/wind-engine/data/wind-hours";
import { fitPhysicalCurve } from "@/lib/wind-engine/models/physical-curve";
import { buildRampRows, fitRampModel, fitWindQuantiles, rampClimatology, type RampRow } from "@/lib/wind-engine/models/probabilistic";
import { blendValue, fitBlendWeight, weakForecasters } from "@/lib/wind-engine/models/blend";
import { fitWindCorrection, windRecentError, type WindCorrectionInput } from "@/lib/wind-engine/models/correction";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Gerçekleşen rüzgârın (etiket) elde olma gecikmesi, gün (kötümser) */
const LABEL_DELAY_DAYS = 7;
const endArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? "2026-09";
const setArg = process.argv[process.argv.indexOf("--set") + 1];
const SETS = ["phys", "prob", "curt", "corr", "blend"] as const;
type SetName = (typeof SETS)[number];
if (!process.argv.includes("--set") || !SETS.includes(setArg as SetName)) {
  console.log(`Kullanım: --set ${SETS.join("|")}`);
  process.exit(1);
}
const SET = setArg as SetName;
const [ly, lm] = endArg.split("-").map(Number);
const TRAIN_FROM = Date.UTC(2025, 0, 1);
const MARKET_FROM = Date.UTC(2024, 0, 1);
const FIRST_TEST = { y: 2025, m: 4 };
const months: Array<{ y: number; m: number }> = [];
for (let y = FIRST_TEST.y, m = FIRST_TEST.m; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push({ y, m });
const end = Date.UTC(ly, lm, 1);
/** Olasılıksal ve düzeltme kümelerinde değerlendirme başı (en az 3 aylık örneklem dışı geçmiş) */
const CORR_FIRST = Date.UTC(FIRST_TEST.y, FIRST_TEST.m - 1 + 3, 1);

const marketRows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(MARKET_FROM), lt: new Date(end) } } });
const market = new Map<number, MarketPriceRecord>(
  marketRows.map((m) => [m.timestamp.getTime(), { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice }])
);
const ptfMap = new Map<number, number>(marketRows.map((m) => [m.timestamp.getTime(), m.ptf]));
const plants = await prisma.powerPlant.findMany({
  where: { type: "RES", projectId: { not: null }, epiasPlantId: { not: null }, latitude: { not: null } },
  select: { epiasPlantId: true, name: true, capacityMw: true, capacitySource: true },
});
const uniq = new Map(plants.map((p) => [p.epiasPlantId!, p]));
await prisma.$disconnect();

const NAMES: Record<SetName, string[]> = {
  phys: ["rüzgâr modeli", "fiziksel eğri", "fiziksel + yoğunluk", "ilk KGÜP"],
  prob: ["rüzgâr modeli", "P50", "ilk KGÜP"],
  curt: ["rüzgâr modeli", "+kısıntı", "üst sınır (SIZINTI)", "ilk KGÜP"],
  corr: ["rüzgâr modeli", "+düzeltme", "ilk KGÜP"],
  blend: ["rüzgâr modeli", "karışım", "ilk KGÜP"],
};
const LEAKY = ["üst sınır (SIZINTI)"];
/** Canlıda kurulamayan analiz adayları (ilk KGÜP'ü kullanır; ilk KGÜP kesimden sonra bildirilir): aday sayılmaz */
const NOT_LIVE = ["karışım"];
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 7);
type Hour = WindDataHour & { pred: Record<string, number | null> };
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const results: Array<{ id: number; name: string; capacityMw: number; notes: Record<string, number>; all: Record<string, CandidateResult> }> = [];
const rollingCoverage=new Map<string,[number,number]>();
const cover = { inside: 0, n: 0, byMonth: new Map<string, [number, number]>() };
const ramp = { model: 0, clim: 0, n: 0, events: 0 };
const blendByYear:Record<string,Array<{id:number;w:number;months:number}>>={};
const blendList: Array<{ id: number; name: string; w: number; months: number }> = [];

// Sıfır fiyat olasılığı (23.7): ay başına ortak model, bütün saatler (rüzgâr gece de üretir)
const zeroP = new Map<number, number>();
const zpBrier = { model: 0, clim: 0, n: 0 };
if (SET === "curt") {
  const hoursIn = (a: number, b: number) => Array.from(ptfMap.keys()).filter((t) => t >= a && t < b).sort((x, y) => x - y);
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const trainRows = buildZeroPriceRows(hoursIn(Date.UTC(y, m - 13, 1), from), ptfMap);
    const zm = fitZeroPrice(trainRows);
    if (!zm) continue;
    const clim = zeroPriceClimatology(trainRows);
    const lab = buildZeroPriceRows(hoursIn(from, Date.UTC(y, m, 1)), ptfMap).filter((r): r is ZeroPriceRow & { y: 0 | 1 } => r.y !== null);
    for (const r of lab) zeroP.set(r.t, zm.predict(r));
    zpBrier.model += brier(lab.map((r) => ({ p: zm.predict(r), y: r.y }))) * lab.length;
    zpBrier.clim += brier(lab.map((r) => ({ p: clim(r.t), y: r.y }))) * lab.length;
    zpBrier.n += lab.length;
  }
}

for (const [id, p] of uniq) {
  if (!(await readPoolPlantInfo(id))?.location) continue;
  const data = await loadWindPlantData(id, TRAIN_FROM, end, ptfMap);
  if (!data) continue;
  const cap = p.capacityMw;
  const yearlyWeights=new Map<number,number[]>();
  const rollingOos=SET==="prob"?windOos(data.hours,cap,end):[];
  const notes: Record<string, number> = {};
  const tested: Hour[] = [];
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const to = Date.UTC(y, m, 1);
    const trainingEnd = from - DAY;
    const train = data.hours.filter((h) => h.t < trainingEnd);
    let predict: (hs: WindDataHour[]) => Array<Record<string, number | null>>;
    try {
      const base = fitWindForecast(train, cap, { lead: "d2", trainingEnd });
      if (SET === "phys") {
        const phys = fitPhysicalCurve(train, cap, { trainingEnd });
        const physRho = fitPhysicalCurve(train, cap, { trainingEnd, density: true, elevationM: data.elevation });
        notes[`göbek ${phys.params.hubM} m`] = (notes[`göbek ${phys.params.hubM} m`] ?? 0) + 1;
        predict = (hs) => {
          const a = phys.predictSeries(hs);
          const b = physRho.predictSeries(hs);
          return hs.map((h, i) => ({ "rüzgâr modeli": base.predict(h), "fiziksel eğri": a[i], "fiziksel + yoğunluk": b[i] }));
        };
      } else predict = (hs) => hs.map((h) => ({ "rüzgâr modeli": base.predict(h) }));
    } catch (e) {
      if ((e as Error).name === "LeakageError") throw e;
      continue; // eğitim verisi yetersiz
    }
    const test = data.hours.filter((h) => h.t >= from && h.t < to);
    predict(test).forEach((pr, i) => tested.push({ ...test[i], pred: pr }));
  }
  if (!tested.length) continue;

  // Örneklem dışı seri üstüne kurulan kümeler: her test ayı yalnız önceki ayların tahmin ve gerçekleşeniyle
  const series = new Map(tested.map((h) => [h.t, { pred: h.pred["rüzgâr modeli"], actual: h.uevm }]));
  const corrInput = (h: Hour): WindCorrectionInput | null => {
    const v = h.pred["rüzgâr modeli"];
    if (v === null) return null;
    return {
      t: h.t,
      pred: v,
      pred3: series.get(h.t - 3 * HOUR)?.pred ?? null,
      pred6: series.get(h.t - 6 * HOUR)?.pred ?? null,
      ws: h.ws.d2,
      dir: h.dir.d2,
      ws10: h.ws10?.d2 ?? null,
      temp: h.temp?.d2 ?? null,
      recent: windRecentError(h.t, series, cap),
    };
  };
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const test = tested.filter((h) => h.t >= from && h.t < Date.UTC(y, m, 1));
    if (!test.length) continue;
    const hist = tested.filter((h) => h.t < from - DAY && h.uevm !== null && h.pred["rüzgâr modeli"] !== null && (h.ptf ?? 1) > 0);
    if (SET === "prob") {
      if (from < Date.UTC(FIRST_TEST.y, FIRST_TEST.m - 1 + 3, 1)) continue; // en az 3 aylık geçmiş
      if(from>=Date.UTC(2026,0,1)) {
        const bandTest=rollingOos.filter(h=>h.t>=from&&h.t<Date.UTC(y,m,1));
        const band=calibratedWindBands(rollingOos.filter((h):h is typeof h & {pred:number;actual:number;ws:number}=>h.t<from&&h.actual!==null&&h.pred!==null&&h.ws!==null),from,bandTest,cap);
        if(band) bandTest.forEach((h,i)=>{if(h.actual===null||band.p10[i]===null||band.p90[i]===null)return;const k=iso(from);const c=rollingCoverage.get(k)??[0,0];if(h.actual>=band.p10[i]!&&h.actual<=band.p90[i]!)c[0]++;c[1]++;rollingCoverage.set(k,c);});
      }
      const qm = fitWindQuantiles(
        hist.filter((h) => h.ws.d2 !== null).map((h) => ({ pred: h.pred["rüzgâr modeli"]!, ws: h.ws.d2!, actual: h.uevm! })),
        cap
      );
      // Model ayrışması bu kümede verilmez (spreadMs boş → özellik 0); ayrışma `--models` verisiyle ayrıca denenebilir
      const toRamp = (hs: Hour[]) => buildRampRows(hs.map((h) => ({ t: h.t, pred: h.pred["rüzgâr modeli"], ws: h.ws.d2, actual: h.uevm })), cap);
      const histRamp = toRamp(hist).filter((r): r is RampRow & { y: 0 | 1 } => r.y !== null);
      const rm = fitRampModel(histRamp);
      const clim = rampClimatology(histRamp);
      for (const r of toRamp(test)) {
        if (!rm || r.y === null) continue;
        ramp.model += (rm.predict(r) - r.y) ** 2;
        ramp.clim += (clim(r.t) - r.y) ** 2;
        ramp.n++;
        ramp.events += r.y;
      }
      for (const h of test) {
        const v = h.pred["rüzgâr modeli"];
        if (!qm || v === null || h.ws.d2 === null) {
          h.pred.P50 = null;
          continue;
        }
        h.pred.P50 = qm.quantile(v, h.ws.d2, 0.5);
        if (h.uevm === null) continue;
        const inside = h.uevm >= qm.quantile(v, h.ws.d2, 0.1) && h.uevm <= qm.quantile(v, h.ws.d2, 0.9) ? 1 : 0;
        cover.inside += inside;
        cover.n++;
        const mk = new Date(h.t).toISOString().slice(0, 7);
        const c = cover.byMonth.get(mk) ?? [0, 0];
        c[0] += inside;
        c[1]++;
        cover.byMonth.set(mk, c);
      }
    }
    if (SET === "curt") {
      // Kısma oranı: gerçekleşen rüzgârla beklenen üretim, etiket gecikmesinden önceki saatler
      const labelCut = from - (LABEL_DELAY_DAYS + 1) * DAY;
      const lh = data.hours.filter((h) => h.t >= Date.UTC(y, m - 13, 1) && h.t < labelCut);
      const loss = detectWindLoss(lh.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, ws: h.realized.ws, dir: h.realized.dir, ptf: h.ptf })), cap);
      const rate = curtailmentRate(lh.map((h) => ({ t: h.t, ptf: h.ptf, uevm: h.uevm, expected: loss.expected.get(h.t) ?? null })), { minExpected: 0.05 * cap });
      notes["kısma oranı × 1000 (ay toplamı)"] = (notes["kısma oranı × 1000 (ay toplamı)"] ?? 0) + Math.round(rate.rate * 1000);
      notes["kısma oranı ay"] = (notes["kısma oranı ay"] ?? 0) + 1;
      for (const h of test) {
        const v = h.pred["rüzgâr modeli"];
        const known = h.ptf !== null && h.ptf <= 1 ? 1 : 0;
        if (v !== null && !zeroP.has(h.t)) notes["sıfır fiyat olasılığı yok (p = 0) saat"] = (notes["sıfır fiyat olasılığı yok (p = 0) saat"] ?? 0) + 1;
        h.pred["+kısıntı"] = v === null ? null : curtailedForecast(v, zeroP.get(h.t) ?? 0, rate.rate);
        h.pred["üst sınır (SIZINTI)"] = v === null ? null : curtailedForecast(v, known, rate.rate);
      }
    }
    if (SET === "corr") {
      const rows = hist
        .filter((h) => h.t >= Date.UTC(y, m - 13, 1))
        .map((h) => {
          const x = corrInput(h);
          return x ? { ...x, actual: h.uevm! } : null;
        })
        .filter((x): x is WindCorrectionInput & { actual: number } => x !== null);
      const fit = from >= CORR_FIRST ? fitWindCorrection(rows, cap) : null;
      if (fit) notes["düzeltme ay"] = (notes["düzeltme ay"] ?? 0) + 1;
      for (const h of test) {
        const x = corrInput(h);
        h.pred["+düzeltme"] = x === null ? null : fit ? fit.apply(x) : x.pred;
      }
    }
    if (SET === "blend") {
      const rows = hist.filter((h) => h.kgupFirst !== null);
      const fit = fitBlendWeight(rows.map((h) => ({ pred: h.pred["rüzgâr modeli"]!, kgup: h.kgupFirst!, actual: h.uevm! })), (w) =>
        evaluateForecasts(rows, { c: (h: Hour) => blendValue(w, h.pred["rüzgâr modeli"]!, h.kgupFirst!) }, market, "RES").c.totalTl
      );
      if (fit && rows.length >= 500) {
        notes["w × 10 (ay toplamı)"] = (notes["w × 10 (ay toplamı)"] ?? 0) + Math.round(fit.w * 10);
        const weights=yearlyWeights.get(y)??[];weights.push(fit.w);yearlyWeights.set(y,weights);
        notes["w ay"] = (notes["w ay"] ?? 0) + 1;
      }
      for (const h of test) {
        const v = h.pred["rüzgâr modeli"];
        h.pred.karışım = v === null || h.kgupFirst === null ? null : fit && rows.length >= 500 ? blendValue(fit.w, v, h.kgupFirst) : h.kgupFirst;
      }
    }
  }
  for(const [year,weights] of yearlyWeights){const xs=blendByYear[year]??[];xs.push({id,w:weights.reduce((a,b)=>a+b,0)/weights.length,months:weights.length});blendByYear[year]=xs;}
  const names = NAMES[SET];
  const cand: Record<string, (h: Hour) => number | null> = Object.fromEntries(names.map((n) => [n, n === "ilk KGÜP" ? (h: Hour) => h.kgupFirst : (h: Hour) => h.pred[n] ?? null]));
  const evalHours = SET === "prob" || SET === "corr" ? tested.filter((h) => h.t >= CORR_FIRST) : tested;
  const all = evaluateForecasts(evalHours, cand, market, "RES");
  results.push({ id, name: p.name, capacityMw: cap, notes, all });
  if (SET === "blend" && notes["w ay"]) blendList.push({ id, name: p.name, w: notes["w × 10 (ay toplamı)"] / 10 / notes["w ay"], months: notes["w ay"] });
  const tl = (n: string) => all[n].totalTl / Math.max(1, all[n].uevmMwh);
  console.log(`${p.name.slice(0, 24).padEnd(24)} TL/MWh: ${names.map((n) => `${n} ${nf(tl(n))}`).join(" · ")}`);
}

const weak = weakForecasters(blendList);
fs.mkdirSync(path.join(process.cwd(), ".cache", "forecast"), { recursive: true });
fs.writeFileSync(
  path.join(process.cwd(), ".cache", "forecast", `wind-candidates-${SET}.json`),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    period: { from: SET === "prob" || SET === "corr" ? iso(CORR_FIRST) : iso(Date.UTC(FIRST_TEST.y, FIRST_TEST.m - 1, 1)), to: endArg },
    set: SET,
    plants: results,
    leaky: LEAKY,
    notLive: NOT_LIVE,
    ...(SET === "prob" ? { coverage: { rolling:Object.fromEntries(rollingCoverage), inside: cover.inside, n: cover.n, months: Object.fromEntries(cover.byMonth) }, ramp } : {}),
    ...(SET === "curt" ? { zeroPriceBrier: zpBrier } : {}),
    ...(SET === "blend" ? { blend: blendList, blendByYear, weak } : {}),
  })
);
const names = NAMES[SET];
const sum = (n: string, f: "totalTl" | "uevmMwh" | "hours") => results.reduce((s, r) => s + r.all[n][f], 0);
console.log(`\nTüm saatler (${results.length} santral, ${sum("ilk KGÜP", "hours")} saat):`);
for (const n of names) {
  const ref = names[0];
  const count = (a: string, b: string) => results.filter((r) => r.all[a].totalTl < r.all[b].totalTl).length;
  const skip = n === ref || LEAKY.includes(n) || NOT_LIVE.includes(n);
  const wins = skip ? "" : `  ${ref} adayından ucuz ${count(n, ref)} / ${results.length}`;
  const vsKgup = n === "ilk KGÜP" || LEAKY.includes(n) ? "" : `  ilk KGÜP'ten ucuz ${count(n, "ilk KGÜP")} / ${results.length}`;
  const tag = LEAKY.includes(n) ? "  [sızıntılı, aday değil]" : NOT_LIVE.includes(n) ? "  [analiz, canlıda yok]" : "";
  console.log(`  ${n.padEnd(22)} ${nf(sum(n, "totalTl") / 1e6, 2)} M TL  (${nf(sum(n, "totalTl") / Math.max(1, sum(n, "uevmMwh")))} TL/MWh)${wins}${vsKgup}${tag}`);
}
if (SET === "prob") {
  console.log(`\nP10–P90 kapsaması (tüm saatler): %${nf((cover.inside / Math.max(1, cover.n)) * 100)} (hedef %80; ${cover.n} saat)`);
  for (const [mk, c] of [...cover.byMonth.entries()].sort()) console.log(`  ${mk}  %${nf((c[0] / Math.max(1, c[1])) * 100)} (${c[1]} saat)`);
  console.log(`Rampa (3 saatte kurulu gücün %30'undan fazla değişim, ${ramp.n} çift, ${ramp.events} rampa): Brier model ${(ramp.model / Math.max(1, ramp.n)).toFixed(4)}, iklim ${(ramp.clim / Math.max(1, ramp.n)).toFixed(4)}`);
}
if (SET === "curt") {
  console.log(`\nSıfır fiyat olasılığı (bütün saatler, ${zpBrier.n}): Brier model ${(zpBrier.model / Math.max(1, zpBrier.n)).toFixed(4)}, iklim ${(zpBrier.clim / Math.max(1, zpBrier.n)).toFixed(4)}`);
  console.log("Not: 'üst sınır (SIZINTI)' PTF'yi bilir; aday değildir, yalnız kazancın tavanı.");
}
if (SET === "blend") {
  console.log(`\nZayıf tahminci santraller (geçmiş aylarda model ağırlığı ≥ 0,5; ${weak.length} / ${blendList.length}):`);
  for (const w of weak) console.log(`  ${w.name.slice(0, 30).padEnd(30)} ortalama w ${nf(w.w, 2)} (${w.months} ay)`);
  console.log("Not: ilk KGÜP canlıda bizde yok; karışım yalnız geçmişe bakan analizdir.");
}

if(SET==="prob") console.log("Kayan kalibrasyon ayrı test ayları:",JSON.stringify(Object.fromEntries(rollingCoverage)));
