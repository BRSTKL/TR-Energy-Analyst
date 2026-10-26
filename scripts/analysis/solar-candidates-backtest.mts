import {calibratedBands} from "@/lib/solar-engine/models/calibrated-bands";
/**
 * Güneş motoru aday sürümlerinin geriye dönük testi (Aşama 22): canlı temel (sürüm 3 kalıcılıksız) ile adaylar aynı
 * koşulda. scripts/analysis/forecast-backtest.mts ile aynı kurulum: konumlu güneş santralleri, Ocak 2025 – son tam ay, her test
 * ayı önceki 4 ayla eğitilir (walk-forward), hava `d2`, uyduyla kayıp saatler eğitimden ve "kayıp hariç" kümesinden
 * çıkarılır, maliyet dönemin kuralıyla (lib/forecast/production-backtest.ts). Aday kümeleri (`--set`):
 *   - `nwp` (varsayılan, 22.3): aynı sürüm 3 modeli ICON-EU ve GFS'in 2 gün önceki tahminiyle (lib/weather/nwp-models.ts;
 *     scripts/weather-models-sync.mts ile çekilir); üç modelin tahmin ortalaması; girdi ortalaması (üç modelin ışınım,
 *     sıcaklık ve bulut ortalamasıyla tek model); ağırlıklı (santral başına ağırlık: eğitimin ilk 3 ayıyla kurulan modellerin
 *     4. aydaki hatasına göre, üç modelin ortak saatlerinde, ağırlık ∝ 1 / hata²; test ayı görülmez; lib/solar-engine/models/ensemble.ts).
 *     Bir modelin verisi olmayan saat bütün adaylardan düşer.
 *   - `phys` (22.2): fiziksel model ve karma (fizik + ridge).
 *   - `prob` (22.5): `gbm` kümesinin üstüne, ağırlıklı+düzeltme tahmininden P10 / P50 / P90 (lib/solar-engine/models/quantiles.ts:
 *     düzeltilmiş tahminin önceki aylardaki örneklem dışı hatası, en çok 12 ay) ve maliyete göre teklif (geçmiş aylarda en
 *     ucuz çeyreklik, gerçek fiyatlarla). Test Nisan 2025'ten (en az 3 aylık düzeltilmiş geçmiş). Kapsama: [P10, P90] içinde
 *     kalan saat oranı (hedef %80). Kapsama ayrıca (22.5 a2): genişlik çarpanı (`WIDTHS`) Nisan–Aralık 2025'in BÜTÜN
 *     saatleriyle (bütün santraller birlikte) seçilir, 2026'da sınanır (test üzerinde seçim yok); ana sonuç 2026 bütün
 *     saatler. "Kayıp hariç" kapsama İYİMSERDİR: kayıp etiketi gerçekleşen üretimle sonradan konur ve yalnız alt kuyruktaki
 *     ıskaları atar (D-1'de bilinmez); yalnız koşullu doğruluk olarak, etiketiyle verilir. Tavan kırpması kayıtlı kurulu
 *     güçle: bugünkü kayıt geçmişe uygulanır (kaydın kabulü bütün dönemin üretimine bakar), yalnız karşılaştırma.
 *   - `curt` (22.6): `gbm` kümesinin ağırlıklı+düzeltme tahmininden beklenen planlı kısıntı düşülür (lib/forecast/zero-price.ts):
 *     tahmin × (1 − P(PTF ≤ 1) × santralin kısma oranı). Olasılık: her test ayı için önceki 12 ayın gündüz saatleriyle
 *     (06–19) kurulan lojistik model; "+kısıntı" yalnız takvim ve geçmiş fiyatla (bütün santraller için tek model),
 *     "+kısıntı (hava)" ayrıca santralin kendi ağırlıklı tahmininin düzeyiyle (santral başına; kesimden önce bilinir).
 *     Kısma oranı: önceki 12 ayın sıfır fiyatlı saatlerinde uyduyla beklenen üretime göre kayıp (etiket gecikmesinden
 *     önceki saatler). "üst sınır (SIZINTI)" PTF'nin bilindiğini varsayar (aday değil, yalnız kazancın tavanı). Kısıntı
 *     saatleri "kayıp hariç" kümesinden düştüğü için asıl ölçü "Tüm saatler". Olasılık modelinin Brier skoru iklim
 *     rakibiyle (ay × saat payı) karşılaştırılır.
 *   - `abl` (güneş sıradaki işler 4 d, e): `gbm` kümesinin ağırlıklı+düzeltmesi ve aynı düzeltmenin çeşitleri: "son günlerin
 *     hatası" çıkarılmış, "yılın günü" çıkarılmış (kazanç nereden geliyor), GBM tohumu 2 ve 3, 6 aylık eğitim penceresi
 *     (duyarlılık). Ayarlar baştan sabit; sonuç yalnız açıklama içindir, en iyi çeşit seçilip canlıya alınmaz.
 *   - `gbm` (22.4): öğrenen düzeltme katmanı (lib/solar-engine/models/correction.ts) temel ve ağırlıklı birleşimin üstünde.
 *     Temel ve birleşim Temmuz 2024'ten her ay önceki 4 ayla kurulur (örneklem dışı tahmin serisi); her test ayının düzeltmesi
 *     o aydan önceki en çok 12 ayın örneklem dışı hatasıyla öğrenilir (sıfır fiyatlı ve uyduyla kayıp saatler hariç; son
 *     günler trainingLossFilter kuralıyla dışarıda).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/solar-candidates-backtest.mts [sonAy=YYYY-AA] [--project] [--set nwp|phys|gbm|prob|curt]
 * --project: yalnız proje santralleri. Çıktı: .cache/forecast/solar-candidates-backtest-<küme>.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/solar-engine/models/production-model-v2";
import { fitPhysicalModel } from "@/lib/solar-engine/models/physical";
import { evaluateForecasts, type CandidateResult } from "@/lib/forecast/production-backtest";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadSolarHours } from "@/lib/solar-engine/data/production-data";
import { detectLostHours, trainingLossFilter } from "@/lib/forecast/curtailment";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import { isRecordedCapacity } from "@/lib/epias-plant/installed-capacity";
import { NWP_MODELS, type NwpYear } from "@/lib/weather/nwp-models";
import { archiveVariants, ENSEMBLE_SOURCES, fitEnsemble, noLag, type NwpArchive } from "@/lib/solar-engine/models/ensemble";
import { readNwpYear } from "@/lib/weather/weather-store";
import { CORRECTION_GBM, fitCorrection, recentErrorFor, type CorrectionDrop } from "@/lib/solar-engine/models/correction";
import { chooseBidQuantile, chooseWidth, fitResidualQuantiles, WIDTHS } from "@/lib/solar-engine/models/quantiles";
import { TRAIN_ZERO_PRICE_MAX } from "@/lib/solar-engine/models/production-model";
import { brier, buildZeroPriceRows, curtailedForecast, curtailmentRate, fitZeroPrice, zeroPriceClimatology, zeroPricePersistence, type ZeroPriceRow } from "@/lib/forecast/zero-price";

const endArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? "2026-09";
const onlyProject = process.argv.includes("--project");
const setArg = process.argv[process.argv.indexOf("--set") + 1];
const SET: "nwp" | "phys" | "gbm" | "prob" | "curt" | "abl" =
  process.argv.includes("--set") && (setArg === "phys" || setArg === "gbm" || setArg === "prob" || setArg === "curt" || setArg === "abl") ? setArg : "nwp";
const CORR = SET === "gbm" || SET === "prob" || SET === "curt" || SET === "abl";
/** Düzeltme çeşitleri (`abl`): ad → [çıkarılan özellikler, GBM tohumu, pencere ayı] */
const ABLATIONS: Record<string, [CorrectionDrop[], number, number]> = {
  "-son günler": [["recent"], 1, 12],
  "-yılın günü": [["doy"], 1, 12],
  "tohum 2": [[], 2, 12],
  "tohum 3": [[], 3, 12],
  "pencere 6 ay": [[], 1, 6],
};
/** Olasılıksal kümenin ilk test ayı */
const PROB_FIRST = Date.UTC(2025, 3, 1);
/** Genişlik çarpanının sınama dönemi başı: öncesi (Nisan–Aralık 2025) seçim dönemi */
const WIDTH_TEST_FROM = Date.UTC(2026, 0, 1);
type Cov = [number, number];
const covNew = (): Cov[] => WIDTHS.map(() => [0, 0] as Cov);
/** Kapsama sayaçları: dönem (seçim / sınama) × kapsam (tüm / kayıp hariç) × çarpan; ay ay (kayıp hariç, çarpan 1); kayıtlı tavan */
const cov = { sel: { all: covNew(), ex: covNew() }, test: { all: covNew(), ex: covNew() } };
const rollingCoverage = new Map<string,[number,number]>();
const covMonth = new Map<string, Cov>();
const seasonalCov = new Map<string, Cov[]>();
const covRecorded: { raw: Cov; rec: Cov } = { raw: [0, 0], rec: [0, 0] };
const [ly, lm] = endArg.split("-").map(Number);
const FIRST = { y: 2025, m: 1 };
const months: Array<{ y: number; m: number }> = [];
for (let y = FIRST.y, m = FIRST.m; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push({ y, m });
const end = Date.UTC(ly, lm, 1);
/** Düzeltme katmanının örneklem dışı tahmin serisinin başı (ek model arşivi 2024-03'ten, 4 ay eğitim) */
const SERIES_FIRST = { y: 2024, m: 7 };
const seriesMonths: Array<{ y: number; m: number }> = [];
for (let y = SERIES_FIRST.y, m = SERIES_FIRST.m; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) seriesMonths.push({ y, m });
// Kısıntı kümesi: sıfır fiyat modeli ilk test ayından önceki 12 ayla eğitilir
const MARKET_FROM = SET === "curt" ? Date.UTC(FIRST.y - 1, FIRST.m - 1, 1) : Date.UTC(FIRST.y, FIRST.m - 1, 1);
const marketRows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(MARKET_FROM), lt: new Date(end) } } });
const market = new Map<number, MarketPriceRecord>(
  marketRows.map((m) => [m.timestamp.getTime(), { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice }])
);
// Kayıtlı kurulu güç (fiziksel modelin AC tavanı): proje santrallerinde kayıtlı (YEKDEM / EPDK / elle) olanlar
const capRows = await prisma.powerPlant.findMany({ where: { type: "GES", epiasPlantId: { not: null } }, select: { epiasPlantId: true, capacityMw: true, capacitySource: true } });
const recorded = new Map<number, number>();
for (const r of capRows) if (isRecordedCapacity(r.capacitySource)) recorded.set(r.epiasPlantId!, r.capacityMw);
const projectIds = new Set(capRows.map((r) => r.epiasPlantId!));
await prisma.$disconnect();

