/**
 * Güneş: eğitim süresi sınaması (18.11.2026). Canlı model (sürüm 3 kalıcılıksız, lib/solar-engine/models/production-model-v2.ts)
 * yalnız eğitim süresi değiştirilerek: canlıdaki 4 ay, 8 ay ve 12 ay. Proje güneş santralleri (konumlu, lisanslı); her test ayı
 * için eğitim test ayının başından bir gün öncesine kadar (ayın son gününün üretimi ertesi gün öğlen elde: canlıyla ve
 * solar-wn3-backtest.mts ile aynı), uyduyla kayıp saatler eğitimden çıkar (lib/forecast/curtailment.ts). Eğitim süresine
 * santralin verisi yetmiyorsa elde olanla eğitilir (12 ay seçeneği ilk aylarda 8 aya eşit olabilir; `realMonths` bunu sayar).
 * Maliyet dönemin kuralıyla (lib/forecast/production-backtest.ts); bütün adaylar aynı saatlerde (adaylardan biri boşsa saat
 * düşer). Mevsim kırılımı: kış (Ara–Şub), bahar (Mar–May), yaz (Haz–Ağu), güz (Eyl–Kas).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/solar-train-window-backtest.mts [ilkAy=2025-10] [sonAy=2026-09]
 * Çıktı: .cache/forecast/solar-train-window-backtest.json (uygulama okumaz)
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { evaluateForecasts, type CandidateResult } from "@/lib/forecast/production-backtest";
import { trainingLossFilter } from "@/lib/forecast/curtailment";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadSolarHours } from "@/lib/solar-engine/data/production-data";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/solar-engine/models/production-model-v2";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const monthArgs = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
const [fy, fm] = (monthArgs[0] ?? "2025-10").split("-").map(Number);
const [ly, lm] = (monthArgs[1] ?? "2026-09").split("-").map(Number);
const WINDOWS = [4, 8, 12] as const;
const NAMES = [...WINDOWS.map((w) => `${w} ay`), "ilk KGÜP"];
const months: Array<{ y: number; m: number }> = [];
for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push({ y, m });
const start = Date.UTC(fy, fm - 1, 1);
const end = Date.UTC(ly, lm, 1);
const SEASON = (m: number) => (m === 12 || m <= 2 ? "kış" : m <= 5 ? "bahar" : m <= 8 ? "yaz" : "güz");

const marketRows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(start), lt: new Date(end) } } });
const market = new Map<number, MarketPriceRecord>(
  marketRows.map((m) => [m.timestamp.getTime(), { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice }])
);
const rows = await prisma.powerPlant.findMany({ where: { projectId: { not: null }, type: "GES", epiasPlantId: { not: null } }, select: { epiasPlantId: true, name: true } });
const ids = [...new Set(rows.filter((r) => !isUnlicensedName(r.name)).map((r) => r.epiasPlantId!))].sort((a, b) => a - b);
await prisma.$disconnect();

type Hour = SolarHourV2 & { pred: Record<string, number | null> };
const nf = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const plants: Array<{ id: number; name: string; realMonths: Record<string, number[]>; all: Record<string, CandidateResult>; bySeason: Record<string, Record<string, CandidateResult>> }> = [];

for (const id of ids) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location) continue;
  const data = await loadSolarHours(id, Date.UTC(fy, fm - 1 - 13, 1), end);
  if (!data) {
    console.log(`  #${id}: güneş verisi yok (konum ya da hava arşivi)`);
    continue;
  }
  const firstData = data.hours.find((h) => h.uevm !== null)?.t ?? Infinity;
  const tested: Hour[] = [];
  const realMonths: Record<string, number[]> = {};
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const to = Date.UTC(y, m, 1);
    const fits: Record<string, ReturnType<typeof fitSolarModelV2>> = {};
    try {
      for (const w of WINDOWS) {
        const trainFrom = Date.UTC(y, m - 1 - w, 1);
        const train = data.hours.filter((h) => h.t >= trainFrom && h.t < from - DAY);
        const clean = trainingLossFilter(
          train.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
          data.site,
          from,
          SATELLITE_DELAY_DAYS
        );
        fits[`${w} ay`] = fitSolarModelV2(train, data.site, { exclude: clean.exclude, noLag: true });
        (realMonths[`${w} ay`] ??= []).push(Math.round(((from - DAY - Math.max(trainFrom, firstData)) / (30.44 * DAY)) * 10) / 10);
      }
    } catch (e) {
      if ((e as Error).name === "LeakageError") throw e;
      continue; // eğitim verisi yetersiz (devreye alma öncesi)
    }
    for (const h of data.hours) {
      if (h.t < from || h.t >= to) continue;
      const x = { ...h, uevm: null, lag48: null };
      tested.push({ ...h, pred: Object.fromEntries(WINDOWS.map((w) => [`${w} ay`, fits[`${w} ay`].predict(x)])) });
    }
  }
  if (!tested.length) continue;
  const cand = Object.fromEntries(NAMES.map((n) => [n, n === "ilk KGÜP" ? (h: Hour) => h.kgupFirst : (h: Hour) => h.pred[n] ?? null]));
  const all = evaluateForecasts(tested, cand, market, "GES");
  const bySeason: Record<string, Record<string, CandidateResult>> = {};
  for (const s of ["kış", "bahar", "yaz", "güz"]) {
    const part = tested.filter((h) => SEASON(new Date(h.t + 3 * HOUR).getUTCMonth() + 1) === s);
    if (part.length) bySeason[s] = evaluateForecasts(part, cand, market, "GES");
  }
  plants.push({ id, name: data.name, realMonths, all, bySeason });
  const tl = (n: string) => all[n].totalTl / Math.max(1, all[n].uevmMwh);
  console.log(`${data.name.slice(0, 26).padEnd(26)} TL/MWh: ${NAMES.map((n) => `${n} ${nf(tl(n))}`).join(" · ")}`);
}

const total = (pick: (p: (typeof plants)[number]) => Record<string, CandidateResult> | undefined, n: string) => {
  let tl = 0, mwh = 0, mae = 0, hours = 0;
  for (const p of plants) {
    const r = pick(p)?.[n];
    if (!r) continue;
    tl += r.totalTl;
    mwh += r.uevmMwh;
    mae += r.maeMwh * r.hours;
    hours += r.hours;
  }
  return { tlPerMwh: tl / Math.max(1, mwh), wape: (100 * mae) / Math.max(1, mwh), hours };
};
const label = `${fy}-${String(fm).padStart(2, "0")} – ${ly}-${String(lm).padStart(2, "0")}`;
console.log(`\n${label} · ${plants.length} santral · ${total((p) => p.all, "ilk KGÜP").hours} saat (eşleştirilmiş)`);
const summary: Record<string, Record<string, { tlPerMwh: number; wape: number; wins4?: number }>> = {};
for (const [key, pick] of [["tümü", (p: (typeof plants)[number]) => p.all], ...["kış", "bahar", "yaz", "güz"].map((s) => [s, (p: (typeof plants)[number]) => p.bySeason[s]] as const)] as const) {
  summary[key] = {};
  const line = NAMES.map((n) => {
    const t = total(pick, n);
    const wins4 = n === "4 ay" || n === "ilk KGÜP" ? undefined : plants.filter((p) => pick(p)?.[n] && pick(p)![n].totalTl < pick(p)!["4 ay"].totalTl).length;
    summary[key][n] = { tlPerMwh: t.tlPerMwh, wape: t.wape, ...(wins4 !== undefined ? { wins4 } : {}) };
    return `${n} ${nf(t.tlPerMwh)} (WAPE %${nf(t.wape)}${wins4 !== undefined ? `, 4 aydan ucuz ${wins4}/${plants.length}` : ""})`;
  });
  console.log(`  ${key.padEnd(6)} ${line.join(" · ")}`);
}
const avgReal = (w: string) => {
  const v = plants.flatMap((p) => p.realMonths[w] ?? []);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};
console.log(`  Ortalama gerçek eğitim süresi (ay): ${WINDOWS.map((w) => `${w} ay → ${nf(avgReal(`${w} ay`))}`).join(" · ")}`);
fs.mkdirSync(path.join(process.cwd(), ".cache", "forecast"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), ".cache", "forecast", "solar-train-window-backtest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), period: label, summary, plants }));
