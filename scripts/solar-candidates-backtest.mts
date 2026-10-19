/**
 * Güneş motoru aday sürümlerinin geriye dönük testi (Aşama 22): canlı temel (sürüm 3 kalıcılıksız) ile adaylar aynı
 * koşulda. scripts/forecast-backtest.mts ile aynı kurulum: konumlu güneş santralleri, Ocak 2025 – son tam ay, her test
 * ayı önceki 4 ayla eğitilir (walk-forward), hava `d2`, uyduyla kayıp saatler eğitimden ve "kayıp hariç" kümesinden
 * çıkarılır, maliyet dönemin kuralıyla (lib/forecast/production-backtest.ts). Aday kümeleri (`--set`):
 *   - `nwp` (varsayılan, 22.3): aynı sürüm 3 modeli ICON-EU ve GFS'in 2 gün önceki tahminiyle (lib/weather/nwp-models.ts;
 *     scripts/weather-models-sync.mts ile çekilir); üç modelin tahmin ortalaması; girdi ortalaması (üç modelin ışınım,
 *     sıcaklık ve bulut ortalamasıyla tek model); ağırlıklı (santral başına ağırlık: eğitimin ilk 3 ayıyla kurulan modellerin
 *     4. aydaki hatasına göre, ağırlık ∝ 1 / hata²; test ayı görülmez). Bir modelin verisi olmayan saat bütün adaylardan düşer.
 *   - `phys` (22.2): fiziksel model ve karma (fizik + ridge).
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
import { NWP_MODELS, nwpAt, type NwpModel, type NwpYear } from "@/lib/weather/nwp-models";
import { readNwpYear } from "@/lib/weather/weather-store";

const endArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? "2026-09";
const onlyProject = process.argv.includes("--project");
const setArg = process.argv[process.argv.indexOf("--set") + 1];
const SET: "nwp" | "phys" = process.argv.includes("--set") && setArg === "phys" ? "phys" : "nwp";
const [ly, lm] = endArg.split("-").map(Number);
const FIRST = { y: 2025, m: 1 };
const months: Array<{ y: number; m: number }> = [];
for (let y = FIRST.y, m = FIRST.m; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push({ y, m });
const end = Date.UTC(ly, lm, 1);
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
const NAMES = SET === "phys" ? ["temel", "fiziksel", "karma", "ilk KGÜP"] : ["temel", "ICON-EU", "GFS", "ortalama", "girdi ort.", "ağırlıklı", "ilk KGÜP"];
type Model = { predict: (h: SolarHourV2) => number | null };
const v3 = (train: SolarHourV2[], site: Parameters<typeof fitSolarModelV2>[1], exclude: (h: SolarHourV2) => boolean): Model => fitSolarModelV2(train, site, { exclude, noLag: true });
const noLag = (h: SolarHourV2): SolarHourV2 => ({ ...h, lag48: null, ghiLag48: null, directLag48: null, diffuseLag48: null });
/** Saatin hava girdilerini bir ek modelinkiyle değiştirir (bilgi anı aynı: d2); verisi yoksa null */
function withNwp(h: SolarHourV2, docs: Map<number, NwpYear>): SolarHourV2 | null {
  const doc = docs.get(new Date(h.t).getUTCFullYear());
  if (!doc) return null;
  const v = { ghi: nwpAt(doc, "ghi", h.t), direct: nwpAt(doc, "direct", h.t), diffuse: nwpAt(doc, "diffuse", h.t), temp: nwpAt(doc, "temp", h.t), cloud: nwpAt(doc, "cloud", h.t) };
  if (Object.values(v).some((x) => x === null)) return null;
  return { ...noLag(h), ...v };
}
/** Üç modelin girdi ortalaması */
function meanInput(hs: Array<SolarHourV2 | null>): SolarHourV2 | null {
  if (hs.some((h) => h === null || h.ghi === null || h.direct === null || h.diffuse === null || h.temp === null || h.cloud === null)) return null;
  const avg = (k: "ghi" | "direct" | "diffuse" | "temp" | "cloud") => hs.reduce((s, h) => s + h![k]!, 0) / hs.length;
  return { ...hs[0]!, ghi: avg("ghi"), direct: avg("direct"), diffuse: avg("diffuse"), temp: avg("temp"), cloud: avg("cloud") };
}
const results: Array<{ id: number; name: string; recordedCap: boolean; notes: Record<string, number>; all: Record<string, CandidateResult>; exLoss: Record<string, CandidateResult> }> = [];
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location || info.type !== "GES") continue;
  if (onlyProject && !projectIds.has(id)) continue;
  const data = await loadSolarHours(id, Date.UTC(FIRST.y, FIRST.m - 5, 1), end);
  if (!data) continue;
  const tested: Hour[] = [];
  const notes: Record<string, number> = {};
  const nwp = new Map<NwpModel, Map<number, NwpYear>>();
  if (SET === "nwp") {
    for (const m of NWP_MODELS) {
      const ys = new Map<number, NwpYear>();
      for (let y = FIRST.y - 1; y <= ly; y++) {
        const d = await readNwpYear(id, m, y);
        if (d) ys.set(y, d);
      }
      nwp.set(m, ys);
    }
    if ([...nwp.values()].some((ys) => !ys.size)) continue;
  }
  // Saat başına üç hava sürümü: [ECMWF, ICON-EU, GFS]
  const variants = (h: SolarHourV2): Array<SolarHourV2 | null> => [noLag(h), ...NWP_MODELS.map((m) => withNwp(h, nwp.get(m)!))];
  for (const { y, m } of months) {
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
      const base = v3(train, data.site, clean.exclude);
      if (SET === "phys") {
        const phys = fitPhysicalModel(train, data.site, { exclude: clean.exclude, recordedCapacityMw: recorded.get(id) ?? null });
        const hyb = fitPhysicalModel(train, data.site, { exclude: clean.exclude, recordedCapacityMw: recorded.get(id) ?? null, hybrid: true });
        notes[phys.mount] = (notes[phys.mount] ?? 0) + 1;
        predict = (h) => ({ temel: base.predict(noLag(h)), fiziksel: phys.predict(h), karma: hyb.predict(h) });
      } else {
        // Her ek model için aynı eğitim saatleri, o modelin havasıyla (verisi olmayan saat eğitime girmez)
        const trainOf = (k: number) => train.map((h) => variants(h)[k]).filter((h): h is SolarHourV2 => h !== null);
        const models = [base, ...NWP_MODELS.map((_, j) => v3(trainOf(j + 1), data.site, clean.exclude))];
        const meanTrain = train.map((h) => meanInput(variants(h))).filter((h): h is SolarHourV2 => h !== null);
        const meanModel = v3(meanTrain, data.site, clean.exclude);
        // Ağırlık: ilk 3 ayla kurulan modellerin 4. aydaki (eğitimin son ayı) hatası; test ayı görülmez
        const valFrom = Date.UTC(y, m - 2, 1);
        const errs = [0, 1, 2].map((k) => {
          const rows = trainOf(k);
          const inner = v3(rows.filter((h) => h.t < valFrom), data.site, clean.exclude);
          const val = rows.filter((h) => h.t >= valFrom && h.uevm !== null && !clean.exclude(h));
          const e = val.reduce((s, h) => s + Math.abs((inner.predict(h) ?? 0) - h.uevm!), 0) / Math.max(1, val.length);
          return Math.max(e, 1e-6);
        });
        const w = errs.map((e) => 1 / (e * e));
        const ws = w.reduce((a, b) => a + b, 0);
        // En büyük ağırlığı alan model (ECMWF / ICON-EU / GFS), ay sayısı
        const top = `ağırlık en büyük: ${["ECMWF", "ICON-EU", "GFS"][w.indexOf(Math.max(...w))]}`;
        notes[top] = (notes[top] ?? 0) + 1;
        predict = (h) => {
          const vs = variants(h);
          const ps = vs.map((v, k) => (v ? models[k].predict(v) : null));
          const ok = ps.every((p) => p !== null);
          const mi = meanInput(vs);
          return {
            temel: ps[0],
            "ICON-EU": ps[1],
            GFS: ps[2],
            ortalama: ok ? ps.reduce((s, p) => s! + p!, 0)! / ps.length : null,
            "girdi ort.": mi ? meanModel.predict(mi) : null,
            ağırlıklı: ok ? ps.reduce((s, p, k) => s! + (p! * w[k]) / ws, 0) : null,
          };
        };
      }
    } catch {
      continue;
    }
    for (const h of test) tested.push({ ...h, pred: predict(h) });
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