type Hour = SolarHourV2 & { pred: Record<string, number | null> };
const NAMES =
  SET === "phys"
    ? ["temel", "fiziksel", "karma", "ilk KGÜP"]
    : SET === "gbm"
      ? ["temel", "temel+düzeltme", "ağırlıklı", "ağırlıklı+düzeltme", "ilk KGÜP"]
      : SET === "prob"
        ? ["ağırlıklı+düzeltme", "P50", "maliyet teklifi", "ilk KGÜP"]
      : SET === "curt"
        ? ["ağırlıklı+düzeltme", "+kısıntı", "+kısıntı (hava)", "üst sınır (SIZINTI)", "ilk KGÜP"]
      : SET === "abl"
        ? ["ağırlıklı", "ağırlıklı+düzeltme", ...Object.keys(ABLATIONS), "ilk KGÜP"]
      : ["temel", "ICON-EU", "GFS", "ortalama", "girdi ort.", "ağırlıklı", "ilk KGÜP"];
const results: Array<{ id: number; name: string; recordedCap: boolean; notes: Record<string, number>; all: Record<string, CandidateResult>; exLoss: Record<string, CandidateResult> }> = [];
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

// Kısıntı kümesi (22.6): ay başına ortak sıfır fiyat modeli (takvim + geçmiş fiyat), gündüz saatleri
const ZP_HOURS = (t: number) => {
  const h = new Date(t).getUTCHours();
  return h >= 6 && h <= 19;
};
const ptfMap = new Map<number, number>(marketRows.map((m) => [m.timestamp.getTime(), m.ptf]));
const zeroP = new Map<number, number>();
const zpBrier: Array<{ month: string; rows: number; events: number; model: number; climatology: number; persistence: number }> = [];
/** Sızıntılı başvuru adayları: aday sayılmaz, "yendiği santral" yazılmaz */
const LEAKY = ["üst sınır (SIZINTI)"];
if (SET === "curt") {
  const hoursIn = (a: number, b: number) => Array.from(ptfMap.keys()).filter((t) => t >= a && t < b && ZP_HOURS(t)).sort((x, y) => x - y);
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const to = Date.UTC(y, m, 1);
    const trainRows = buildZeroPriceRows(hoursIn(Date.UTC(y, m - 13, 1), from), ptfMap);
    const zm = fitZeroPrice(trainRows);
    if (!zm) continue;
    const clim = zeroPriceClimatology(trainRows);
    const pers = zeroPricePersistence(trainRows);
    const testRows = buildZeroPriceRows(hoursIn(from, to), ptfMap);
    for (const r of testRows) zeroP.set(r.t, zm.predict(r));
    const lab = testRows.filter((r): r is ZeroPriceRow & { y: 0 | 1 } => r.y !== null);
    zpBrier.push({
      month: `${y}-${String(m).padStart(2, "0")}`,
      rows: lab.length,
      events: lab.filter((r) => r.y === 1).length,
      model: brier(lab.map((r) => ({ p: zm.predict(r), y: r.y }))),
      climatology: brier(lab.map((r) => ({ p: clim(r.t), y: r.y }))),
      persistence: brier(lab.map((r) => ({ p: pers(r), y: r.y }))),
    });
  }
}

