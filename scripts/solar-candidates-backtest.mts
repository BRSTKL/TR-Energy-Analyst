/**
 * Güneş motoru aday sürümlerinin geriye dönük testi (Aşama 22): canlı temel (sürüm 3 kalıcılıksız) ile adaylar aynı
 * koşulda. scripts/forecast-backtest.mts ile aynı kurulum: konumlu güneş santralleri, Ocak 2025 – son tam ay, her test
 * ayı önceki 4 ayla eğitilir (walk-forward), hava `d2`, uyduyla kayıp saatler eğitimden ve "kayıp hariç" kümesinden
 * çıkarılır, maliyet dönemin kuralıyla (lib/forecast/production-backtest.ts). Aday kümeleri (`--set`):
 *   - `nwp` (varsayılan, 22.3): aynı sürüm 3 modeli ICON-EU ve GFS'in 2 gün önceki tahminiyle (lib/weather/nwp-models.ts;
 *     scripts/weather-models-sync.mts ile çekilir); üç modelin tahmin ortalaması; girdi ortalaması (üç modelin ışınım,
 *     sıcaklık ve bulut ortalamasıyla tek model); ağırlıklı (santral başına ağırlık: eğitimin ilk 3 ayıyla kurulan modellerin
 *     4. aydaki hatasına göre, üç modelin ortak saatlerinde, ağırlık ∝ 1 / hata²; test ayı görülmez; lib/solar-engine/models/ensemble.ts).
 *     Bir modelin verisi olmayan saat bütün adaylardan düşer.
 *   - `phys` (22.2): fiziksel model ve karma (fizik + ridge).
 *   - `gbm` (22.4): öğrenen düzeltme katmanı (lib/solar-engine/models/correction.ts) temel ve ağırlıklı birleşimin üstünde.
 *     Temel ve birleşim Temmuz 2024'ten her ay önceki 4 ayla kurulur (örneklem dışı tahmin serisi); her test ayının düzeltmesi
 *     o aydan önceki en çok 12 ayın örneklem dışı hatasıyla öğrenilir (sıfır fiyatlı ve uyduyla kayıp saatler hariç; son
 *     günler trainingLossFilter kuralıyla dışarıda).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/solar-candidates-backtest.mts [sonAy=YYYY-AA] [--project] [--set nwp|phys]
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
import { fitCorrection, recentErrorFor } from "@/lib/solar-engine/models/correction";
import { TRAIN_ZERO_PRICE_MAX } from "@/lib/solar-engine/models/production-model";

const endArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? "2026-09";
const onlyProject = process.argv.includes("--project");
const setArg = process.argv[process.argv.indexOf("--set") + 1];
const SET: "nwp" | "phys" | "gbm" = process.argv.includes("--set") && (setArg === "phys" || setArg === "gbm") ? setArg : "nwp";
const [ly, lm] = endArg.split("-").map(Number);
const FIRST = { y: 2025, m: 1 };
const months: Array<{ y: number; m: number }> = [];
for (let y = FIRST.y, m = FIRST.m; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push({ y, m });
const end = Date.UTC(ly, lm, 1);
/** Düzeltme katmanının örneklem dışı tahmin serisinin başı (ek model arşivi 2024-03'ten, 4 ay eğitim) */
const SERIES_FIRST = { y: 2024, m: 7 };
const seriesMonths: Array<{ y: number; m: number }> = [];
for (let y = SERIES_FIRST.y, m = SERIES_FIRST.m; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) seriesMonths.push({ y, m });
const marketRows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(Date.UTC(FIRST.y, FIRST.m - 1, 1)), lt: new Date(end) } } });
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
      : ["temel", "ICON-EU", "GFS", "ortalama", "girdi ort.", "ağırlıklı", "ilk KGÜP"];
const results: Array<{ id: number; name: string; recordedCap: boolean; notes: Record<string, number>; all: Record<string, CandidateResult>; exLoss: Record<string, CandidateResult> }> = [];
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location || info.type !== "GES") continue;
  if (onlyProject && !projectIds.has(id)) continue;
  const data = await loadSolarHours(id, SET === "gbm" ? Date.UTC(SERIES_FIRST.y, SERIES_FIRST.m - 5, 1) : Date.UTC(FIRST.y, FIRST.m - 5, 1), end);
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
  for (const { y, m } of SET === "gbm" ? seriesMonths : months) {
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
  if (SET === "gbm") {
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
    }
    tested.length = 0;
    tested.push(...corrected);
  }
  if (!tested.length) continue;
  const loss = detectLostHours(
    tested.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
    data.site
  );
  const cand: Record<string, (h: Hour) => number | null> = Object.fromEntries(NAMES.map((n) => [n, n === "ilk KGÜP" ? (h: Hour) => h.kgupFirst : (h: Hour) => h.pred[n] ?? null]));
  const all = evaluateForecasts(tested, cand, market, "GES");
  const exLoss = evaluateForecasts(tested, cand, market, "GES", (h) => !loss.lost.has(h.t));
  results.push({ id, name: data.name, recordedCap: recorded.has(id), notes, all, exLoss });
  const tl = (n: string) => exLoss[n].totalTl / Math.max(1, exLoss[n].uevmMwh);
  console.log(`${data.name.slice(0, 24).padEnd(24)} kayıp hariç TL/MWh: ${NAMES.map((n) => `${n} ${nf(tl(n))}`).join(" · ")}`);
}

fs.mkdirSync(path.join(process.cwd(), ".cache", "forecast"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), ".cache", "forecast", `solar-candidates-backtest-${SET}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), period: { from: "2025-01", to: endArg }, set: SET, onlyProject, plants: results }));
const sum = (k: "all" | "exLoss", n: string, f: "totalTl" | "uevmMwh") => results.reduce((s, r) => s + r[k][n][f], 0);
for (const k of ["all", "exLoss"] as const) {
  console.log(`\n${k === "all" ? "Tüm saatler" : "Kayıp saatler hariç"} (${results.length} santral):`);
  for (const n of NAMES) {
    const wins = n === "temel" ? "" : `  temeli yendiği santral ${results.filter((r) => r[k][n].totalTl < r[k].temel.totalTl).length} / ${results.length}`;
    console.log(`  ${n.padEnd(11)} ${nf(sum(k, n, "totalTl") / sum(k, n, "uevmMwh"))} TL/MWh, hata %${nf(results.reduce((s, r) => s + r[k][n].maeMwh * r[k][n].hours, 0) / Math.max(1, results.reduce((s, r) => s + r[k][n].uevmMwh, 0)) * 100)}${wins}`);
  }
}
