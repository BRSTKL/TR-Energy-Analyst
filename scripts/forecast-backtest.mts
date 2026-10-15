/**
 * Güneş üretim tahmini geriye dönük testi (PLAN 15.5): konumu ve hava verisi olan santraller, Ocak 2025 – son tam ay.
 * Her test ayı önceki 4 ayla eğitilir (walk-forward; sürüm 1 ve donmuş sürüm 2). Adaylar: sürüm 1, sürüm 2, ilk KGÜP
 * (şirket, ana rakip), D-2 kalıcılık; son KGÜP ayrıca referans (yalnız son planı olan saatler, sürüm 2 ile aynı saatlerde).
 * Maliyet: lib/forecast/production-backtest.ts (dönemin kuralı + KÜPST). Hem "tüm saatler" hem "sıfır fiyat hariç".
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/forecast-backtest.mts [sonAy=2026-08]
 * Çıktı: .cache/forecast/solar-backtest.json (gün bazında maliyetler: 15.6 bootstrap)
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import { fitSolarModel } from "@/lib/forecast/production-model";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/forecast/production-model-v2";
import { evaluateForecasts, type CandidateResult } from "@/lib/forecast/production-backtest";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadSolarHours } from "@/lib/services/production-data";

const [ly, lm] = (process.argv[2] ?? "2026-08").split("-").map(Number);
const FIRST = { y: 2025, m: 1 };
const months: Array<{ y: number; m: number }> = [];
for (let y = FIRST.y, m = FIRST.m; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push({ y, m });
const end = Date.UTC(ly, lm, 1);

const marketRows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(Date.UTC(FIRST.y, FIRST.m - 1, 1)), lt: new Date(end) } } });
const market = new Map<number, MarketPriceRecord>(
  marketRows.map((m) => [
    m.timestamp.getTime(),
    { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice },
  ])
);

type Hour = SolarHourV2 & { v1: number | null; v2: number | null };
const results: Array<{ id: number; name: string; latitude: number; longitude: number; months: number; mounts: Record<string, number>; all: Record<string, CandidateResult>; exZero: Record<string, CandidateResult>; final: Record<string, CandidateResult> }> = [];
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location || info.type !== "GES") continue;
  const data = await loadSolarHours(id, Date.UTC(FIRST.y, FIRST.m - 5, 1), end);
  if (!data) continue;
  const tested: Hour[] = [];
  const mounts: Record<string, number> = {};
  let used = 0;
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const to = Date.UTC(y, m, 1);
    const train = data.hours.filter((h) => h.t >= Date.UTC(y, m - 5, 1) && h.t < from);
    const test = data.hours.filter((h) => h.t >= from && h.t < to);
    let v1: ReturnType<typeof fitSolarModel>;
    let v2: ReturnType<typeof fitSolarModelV2>;
    try {
      v1 = fitSolarModel(train, data.site);
      v2 = fitSolarModelV2(train, data.site);
    } catch {
      continue; // eğitim verisi yetersiz (devreye alma öncesi)
    }
    used++;
    mounts[v2.mount] = (mounts[v2.mount] ?? 0) + 1;
    for (const h of test) tested.push({ ...h, v1: v1.predict(h), v2: v2.predict(h) });
  }
  if (!tested.length) continue;
  const candidates = { "sürüm 1": (h: Hour) => h.v1, "sürüm 2": (h: Hour) => h.v2, "ilk KGÜP": (h: Hour) => h.kgupFirst, "D-2": (h: Hour) => h.lag48 };
  const all = evaluateForecasts(tested, candidates, market, "GES");
  const exZero = evaluateForecasts(tested, candidates, market, "GES", (h) => h.ptf === null || h.ptf > 1);
  const final = evaluateForecasts(tested, { "sürüm 2": (h: Hour) => h.v2, "son KGÜP": (h: Hour) => h.kgupFinal }, market, "GES");
  results.push({ id, name: data.name, latitude: data.site.latitude, longitude: data.site.longitude, months: used, mounts, all, exZero, final });
  const a = all;
  const tl = (n: string) => a[n].totalTl / Math.max(1, a[n].uevmMwh);
  console.log(
    `${data.name.slice(0, 24).padEnd(24)} ${String(used).padStart(2)} ay  hata %: v1 ${nf(a["sürüm 1"].maePct)} v2 ${nf(a["sürüm 2"].maePct)} KGÜP ${nf(a["ilk KGÜP"].maePct)} D-2 ${nf(a["D-2"].maePct)}  ` +
      `maliyet TL/MWh: v1 ${nf(tl("sürüm 1"))} v2 ${nf(tl("sürüm 2"))} KGÜP ${nf(tl("ilk KGÜP"))} D-2 ${nf(tl("D-2"))}  ${a["sürüm 2"].totalTl < a["ilk KGÜP"].totalTl ? "v2 ✓" : ""}`
  );
}

fs.mkdirSync(path.join(process.cwd(), ".cache", "forecast"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), ".cache", "forecast", "solar-backtest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), period: { from: "2025-01", to: `${ly}-${String(lm).padStart(2, "0")}` }, plants: results }));

const sum = (k: "all" | "exZero", n: string, f: "totalTl" | "uevmMwh") => results.reduce((s, r) => s + r[k][n][f], 0);
for (const k of ["all", "exZero"] as const) {
  console.log(`\n${k === "all" ? "Tüm saatler" : "Sıfır fiyat hariç"}: toplam maliyet (TL/MWh) ve ilk KGÜP'ü yenen santral`);
  for (const n of ["sürüm 1", "sürüm 2", "ilk KGÜP", "D-2"]) {
    const wins = n === "ilk KGÜP" ? "" : `  yendiği santral ${results.filter((r) => r[k][n].totalTl < r[k]["ilk KGÜP"].totalTl).length} / ${results.length}`;
    console.log(`  ${n.padEnd(9)} ${nf(sum(k, n, "totalTl") / 1e6, 2)} M TL  (${nf(sum(k, n, "totalTl") / sum(k, n, "uevmMwh"))} TL/MWh)${wins}`);
  }
}
const fin = results.filter((r) => r.final["son KGÜP"].hours > 0);
console.log(
  `\nReferans (son planı olan saatler, ${fin.length} santral): sürüm 2 ${nf(fin.reduce((s, r) => s + r.final["sürüm 2"].totalTl, 0) / 1e6, 2)} M TL, son KGÜP ${nf(fin.reduce((s, r) => s + r.final["son KGÜP"].totalTl, 0) / 1e6, 2)} M TL`
);
await prisma.$disconnect();