for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location || info.type !== "GES") continue;
  if (onlyProject && !projectIds.has(id)) continue;
  const data = await loadSolarHours(id, CORR ? Date.UTC(SERIES_FIRST.y, SERIES_FIRST.m - 5, 1) : Date.UTC(FIRST.y, FIRST.m - 5, 1), end);
  if (!data) continue;
  const tested: Hour[] = [];
  const notes: Record<string, number> = {};
  const nwp: NwpArchive = new Map();
  if (SET !== "phys") {
    for (const m of NWP_MODELS) {
      const ys = new Map<number, NwpYear>();
      for (let y = SERIES_FIRST.y; y <= ly; y++) {
        const d = await readNwpYear(id, m, y);
        if (d) ys.set(y, d);
      }
      nwp.set(m, ys);
    }
    if ([...nwp.values()].some((ys) => !ys.size)) continue;
  }
  for (const { y, m } of CORR ? seriesMonths : months) {
    const from = Date.UTC(y, m - 1, 1);
    const to = Date.UTC(y, m, 1);
    const train = data.hours.filter((h) => h.t >= Date.UTC(y, m - 5, 1) && h.t < from);
    const test = data.hours.filter((h) => h.t >= from && h.t < to);
    let predict: (h: SolarHourV2) => Record<string, number | null>;
    try {
      const clean = trainingLossFilter(
        train.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
        data.site,
        from,
        SATELLITE_DELAY_DAYS
      );
      if (SET === "phys") {
        const base = fitSolarModelV2(train, data.site, { exclude: clean.exclude, noLag: true });
        const phys = fitPhysicalModel(train, data.site, { exclude: clean.exclude, recordedCapacityMw: recorded.get(id) ?? null });
        const hyb = fitPhysicalModel(train, data.site, { exclude: clean.exclude, recordedCapacityMw: recorded.get(id) ?? null, hybrid: true });
        notes[phys.mount] = (notes[phys.mount] ?? 0) + 1;
        predict = (h) => ({ temel: base.predict(noLag(h)), fiziksel: phys.predict(h), karma: hyb.predict(h) });
      } else {
        const ens = fitEnsemble(train, nwp, data.site, clean.exclude, Date.UTC(y, m - 2, 1));
        const top = `ağırlık en büyük: ${ENSEMBLE_SOURCES[ens.weights.indexOf(Math.max(...ens.weights))]}`;
        notes[top] = (notes[top] ?? 0) + 1;
        predict = (h) => {
          const p = ens.predict(archiveVariants(h, nwp));
          return { temel: p.sources[0], "ICON-EU": p.sources[1], GFS: p.sources[2], ortalama: p.mean, "girdi ort.": p.input, ağırlıklı: p.weighted, _cap: ens.trainMaxMwh };
        };
      }
    } catch {
      continue;
    }
    for (const h of test) tested.push({ ...h, pred: predict(h) });
  }
  // Düzeltme öncesi örneklem dışı seri (Temmuz 2024'ten; kısıntı kümesinin geçmişi)
  const series0: Hour[] = [...tested];
  if (CORR) {
    // Düzeltme katmanı: her test ayı için o aydan önceki en çok 12 ayın örneklem dışı hatası
    const series = { temel: new Map<number, { pred: number; actual: number | null }>(), ağırlıklı: new Map<number, { pred: number; actual: number | null }>() };
    for (const h of tested)
      for (const k of ["temel", "ağırlıklı"] as const) {
        const v = h.pred[k];
        if (v !== null && v !== undefined) series[k].set(h.t, { pred: v, actual: h.uevm });
      }
    const ghisOf = (h: SolarHourV2) => archiveVariants(h, nwp).map((v) => v?.ghi ?? null);
    const corrected: Hour[] = [];
    for (const { y, m } of months) {
      const from = Date.UTC(y, m - 1, 1);
      const to = Date.UTC(y, m, 1);
      const test = tested.filter((h) => h.t >= from && h.t < to);
      if (!test.length) continue;
      const hist = tested.filter((h) => h.t >= Date.UTC(y, m - 13, 1) && h.t < from);
      const clean = trainingLossFilter(
        hist.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
        data.site,
        from,
        SATELLITE_DELAY_DAYS
      );
      const cap = test.find((h) => h.pred._cap)?.pred._cap ?? 0;
      const fits = (["temel", "ağırlıklı"] as const).map((k) => {
        const rows = hist
          .filter((h) => h.uevm !== null && h.pred[k] !== null && h.pred[k] !== undefined && !clean.exclude(h) && !(h.ptf !== null && h.ptf <= TRAIN_ZERO_PRICE_MAX))
          .map((h) => ({ h, pred: h.pred[k]!, actual: h.uevm!, ghis: ghisOf(h), recent: recentErrorFor(h.t, series[k], cap) }));
        return fitCorrection(rows, data.site, cap);
      });
      fits.forEach((f, i) => {
        if (f) notes[`düzeltme ay (${["temel", "ağırlıklı"][i]})`] = (notes[`düzeltme ay (${["temel", "ağırlıklı"][i]})`] ?? 0) + 1;
      });
      for (const h of test) {
        const out = (k: "temel" | "ağırlıklı", f: (typeof fits)[number]) => {
          const v = h.pred[k];
          if (v === null || v === undefined) return null;
          return f ? f.apply({ h, pred: v, ghis: ghisOf(h), recent: recentErrorFor(h.t, series[k], cap) }) : v;
        };
        corrected.push({ ...h, pred: { ...h.pred, "temel+düzeltme": out("temel", fits[0]), "ağırlıklı+düzeltme": out("ağırlıklı", fits[1]) } });
      }
      if (SET === "abl") {
        // Çeşitler: aynı ağırlıklı tahmin serisi, aynı süzgeç; yalnız çıkarılan özellik, tohum ya da pencere değişir
        const k = "ağırlıklı" as const;
        const base = hist.filter((h) => h.uevm !== null && h.pred[k] !== null && h.pred[k] !== undefined && !clean.exclude(h) && !(h.ptf !== null && h.ptf <= TRAIN_ZERO_PRICE_MAX));
        const variants = Object.entries(ABLATIONS).map(([name, [drop, seed, windowMonths]]) => {
          const rows = base.filter((h) => h.t >= Date.UTC(y, m - 1 - windowMonths, 1)).map((h) => ({ h, pred: h.pred[k]!, actual: h.uevm!, ghis: ghisOf(h), recent: recentErrorFor(h.t, series[k], cap) }));
          const f = fitCorrection(rows, data.site, cap, { ...CORRECTION_GBM, seed }, drop);
          // Kurulamayan ayda çeşit düzeltilmemiş tahmine düşer: fark çeşidin etkisi sanılmasın diye sayılır
          if (f) notes[`düzeltme ay (${name})`] = (notes[`düzeltme ay (${name})`] ?? 0) + 1;
          return [name, f] as const;
        });
        const start = corrected.length - test.length;
        for (let j = 0; j < test.length; j++) {
          const h = test[j];
          if (corrected[start + j].t !== h.t) throw new Error("Çeşit hizası bozuk");
          const v = h.pred[k];
          const extra: Record<string, number | null> = {};
          for (const [name, f] of variants) extra[name] = v === null || v === undefined ? null : f ? f.apply({ h, pred: v, ghis: ghisOf(h), recent: recentErrorFor(h.t, series[k], cap) }) : v;
          corrected[start + j] = { ...corrected[start + j], pred: { ...corrected[start + j].pred, ...extra } };
        }
      }
    }
    tested.length = 0;
    tested.push(...corrected);
  }
  if (SET === "curt") {
    const K = "ağırlıklı+düzeltme";
    const W = "ağırlıklı";
    const out: Hour[] = [];
    // Santralin kendi ağırlıklı tahmininin düzeyi (kesimden önce bilinir): saat / tavan ve günün toplamı / tavan
    const byT = new Map(series0.map((h) => [h.t, h]));
    const daySum = new Map<number, number>();
    for (const h of series0) {
      const d = Math.floor(h.t / 86_400_000);
      daySum.set(d, (daySum.get(d) ?? 0) + (h.pred[W] ?? 0));
    }
    for (const { y, m } of months) {
      const from = Date.UTC(y, m - 1, 1);
      const test = tested.filter((h) => h.t >= from && h.t < Date.UTC(y, m, 1));
      if (!test.length) continue;
      const cap = test.find((h) => h.pred._cap)?.pred._cap ?? 0;
      const extra = (t: number) => {
        const v = byT.get(t)?.pred[W];
        return v === null || v === undefined || cap <= 0 ? null : [v / cap, (daySum.get(Math.floor(t / 86_400_000)) ?? 0) / (12 * cap)];
      };
      const histT = series0.filter((h) => h.t >= Date.UTC(y, m - 13, 1) && h.t < from && ZP_HOURS(h.t)).map((h) => h.t);
      const plantZm = fitZeroPrice(buildZeroPriceRows(histT, ptfMap, { extra }));
      const plantRows = buildZeroPriceRows(test.filter((h) => ZP_HOURS(h.t)).map((h) => h.t), ptfMap, { extra });
      const plantP = new Map(plantRows.map((r) => [r.t, plantZm ? plantZm.predict(r) : null]));
      // Santral modelinin Brier'i (ortak modelle aynı saatlerde; toplam kare hata × 1000 ve saat)
      if (plantZm)
        for (const r of plantRows) {
          if (r.y === null || !zeroP.has(r.t)) continue;
          notes["brier santral × 1000"] = (notes["brier santral × 1000"] ?? 0) + 1000 * (plantZm.predict(r) - r.y) ** 2;
          notes["brier ortak × 1000"] = (notes["brier ortak × 1000"] ?? 0) + 1000 * (zeroP.get(r.t)! - r.y) ** 2;
          notes["brier saat"] = (notes["brier saat"] ?? 0) + 1;
        }
      // Kısma oranı: etiket (uydu) gecikmesinden önceki geçmiş saatler
      const labelCutoff = from - (SATELLITE_DELAY_DAYS + 1) * 86_400_000;
      const hist = series0.filter((h) => h.t >= Date.UTC(y, m - 13, 1) && h.t < labelCutoff);
      const lossHist = detectLostHours(
        hist.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
        data.site
      );
      const rate = curtailmentRate(hist.map((h) => ({ t: h.t, ptf: h.ptf, uevm: h.uevm, expected: lossHist.expected.get(h.t) ?? null })));
      notes["kısma oranı × 1000 (ay toplamı)"] = (notes["kısma oranı × 1000 (ay toplamı)"] ?? 0) + Math.round(rate.rate * 1000);
      notes["kısma oranı ay"] = (notes["kısma oranı ay"] ?? 0) + 1;
      for (const h of test) {
        const v = h.pred[K];
        if (v === null || v === undefined) {
          out.push({ ...h, pred: { ...h.pred, "+kısıntı": null, "+kısıntı (hava)": null, "üst sınır (SIZINTI)": null } });
          continue;
        }
        const p = zeroP.get(h.t) ?? 0;
        const pp = plantP.get(h.t) ?? p;
        // Üst sınır: fiyat bilinseydi (SIZINTI; yalnız kazancın tavanı)
        const known = h.ptf !== null && h.ptf <= TRAIN_ZERO_PRICE_MAX ? 1 : 0;
        out.push({ ...h, pred: { ...h.pred, "+kısıntı": curtailedForecast(v, p, rate.rate), "+kısıntı (hava)": curtailedForecast(v, pp, rate.rate), "üst sınır (SIZINTI)": curtailedForecast(v, known, rate.rate) } });
      }
    }
    tested.length = 0;
    tested.push(...out);
  }
  /** Olasılıksal küme: saat → bantlar (çarpan sırasıyla) ve kayıtlı tavanla bant */
  const bands = new Map<number, { p10: number[]; p90: number[]; rec: [number, number] | null }>();
  if (SET === "prob") {
    const K = "ağırlıklı+düzeltme";
    const out: Hour[] = [];
    let inBand = 0;
    let bandN = 0;
    for (const { y, m } of months) {
      const from = Date.UTC(y, m - 1, 1);
      if (from < PROB_FIRST) continue;
      const test = tested.filter((h) => h.t >= from && h.t < Date.UTC(y, m, 1));
      if (!test.length) continue;
      const hist = tested.filter((h) => h.t >= Date.UTC(y, m - 13, 1) && h.t < from);
      const clean = trainingLossFilter(
        hist.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
        data.site,
        from,
        SATELLITE_DELAY_DAYS
      );
      const usable = hist.filter((h) => h.uevm !== null && h.pred[K] !== null && h.pred[K] !== undefined && !clean.exclude(h) && !(h.ptf !== null && h.ptf <= TRAIN_ZERO_PRICE_MAX));
      const cap = test.find((h) => h.pred._cap)?.pred._cap ?? 0;
      const recMw = recorded.get(id);
      if(from>=WIDTH_TEST_FROM && recMw) {
        const band=calibratedBands(hist.filter(h=>h.uevm!==null&&h.pred[K]!=null).map(h=>({t:h.t,pred:h.pred[K]!,actual:h.uevm!})),from,test.map(h=>h.pred[K]??null),recMw);
        if(band) test.forEach((h,i)=>{if(h.uevm===null||h.pred[K]==null||h.pred[K]!<=0.01*recMw)return;const c=rollingCoverage.get(`${y}-${String(m).padStart(2,"0")}`)??[0,0];if(h.uevm>=band.p10[i]!&&h.uevm<=band.p90[i]!)c[0]++;c[1]++;rollingCoverage.set(`${y}-${String(m).padStart(2,"0")}`,c);});
      }
      const qm = fitResidualQuantiles(usable.map((h) => ({ pred: h.pred[K]!, actual: h.uevm! })), cap);
      if (!qm) continue;
      const qmRec = recMw ? fitResidualQuantiles(usable.map((h) => ({ pred: h.pred[K]!, actual: h.uevm! })), cap, { ceiling: Math.max(cap, recMw) }) : null;
      // Teklif çeyrekliği: geçmiş saatlerde gerçek fiyatlarla en ucuzu
      const pick = chooseBidQuantile((qq) => evaluateForecasts(usable, { c: (h: Hour) => qm.quantile(h.pred[K]!, qq) }, market, "GES").c.totalTl);
      notes[`teklif çeyrekliği ${pick.q.toFixed(2)}`] = (notes[`teklif çeyrekliği ${pick.q.toFixed(2)}`] ?? 0) + 1;
      for (const h of test) {
        const v = h.pred[K];
        if (v === null || v === undefined) {
          out.push({ ...h, pred: { ...h.pred, P50: null, "maliyet teklifi": null } });
          continue;
        }
        const p10 = qm.quantile(v, 0.1);
        const p90 = qm.quantile(v, 0.9);
        if (v > 0.01 * cap)
          bands.set(h.t, {
            p10: WIDTHS.map((w) => qm.quantile(v, 0.1, w)),
            p90: WIDTHS.map((w) => qm.quantile(v, 0.9, w)),
            rec: qmRec ? [qmRec.quantile(v, 0.1), qmRec.quantile(v, 0.9)] : null,
          });
        if (h.uevm !== null && v > 0.01 * cap) {
          bandN++;
          if (h.uevm >= p10 && h.uevm <= p90) inBand++;
        }
        out.push({ ...h, pred: { ...h.pred, P50: qm.quantile(v, 0.5), "maliyet teklifi": qm.quantile(v, pick.q), P10: p10, P90: p90 } });
      }
    }
    notes["kapsama saat"] = bandN;
    notes["kapsama içinde"] = inBand;
    tested.length = 0;
    tested.push(...out);
  }
  if (!tested.length) continue;
  const loss = detectLostHours(
    tested.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
    data.site
  );
  for (const h of tested) {
    const b = bands.get(h.t);
    if (!b || h.uevm === null) continue;
    const per = h.t < WIDTH_TEST_FROM ? cov.sel : cov.test;
    const exLoss = !loss.lost.has(h.t);
    WIDTHS.forEach((_, i) => {
      const inside = h.uevm! >= b.p10[i] && h.uevm! <= b.p90[i] ? 1 : 0;
      for (const c of exLoss ? [per.all[i], per.ex[i]] : [per.all[i]]) {
        c[0] += inside;
        c[1]++;
      }
    });
    const season = Math.floor(new Date(h.t).getUTCMonth() / 3);
    const sk = `${h.t < WIDTH_TEST_FROM ? "sel" : "test"}:${season}`;
    const sc = seasonalCov.get(sk) ?? covNew();
    WIDTHS.forEach((_, i) => { sc[i][0] += h.uevm! >= b.p10[i] && h.uevm! <= b.p90[i] ? 1 : 0; sc[i][1]++; });
    seasonalCov.set(sk, sc);
    if (!exLoss) continue;
    const mk = new Date(h.t).toISOString().slice(0, 7);
    const mc = covMonth.get(mk) ?? [0, 0];
    mc[0] += h.uevm >= b.p10[0] && h.uevm <= b.p90[0] ? 1 : 0;
    mc[1]++;
    covMonth.set(mk, mc);
    if (b.rec) {
      covRecorded.raw[0] += h.uevm >= b.p10[0] && h.uevm <= b.p90[0] ? 1 : 0;
      covRecorded.raw[1]++;
      covRecorded.rec[0] += h.uevm >= b.rec[0] && h.uevm <= b.rec[1] ? 1 : 0;
      covRecorded.rec[1]++;
    }
  }
  const cand: Record<string, (h: Hour) => number | null> = Object.fromEntries(NAMES.map((n) => [n, n === "ilk KGÜP" ? (h: Hour) => h.kgupFirst : (h: Hour) => h.pred[n] ?? null]));
  const all = evaluateForecasts(tested, cand, market, "GES");
  const exLoss = evaluateForecasts(tested, cand, market, "GES", (h) => !loss.lost.has(h.t));
  results.push({ id, name: data.name, recordedCap: recorded.has(id), notes, all, exLoss });
  const tl = (n: string) => exLoss[n].totalTl / Math.max(1, exLoss[n].uevmMwh);
  console.log(`${data.name.slice(0, 24).padEnd(24)} kayıp hariç TL/MWh: ${NAMES.map((n) => `${n} ${nf(tl(n))}`).join(" · ")}`);
}

