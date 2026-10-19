/**
 * Tahmin karnesi (PLAN 21.4; kural lib/solar-engine/learning/scorecard.ts): günlük tahmin kayıtları gerçekleşen üretimle.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/forecast-scorecard.mts [YYYY-MM] [--simulate] [--provisional-only] [--drop YYYY-MM-DD ...]
 *
 * Varsayılan: kaydı olan en son ay, kayıttaki bütün santraller. `--simulate`: kayıt dosyaları yerine geriye dönük
 * tahminle kurulmuş kayıtlar (karne kodunu kayıt birikmeden denemek için; ay başında önceki 4 ayın UEVM'siyle eğitilen
 * sürüm 3 kalıcılıksız, 2 gün önceki ECMWF tahmini: scripts/forecast-backtest.mts ile aynı). Kayıtlar diske yazılmaz,
 * model kimliği "sim-…". Simülasyon iyimserdir (önceki ayın UEVM'si ay başında elde sayılır): yalnız kod denemesi, sayısı
 * dışarıya verilmez. `--provisional-only`: gerçekleşen yalnız GZÜ (UEVM yok sayılır): geçici karnenin kesinden
 * farkını görmek için. `--drop`: o günün kaydı yokmuş gibi (eksik gün listesi denemesi). `--dump <klasör>`: simülasyon
 * kayıtlarını kayıt biçiminde oraya yazar (ekran denemesi; havuzdaki kayıt arşivine konmaz).
 * Çıktı: .cache/forecast/scorecard-<ay>[-sim][-gzu].json
 */

import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { fitSolarModelV2 } from "@/lib/solar-engine/models/production-model-v2";
import { trainingLossFilter } from "@/lib/forecast/curtailment";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import { FORECAST_LOG_SCHEMA, forecastCutoff, type ForecastLog, type ForecastLogPlant } from "@/lib/solar-engine/learning/forecast-log";
import { tlPerMwh, SKY_CLASSES, type ScorePair } from "@/lib/solar-engine/learning/scorecard";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadSolarHours } from "@/lib/solar-engine/data/production-data";
import { listForecastLogs, readForecastLog } from "@/lib/solar-engine/learning/forecast-log-store";
import { scorecard } from "@/lib/solar-engine/learning/scorecard-data";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const args = process.argv.slice(2);
const simulate = args.includes("--simulate");
const provisionalOnly = args.includes("--provisional-only");
const drop = new Set(args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)));
const logged = await listForecastLogs();
const month = args.find((a) => /^\d{4}-\d{2}$/.test(a)) ?? logged[logged.length - 1]?.slice(0, 7);
if (!month) {
  console.error("Kayıt yok; ay verin (ör. 2026-09 --simulate)");
  process.exit(1);
}
const [y, m] = month.split("-").map(Number);
const monthStart = Date.UTC(y, m - 1, 1);
const monthEnd = Date.UTC(y, m, 1);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const yesterday = iso(Date.now() + 3 * HOUR - DAY);
const lastDay = iso(monthEnd - DAY) < yesterday ? iso(monthEnd - DAY) : yesterday;

