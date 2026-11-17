/**
 * Güneş: WeatherNext 3 gölge sürümünün günlük ek kaydı (registry.ts `SOLAR_WN3_MODEL`; 18.11.2026).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/solar-wn3-shadow.mts [--write] [--date YYYY-MM-DD]
 *
 * Hedef gün (varsayılan yarın, Türkiye) için proje güneş santrallerinin (ana kayıtla aynı küme: lisanslı, konumlu) WN3
 * girdili tahmini; `--write` ile ek kayıt olarak bir kez yazılır (learning/forecast-log-store.ts `writeForecastAddendum`),
 * yalnız kesimden (D-1 12:30 TR) önce. WN3 verisi önce `scripts/weathernext-sync.mts` ile çekilmiş olmalı. Santrallerin
 * %80'inden azı hazırsa ve kesime 30 dakikadan çok varsa yazmaz (sonraki çalışma dener); son denemede eldekiyle yazar.
 * Sunucuda `tr-energy-wn3-shadow` zamanlayıcısı (11:20 ve 12:05 TR).
 */
import { execSync } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { FORECAST_LOG_SCHEMA, forecastCutoff, nextTargetDate, targetDayWall } from "@/lib/solar-engine/learning/forecast-log";
import { readForecastAddenda, readForecastLog, writeForecastAddendum } from "@/lib/solar-engine/learning/forecast-log-store";
import { forecastSolarPlantWn3 } from "@/lib/solar-engine/forecast";
import { SOLAR_WN3_MODEL } from "@/lib/solar-engine/registry";

const args = process.argv.slice(2);
const write = args.includes("--write");
const now = Date.now();
const target = args.includes("--date") ? args[args.indexOf("--date") + 1] : nextTargetDate(now);
const cutoff = forecastCutoff(target);
const stamp = () => new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });

try {
  if (write && now >= cutoff) {
    console.log(`${stamp()} ${target}: kesim geçti; yazılmadı`);
    process.exit(0);
  }
  if ((await readForecastAddenda(target, "solar")).some((a) => a.shadow.modelId === SOLAR_WN3_MODEL)) {
    console.log(`${stamp()} ${target}: WN3 ek kaydı zaten var; dokunulmadı`);
    process.exit(0);
  }
  // Santral kümesi: ana kayıt varsa onunki, yoksa ana akışla aynı sorgu (pipeline.ts)
  const main = await readForecastLog(target, "solar");
  let ids: number[];
  if (main) ids = main.plants.map((p) => p.epiasPlantId);
  else {
    const rows = await prisma.powerPlant.findMany({ where: { projectId: { not: null }, type: "GES", epiasPlantId: { not: null } }, select: { epiasPlantId: true, name: true } });
    ids = [...new Set(rows.filter((r) => !isUnlicensedName(r.name)).map((r) => r.epiasPlantId!))].sort((a, b) => a - b);
  }
  const from = targetDayWall(target);
  const plants: Array<{ epiasPlantId: number; status: "ok" | "no-data" | "error"; message?: string; hours?: Array<number | null>; train?: { from: string; to: string; hours: number; mount: string; maxMwh: number }; weatherFetchedAt?: string }> = [];
  const runs = new Set<string>();
  for (const id of ids) {
    const r = await forecastSolarPlantWn3(id, from, 24, { now, fresh: true });
    if (r.runInit) runs.add(r.runInit);
    plants.push({ epiasPlantId: id, status: r.status, ...(r.message ? { message: r.message } : {}), ...(r.hours ? { hours: r.hours } : {}), ...(r.train ? { train: r.train } : {}), ...(r.weatherFetchedAt ? { weatherFetchedAt: r.weatherFetchedAt } : {}) });
  }
  const ok = plants.filter((p) => p.status === "ok").length;
  const total = plants.reduce((s, p) => s + (p.hours ?? []).reduce((a, v) => a + (v ?? 0), 0), 0);
  console.log(`${stamp()} ${target}: WN3 ${ok}/${plants.length} santral, toplam ${total.toFixed(1)} MWh; çalışma ${[...runs].join(", ") || "yok"}`);
  if (!write) process.exit(0);
  const lastTry = Date.now() > cutoff - 30 * 60_000;
  if (ok < 0.8 * plants.length && !lastTry) {
    console.log(`${stamp()} ${target}: hazır santral az (${ok}/${plants.length}); sonraki çalışma deneyecek`);
    process.exit(0);
  }
  if (!ok) {
    console.log(`${stamp()} ${target}: hiçbir santral hazır değil; yazılmadı`);
    process.exit(0);
  }
  let code: string | null = null;
  try {
    code = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    /* git yok */
  }
  const issued = Date.now();
  const wrote = await writeForecastAddendum(
    {
      schema: FORECAST_LOG_SCHEMA,
      tech: "GES",
      targetDate: target,
      issuedAt: new Date(issued).toISOString(),
      cutoff: new Date(cutoff).toISOString(),
      onTime: issued < cutoff,
      weather: { source: "WeatherNext 3 (BigQuery, 0,1°, ensemble ortalaması)", runInit: runs.size === 1 ? [...runs][0] : runs.size ? [...runs].sort().join(",") : null },
      code,
      shadow: { modelId: SOLAR_WN3_MODEL, plants },
    },
    "solar"
  );
  console.log(`${stamp()} ${target}: ${wrote ? "yazıldı" : "zaten vardı"}`);
} finally {
  await prisma.$disconnect();
}