fs.mkdirSync(path.join(process.cwd(), ".cache", "forecast"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), ".cache", "forecast", `solar-candidates-backtest-${SET}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), period: { from: SET === "prob" ? "2025-04" : "2025-01", to: endArg }, set: SET, onlyProject, plants: results, ...(SET === "curt" ? { zeroPriceBrier: zpBrier, leaky: LEAKY } : {}), ...(SET === "prob" ? { coverage: { rolling: Object.fromEntries(rollingCoverage), seasonal: Object.fromEntries(seasonalCov), widths: WIDTHS, cov, months: Object.fromEntries(covMonth), recorded: covRecorded } } : {}) }));
const sum = (k: "all" | "exLoss", n: string, f: "totalTl" | "uevmMwh") => results.reduce((s, r) => s + r[k][n][f], 0);
if (SET === "prob") {
  const n = results.reduce((a, r) => a + (r.notes["kapsama saat"] ?? 0), 0);
  const i = results.reduce((a, r) => a + (r.notes["kapsama içinde"] ?? 0), 0);
  console.log(`\nP10–P90 kapsaması (gündüz, bütün saatler): %${nf((i / Math.max(1, n)) * 100)} (hedef %80; ${n} saat)`);
  const pc = (c: Cov) => `%${nf((c[0] / Math.max(1, c[1])) * 100)} (${c[1]} saat)`;
  console.log(`Çarpan 1: bütün saatler seçim ${pc(cov.sel.all[0])}, sınama ${pc(cov.test.all[0])}; kayıp hariç (iyimser) seçim ${pc(cov.sel.ex[0])}, sınama ${pc(cov.test.ex[0])}`);
  console.log("Ay ay (kayıp hariç, iyimser; çarpan 1):");
  for (const [mk, c] of [...covMonth.entries()].sort()) console.log(`  ${mk}  ${pc(c)}`);
  const pick = chooseWidth((w) => cov.sel.all[WIDTHS.indexOf(w)]);
  const wi = WIDTHS.indexOf(pick.width);
  console.log(
    `Genişlik çarpanı (Nisan–Aralık 2025'in bütün saatleriyle seçildi): ${nf(pick.width)} → seçimde %${nf(pick.coverage * 100)}; 2026 sınaması (ANA SONUÇ): bütün saatler ${pc(cov.test.all[wi])}, kayıp hariç (iyimser) ${pc(cov.test.ex[wi])}`
  );
  let seasonalInside = 0, seasonalN = 0;
  console.log("Mevsimsel çarpan (yalnız 2025 bütün saatlerden seçim; 2026 bağımsız sınama):");
  for (let season = 0; season < 4; season++) {
    const selection = seasonalCov.get(`sel:${season}`);
    const test = seasonalCov.get(`test:${season}`);
    if (!selection || !test) { console.log(`  Mevsim ${season + 1}: seçim/sınama verisi yok; kalibre kabul edilmez`); continue; }
    const chosen = chooseWidth(w => selection[WIDTHS.indexOf(w)]);
    const c = test[WIDTHS.indexOf(chosen.width)]; seasonalInside += c[0]; seasonalN += c[1];
    console.log(`  Mevsim ${season + 1}: çarpan ${chosen.width}, sınama ${pc(c)}`);
  }
  console.log(`Mevsimsel ortak kapsam: ${pc([seasonalInside, seasonalN])}; eksik mevsimler bu ölçüye girmez.`);
  const pickEx = chooseWidth((w) => cov.sel.ex[WIDTHS.indexOf(w)]);
  console.log(`  Karşılaştırma: kayıp hariç saatlerle seçilseydi ${nf(pickEx.width)} → 2026 bütün saatler ${pc(cov.test.all[WIDTHS.indexOf(pickEx.width)])}`);
  console.log(`Tavan kırpması (kayıtlı kurulu gücü olan santraller; bugünkü kayıt geçmişe uygulandı; kayıp hariç, iyimser; çarpan 1): eğitim tavanı ${pc(covRecorded.raw)}, kayıtlı güç ${pc(covRecorded.rec)}`);
}
if (SET === "curt") {
  const n = zpBrier.reduce((a, b) => a + b.rows, 0);
  const w = (f: "model" | "climatology" | "persistence") => zpBrier.reduce((a, b) => a + b[f] * b.rows, 0) / Math.max(1, n);
  console.log(`\nSıfır fiyat olasılığı (gündüz 06–19, ${n} saat, ${zpBrier.reduce((a, b) => a + b.events, 0)} sıfır fiyatlı): Brier model ${w("model").toFixed(4)}, iklim ${w("climatology").toFixed(4)}, kalıcılık ${w("persistence").toFixed(4)}`);
  for (const b of zpBrier) console.log(`  ${b.month}  ${String(b.events).padStart(4)} / ${b.rows}  model ${b.model.toFixed(4)}  iklim ${b.climatology.toFixed(4)}  kalıcılık ${b.persistence.toFixed(4)}`);
  const bs = (k: string) => results.reduce((a, r) => a + (r.notes[k] ?? 0), 0);
  console.log(`  Santral modeli (hava düzeyiyle), aynı saatlerde: Brier ${(bs("brier santral × 1000") / 1000 / Math.max(1, bs("brier saat"))).toFixed(4)}, ortak model ${(bs("brier ortak × 1000") / 1000 / Math.max(1, bs("brier saat"))).toFixed(4)} (${bs("brier saat")} santral-saat)`);
  console.log("  Not: 'üst sınır (SIZINTI)' PTF'nin bilindiğini varsayar; aday değildir, yalnız kazancın tavanı. Asıl ölçü 'Tüm saatler'.");
}
for (const k of ["all", "exLoss"] as const) {
  console.log(`\n${k === "all" ? "Tüm saatler" : "Kayıp saatler hariç"} (${results.length} santral):`);
  for (const n of NAMES) {
    // Kıyas: kümenin ilk adayı (temel; prob kümesinde ağırlıklı+düzeltme)
    const ref = NAMES[0];
    const wins = n === ref || LEAKY.includes(n) ? "" : `  ${ref} adayını yendiği santral ${results.filter((r) => r[k][n].totalTl < r[k][ref].totalTl).length} / ${results.length}`;
    console.log(`  ${n.padEnd(11)} ${nf(sum(k, n, "totalTl") / sum(k, n, "uevmMwh"))} TL/MWh, hata %${nf(results.reduce((s, r) => s + r[k][n].maeMwh * r[k][n].hours, 0) / Math.max(1, results.reduce((s, r) => s + r[k][n].uevmMwh, 0)) * 100)}${wins}`);
  }
}

if(SET==="prob") console.log("Kayan kalibrasyon ayrı test ayları:",JSON.stringify(Object.fromEntries(rollingCoverage)));
