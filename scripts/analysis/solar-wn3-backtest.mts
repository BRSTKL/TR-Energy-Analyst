/**
 * Güneş: WeatherNext 3 ışınımıyla aynı canlı model (sürüm 3 kalıcılıksız, lib/solar-engine/models/production-model-v2.ts)
 * ECMWF d2 girdisine karşı (17.11.2026). Proje güneş santralleri (konumlu, lisanslı); her test ayı önceki 4 ayla eğitilir
 * (canlıyla aynı), uyduyla kayıp saatler eğitimden çıkar (lib/forecast/curtailment.ts). Maliyet dönemin kuralıyla
 * (lib/forecast/production-backtest.ts); ana rakip ilk KGÜP. Saatler eşleştirilmiş (adaylardan biri boşsa saat düşer).
 *
 * WN3 girdisi (lib/weather/weathernext-store.ts): üretim saati [t, t+1) için ışınım t+1 damgası (önceki saatin birikimi),
 * bulut ve sıcaklık t damgası; yalnız t'nin kesiminde elde olan çalışmanın damgaları (`wn3UsableFor`). Saçılmış =
 * küresel − doğrudan (WN3'te ayrı değişken yok). Bulut 0–1 → % (Open-Meteo düzeni).
 * DEĞERLENDİRME YALNIZ 01.09.2026 SONRASI: WN3 31.08.2026'da çıktı; öncesi sonradan üretilmiş (eğitim döneminin içinde
 * olabilir), yalnız eğitimde kullanılır. Veri sunucuda (`scripts/weathernext-sync.mts`).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/solar-wn3-backtest.mts [sonAy=2026-10]
 * Çıktı: .cache/forecast/solar-wn3-backtest.json
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { evaluateForecasts, type CandidateResult } from "@/lib/forecast/production-backtest";
import { trainingLossFilter } from "@/lib/forecast/curtailment";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import { decisionCutoff, WEATHER_RUN_RULES } from "@/lib/forecast/info-time";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadSolarHours } from "@/lib/solar-engine/data/production-data";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/solar-engine/models/production-model-v2";
import { nearestCell } from "@/lib/weather/weathernext";
import { wn3Stamps, wn3UsableFor } from "@/lib/weather/weathernext-store";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const endArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? "2026-10";
const [ly, lm] = endArg.split("-").map(Number);
const EVAL_FROM = Date.UTC(2026, 8, 1);
const end = Date.UTC(ly, lm, 1);
const DELAY = WEATHER_RUN_RULES.weathernext3.publishDelayMs;
const months: Array<{ y: number; m: number }> = [];
for (let t = EVAL_FROM; t < end; ) {
  const d = new Date(t);
  months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

const marketRows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(EVAL_FROM), lt: new Date(end) } } });
const market = new Map<number, MarketPriceRecord>(
  marketRows.map((m) => [m.timestamp.getTime(), { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice }])
);
const rows = await prisma.powerPlant.findMany({ where: { projectId: { not: null }, type: "GES", epiasPlantId: { not: null } }, select: { epiasPlantId: true, name: true } });
const ids = [...new Set(rows.filter((r) => !isUnlicensedName(r.name)).map((r) => r.epiasPlantId!))].sort((a, b) => a - b);
await prisma.$disconnect();

const NAMES = ["ECMWF d2", "WN3", "ilk KGÜP"] as const;
type Hour = SolarHourV2 & { pred: Record<string, number | null> };
const results: Array<{ id: number; name: string; all: Record<string, CandidateResult> }> = [];
const nf = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

for (const id of ids) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location) continue;
  const data = await loadSolarHours(id, Date.UTC(2026, 3, 1), end);
  if (!data) continue;
  const c = nearestCell(info.location.latitude, info.location.longitude);
  const wn = await wn3Stamps(c.latitude, c.longitude, Date.UTC(2026, 3, 1), end + HOUR, DELAY, decisionCutoff);
  // Aynı saat WN3 girdisiyle: ışınım t+1, bulut/sıcaklık t; kesimde elde olmayan damga kullanılmaz
  const asWn3 = (h: SolarHourV2): SolarHourV2 | null => {
    const a = wn3UsableFor(wn.get(h.t), h.t, DELAY, decisionCutoff)?.values;
    const b = wn3UsableFor(wn.get(h.t + HOUR), h.t, DELAY, decisionCutoff)?.values;
    if (!a || !b || b.ghi === null || b.direct === null) return null;
    const lag = (k: "ghi" | "direct") => wn3UsableFor(wn.get(h.t - 48 * HOUR + HOUR), h.t, DELAY, decisionCutoff)?.values[k] ?? null;
    const lagG = lag("ghi"), lagD = lag("direct");
    return {
      ...h,
      ghi: b.ghi,
      direct: b.direct,
      diffuse: Math.max(0, b.ghi - b.direct),
      cloud: a.cloud === null ? null : a.cloud * 100,
      temp: a.t2m,
      ghiLag48: lagG,
      directLag48: lagD,
      diffuseLag48: lagG === null || lagD === null ? null : Math.max(0, lagG - lagD),
    };
  };
  const tested: Hour[] = [];
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const to = Date.UTC(y, m, 1);
    const train = data.hours.filter((h) => h.t >= Date.UTC(y, m - 5, 1) && h.t < from);
    const clean = trainingLossFilter(
      train.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
      data.site,
      from,
      SATELLITE_DELAY_DAYS
    );
    const trainWn = train.map(asWn3).filter((h): h is SolarHourV2 => h !== null);
    let base, wn3m;
    try {
      base = fitSolarModelV2(train, data.site, { exclude: clean.exclude, noLag: true });
      wn3m = fitSolarModelV2(trainWn, data.site, { exclude: clean.exclude, noLag: true });
    } catch {
      continue; // eğitim verisi yetersiz (WN3 arşivi eksik ay)
    }
    for (const h of data.hours) {
      if (h.t < from || h.t >= to) continue;
      const w = asWn3(h);
      tested.push({ ...h, pred: { "ECMWF d2": base.predict({ ...h, uevm: null, lag48: null }), WN3: w ? wn3m.predict({ ...w, uevm: null, lag48: null }) : null } });
    }
  }
  if (!tested.length) continue;
  const cand = Object.fromEntries(NAMES.map((n) => [n, n === "ilk KGÜP" ? (h: Hour) => h.kgupFirst : (h: Hour) => h.pred[n] ?? null]));
  const all = evaluateForecasts(tested, cand, market, "GES");
  results.push({ id, name: data.name, all });
  const tl = (n: string) => all[n].totalTl / Math.max(1, all[n].uevmMwh);
  console.log(`${data.name.slice(0, 26).padEnd(26)} TL/MWh: ${NAMES.map((n) => `${n} ${nf(tl(n))}`).join(" · ")}`);
}

const sum = (n: string, f: "totalTl" | "uevmMwh" | "hours" | "maeMwh") => results.reduce((s, r) => s + (f === "maeMwh" ? r.all[n].maeMwh * r.all[n].hours : r.all[n][f]), 0);
console.log(`\n${months.map((x) => `${x.y}-${String(x.m).padStart(2, "0")}`).join(", ")} · ${results.length} santral · ${sum("ilk KGÜP", "hours")} saat (eşleştirilmiş)`);
for (const n of NAMES) {
  const wins = n === "ilk KGÜP" ? "" : `  ilk KGÜP'ten ucuz ${results.filter((r) => r.all[n].totalTl < r.all["ilk KGÜP"].totalTl).length} / ${results.length}`;
  console.log(`  ${n.padEnd(10)} ${nf(sum(n, "totalTl") / Math.max(1, sum(n, "uevmMwh")))} TL/MWh · WAPE %${nf((100 * sum(n, "maeMwh")) / Math.max(1, sum(n, "uevmMwh")))}${wins}`);
}
fs.mkdirSync(path.join(process.cwd(), ".cache", "forecast"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), ".cache", "forecast", "solar-wn3-backtest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), months, plants: results }));