let logs: ForecastLog[] = [];
let ids: number[];
if (simulate) {
  // Kayıttakiyle aynı küme: proje güneş santralleri (lisanslı, konumlu)
  const rows = await prisma.powerPlant.findMany({ where: { projectId: { not: null }, type: "GES", epiasPlantId: { not: null } }, select: { epiasPlantId: true, name: true } });
  ids = Array.from(new Set(rows.filter((r) => !isUnlicensedName(r.name)).map((r) => r.epiasPlantId!))).sort((a, b) => a - b);
  const perDay = new Map<string, ForecastLogPlant[]>();
  for (const id of ids) {
    const info = await readPoolPlantInfo(id);
    if (!info?.location) continue;
    const data = await loadSolarHours(id, Date.UTC(y, m - 5, 1), monthEnd);
    if (!data) continue;
    const train = data.hours.filter((h) => h.t < monthStart);
    const clean = trainingLossFilter(
      train.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
      data.site,
      monthStart,
      SATELLITE_DELAY_DAYS
    );
    let model;
    try {
      model = fitSolarModelV2(train, data.site, { exclude: clean.exclude, noLag: true });
    } catch {
      continue;
    }
    const byT = new Map(data.hours.filter((h) => h.t >= monthStart).map((h) => [h.t, h]));
    for (let d = monthStart; d < monthEnd; d += DAY) {
      const hours = Array.from({ length: 24 }, (_, i) => {
        const h = byT.get(d + i * HOUR);
        const v = h ? model.predict({ ...h, uevm: null, lag48: null }) : null;
        return v === null ? null : Math.round(v * 1000) / 1000;
      });
      const list = perDay.get(iso(d)) ?? [];
      list.push({ epiasPlantId: id, name: data.name, status: "ok", hours, location: { latitude: info.location.latitude, longitude: info.location.longitude, locationSource: info.location.locationSource } });
      perDay.set(iso(d), list);
    }
  }
  for (const [date, plants] of perDay) {
    const cutoff = new Date(forecastCutoff(date)).toISOString();
    logs.push({ schema: FORECAST_LOG_SCHEMA, tech: "GES", targetDate: date, issuedAt: cutoff, cutoff, onTime: true, model: { id: "sim-solar-v3-nolag", trainingMonths: 4 }, weather: { source: "pool d2", model: "ecmwf_ifs025", runInit: null }, code: null, plants });
  }
} else {
  for (const d of logged.filter((x) => x.startsWith(month))) {
    const l = await readForecastLog(d);
    if (l) logs.push(l);
  }
  ids = Array.from(new Set(logs.flatMap((l) => l.plants.map((p) => p.epiasPlantId)))).sort((a, b) => a - b);
}
logs = logs.filter((l) => !drop.has(l.targetDate));
const dumpAt = args.indexOf("--dump");
if (simulate && dumpAt >= 0 && args[dumpAt + 1]) {
  const dir = path.join(args[dumpAt + 1], month);
  fs.mkdirSync(dir, { recursive: true });
  for (const l of logs) fs.writeFileSync(path.join(dir, `${l.targetDate}.json.gz`), gzipSync(JSON.stringify(l)));
}
const firstDay = simulate ? iso(monthStart) : (logged.find((d) => d.startsWith(month)) ?? iso(monthStart));
const card = await scorecard(ids, firstDay, lastDay, { logs, provisionalOnly });
await prisma.$disconnect();

const nf = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");
const line = (label: string, p: ScorePair) =>
  `  ${label.padEnd(22)} ${String(p.model.hours).padStart(6)} saat  WAPE model %${nf(p.model.maePct)} KGÜP %${nf(p.kgup.maePct)}  TL/MWh model ${nf(tlPerMwh(p.model))} KGÜP ${nf(tlPerMwh(p.kgup))}${p.provisionalHours ? `  (geçici ${p.provisionalHours} saat)` : ""}`;
console.log(`Karne ${card.from} – ${card.to}${simulate ? " (simülasyon)" : ""}${provisionalOnly ? " (yalnız GZÜ)" : ""}: ${card.rows.length} santral-sürüm, geçici saat ${card.provisionalHours}`);
for (const g of card.groups) {
  console.log(`\n${g.modelId} (${g.plants} santral)`);
  console.log(line("tüm saatler", g.all));
  console.log(line("kayıp hariç", g.exLoss));
  for (const c of SKY_CLASSES) if (g.bySky[c].model.hours) console.log(line(`gök ${c}`, g.bySky[c]));
  for (const [c, p] of Object.entries(g.byLocation)) if (p.model.hours) console.log(line(`konum ${c} (${p.plants})`, p));
  const wins = card.rows.filter((r) => r.modelId === g.modelId && r.exLoss.model.totalTl < r.exLoss.kgup.totalTl).length;
  console.log(`  kayıp hariç ilk KGÜP'ü yendiği santral: ${wins} / ${g.plants}`);
}
console.log(`\nSantraller (kayıp hariç; TL/MWh model / KGÜP):`);
for (const r of card.rows) console.log(`  ${r.name.slice(0, 26).padEnd(26)} ${r.location.padEnd(15)} ${r.scoredDays}/${r.days} gün  %${nf(r.exLoss.model.maePct)} / %${nf(r.exLoss.kgup.maePct)}  ${nf(tlPerMwh(r.exLoss.model))} / ${nf(tlPerMwh(r.exLoss.kgup))}`);
if (card.missingDays.length) console.log(`\nEksik kayıt günleri:\n${card.missingDays.map((d) => `  ${d.date} ${d.reason}${d.note ? `: ${d.note}` : ""}`).join("\n")}`);
if (card.plantGaps.length) console.log(`\nSantral boşlukları: ${card.plantGaps.length} (ilk 10)\n${card.plantGaps.slice(0, 10).map((g) => `  ${g.date} ${g.name}: ${g.reason}`).join("\n")}`);
if (card.pendingDays.length) console.log(`\nGerçekleşeni henüz gelmemiş günler: ${card.pendingDays.join(", ")}`);
const out = path.join(process.cwd(), ".cache", "forecast", `scorecard-${month}${simulate ? "-sim" : ""}${provisionalOnly ? "-gzu" : ""}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), simulate, provisionalOnly, ...card }));
console.log(`\n${out}`);
