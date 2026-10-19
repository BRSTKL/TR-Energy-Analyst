/**
 * Güneş motoru aday sürümlerinin geriye dönük testi (Aşama 22): canlı temel (sürüm 3 kalıcılıksız) ile adaylar aynı
 * koşulda. scripts/forecast-backtest.mts ile aynı kurulum: konumlu güneş santralleri, Ocak 2025 – son tam ay, her test
 * ayı önceki 4 ayla eğitilir (walk-forward), hava `d2`, uyduyla kayıp saatler eğitimden ve "kayıp hariç" kümesinden
 * çıkarılır, maliyet dönemin kuralıyla (lib/forecast/production-backtest.ts). Adaylar: fiziksel model ve karma (fizik + ridge) (22.2).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/solar-candidates-backtest.mts [sonAy=YYYY-AA] [--project]
 * --project: yalnız proje santralleri. Çıktı: .cache/forecast/solar-candidates-backtest.json
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

const endArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? "2026-09";
const onlyProject = process.argv.includes("--project");
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

type Hour = SolarHourV2 & { base: number | null; phys: number | null; hyb: number | null };
const NAMES = ["temel", "fiziksel", "karma", "ilk KGÜP"] as const;
const results: Array<{ id: number; name: string; recordedCap: boolean; mounts: Record<string, number>; all: Record<string, CandidateResult>; exLoss: Record<string, CandidateResult> }> = [];
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location || info.type !== "GES") continue;
  if (onlyProject && !projectIds.has(id)) continue;
  const data = await loadSolarHours(id, Date.UTC(FIRST.y, FIRST.m - 5, 1), end);
  if (!data) continue;
  const tested: Hour[] = [];
  const mounts: Record<string, number> = {};
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const to = Date.UTC(y, m, 1);
    const train = data.hours.filter((h) => h.t >= Date.UTC(y, m - 5, 1) && h.t < from);
    const test = data.hours.filter((h) => h.t >= from && h.t < to);
    let base: ReturnType<typeof fitSolarModelV2>;
    let phys: ReturnType<typeof fitPhysicalModel>;
    let hyb: ReturnType<typeof fitPhysicalModel>;
    try {
      const clean = trainingLossFilter(
        train.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
        data.site,
        from,
        SATELLITE_DELAY_DAYS
      );
      base = fitSolarModelV2(train, data.site, { exclude: clean.exclude, noLag: true });
      phys = fitPhysicalModel(train, data.site, { exclude: clean.exclude, recordedCapacityMw: recorded.get(id) ?? null });
      hyb = fitPhysicalModel(train, data.site, { exclude: clean.exclude, recordedCapacityMw: recorded.get(id) ?? null, hybrid: true });
    } catch {
      continue;
    }
    mounts[phys.mount] = (mounts[phys.mount] ?? 0) + 1;
    for (const h of test) tested.push({ ...h, base: base.predict({ ...h, lag48: null }), phys: phys.predict(h), hyb: hyb.predict(h) });
  }
  if (!tested.length) continue;
  const loss = detectLostHours(
    tested.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
    data.site
  );
  const cand = { temel: (h: Hour) => h.base, fiziksel: (h: Hour) => h.phys, karma: (h: Hour) => h.hyb, "ilk KGÜP": (h: Hour) => h.kgupFirst };
  const all = evaluateForecasts(tested, cand, market, "GES");
  const exLoss = evaluateForecasts(tested, cand, market, "GES", (h) => !loss.lost.has(h.t));
  results.push({ id, name: data.name, recordedCap: recorded.has(id), mounts, all, exLoss });
  const tl = (n: string) => exLoss[n].totalTl / Math.max(1, exLoss[n].uevmMwh);
  console.log(`${data.name.slice(0, 24).padEnd(24)} kayıp hariç TL/MWh: temel ${nf(tl("temel"))} fiziksel ${nf(tl("fiziksel"))} karma ${nf(tl("karma"))} KGÜP ${nf(tl("ilk KGÜP"))} · hata %: ${nf(exLoss.temel.maePct)} / ${nf(exLoss.fiziksel.maePct)} / ${nf(exLoss.karma.maePct)} / ${nf(exLoss["ilk KGÜP"].maePct)}`);
}

fs.mkdirSync(path.join(process.cwd(), ".cache", "forecast"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), ".cache", "forecast", "solar-candidates-backtest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), period: { from: "2025-01", to: endArg }, onlyProject, plants: results }));
const sum = (k: "all" | "exLoss", n: string, f: "totalTl" | "uevmMwh") => results.reduce((s, r) => s + r[k][n][f], 0);
for (const k of ["all", "exLoss"] as const) {
  console.log(`\n${k === "all" ? "Tüm saatler" : "Kayıp saatler hariç"} (${results.length} santral):`);
  for (const n of NAMES) {
    const wins = n === "temel" ? "" : `  temeli yendiği santral ${results.filter((r) => r[k][n].totalTl < r[k].temel.totalTl).length} / ${results.length}`;
    console.log(`  ${n.padEnd(10)} ${nf(sum(k, n, "totalTl") / sum(k, n, "uevmMwh"))} TL/MWh, hata %${nf(results.reduce((s, r) => s + r[k][n].maeMwh * r[k][n].hours, 0) / Math.max(1, results.reduce((s, r) => s + r[k][n].uevmMwh, 0)) * 100)}${wins}`);
  }
}
