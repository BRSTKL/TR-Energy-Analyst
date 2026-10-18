/**
 * Günlük güneş tahmin kaydı (PLAN 21.1; kural lib/forecast/forecast-log.ts): proje güneş santralleri (lisanslı, konumu
 * havuzda) için D günü saatlik tahmini, GÖP kesiminden (D-1 12:30) önce bir kez yazar. Kayıt varsa dokunmaz.
 * Model ve eğitim Üretim tahmini sayfasıyla aynı (lib/services/live-forecast.ts `forecastSolarPlant`); hava tahmini
 * önbelleğe bakılmadan o an çekilir. Hedef: yarın (Türkiye saati); yarının kesimi geçtiyse yazılmaz (öbür gün eski hava
 * çalışmasıyla kilitlenmesin; sızıntı denetimi 18.10.2026). Bugün ya da geçmiş gün hiçbir zaman yazılmaz: eğitim çalışma
 * anına göre seçildiği için hedef günden sonraki üretimi görürdü, canlı hava yanıtında da geçmiş saat yoktur.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/solar-forecast-daily.mts [YYYY-MM-DD] [--late]
 *
 * `--late`: kesimi geçmiş yarın için yine de yaz (`onTime: false`, karne saymaz). Kesimden önce başlayıp sonra biten
 * çalışma da `onTime: false` yazar (`issuedAt` bütün tahminlerden sonra alınır).
 * Önce (her adımdan önce kesime 15 dakikadan çok kalmışsa) eğitim verisi tazelenir: EPİAŞ gerçek zamanlı üretimi (scripts/realtime-sync.mts;
 * VPN kapalıysa atlanır), hava tahmini arşivi ve uydu ışınımı (Open-Meteo); her adım en çok 6 dakika, hatası kaydı durdurmaz.
 * Zamanlama: scripts/launchd/ (Mac saatiyle 08:30 ve 10:00). Kesime WAIT_MARGIN'dan çok varken şu durumlarda yazmadan
 * çıkar (sonraki çalışma yazar): günün 00Z ECMWF çalışması henüz yayımlanmamış (ya da bilinmiyor), bir santralin hava
 * isteği düşmüş. Kesime daha az kaldıysa elde olanla yazar. Kayıt varsa ikinci çalışma bir şey yapmaz.
 */

import { execSync, spawnSync } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { forecastSolarPlant } from "@/lib/services/live-forecast";
import { readForecastLog, writeForecastLog, forecastLogPath } from "@/lib/services/forecast-log";
import { FORECAST_LOG_SCHEMA, SOLAR_MODEL_ID, forecastCutoff, isOnTime, nextTargetDate, targetDayWall, type ForecastLog, type ForecastLogPlant } from "@/lib/forecast/forecast-log";
import { WEATHER_MODEL } from "@/lib/weather/weather-codec";

const arg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const late = process.argv.includes("--late");
const started = Date.now();
const tomorrow = nextTargetDate(started);
const target = arg ?? tomorrow;
const stamp = () => new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
// Yazın son çalışma (10:00 CEST = 08:00 UTC) kesime 1,5 saat, kışın ilk çalışma (08:30 CET) 2 saat kala: ilki yazar, ikincisi bekler
const WAIT_MARGIN_MS = 105 * 60_000;
const canWait = () => forecastCutoff(target) - Date.now() > WAIT_MARGIN_MS;

if (target < tomorrow) {
  console.error(`${stamp()} ${target}: bugün ya da geçmiş gün yazılmaz (eğitim sonraki üretimi görür, canlı havada geçmiş saat yok)`);
  process.exit(1);
}

if (await readForecastLog(target)) {
  console.log(`${stamp()} ${target}: kayıt zaten var, dokunulmadı (${forecastLogPath(target)})`);
  process.exit(0);
}
if (!isOnTime(started, target) && !late) {
  console.error(`${stamp()} ${target}: GÖP kesimi (${new Date(forecastCutoff(target)).toISOString()}) geçti; yazılmadı (geç kayıt için --late)`);
  process.exit(1);
}

// Proje güneş santralleri: lisanslı, konumu havuzda (lisanssız toplamlar tek koordinatla temsil edilmez)
const rows = await prisma.powerPlant.findMany({ where: { projectId: { not: null }, type: "GES", epiasPlantId: { not: null } }, select: { epiasPlantId: true, name: true } });
await prisma.$disconnect();
const plants = new Map<number, string>();
for (const r of rows) if (!isUnlicensedName(r.name)) plants.set(r.epiasPlantId!, r.name);

// Eğitim verisini tazele (en iyi çaba): her adımdan önce kesime 15 dakikadan çok kalmalı (adım en çok 6 dakika; tahminler
// ve kayıt için en az 9 dakika kalır)
{
  const ids = Array.from(plants.keys()).map(String);
  for (const [label, args] of [
    ["gerçek zamanlı üretim", ["scripts/realtime-sync.mts", ...ids]],
    ["hava tahmini arşivi", ["scripts/weather-sync.mts", ...ids]],
    ["uydu ışınımı", ["scripts/satellite-sync.mts", ...ids]],
  ] as const) {
    if (forecastCutoff(target) - Date.now() < 15 * 60_000) {
      console.log(`${stamp()} ${target}: ${label}: kesime az kaldı, atlandı`);
      continue;
    }
    const r = spawnSync(process.execPath, ["--env-file=.env", "node_modules/.bin/tsx", "--tsconfig", "tsconfig.json", ...args], { cwd: process.cwd(), timeout: 6 * 60_000, encoding: "utf8" });
    const last = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").filter((l) => /santral|istek|erişil|Gerçek zamanlı/i.test(l)).slice(-1)[0] ?? "";
    console.log(`${stamp()} ${target}: ${label}: ${r.status === 0 ? "tamam" : r.error ? "zaman aşımı" : "atlandı"}${last ? ` (${last.slice(0, 160)})` : ""}`);
  }
}

// Hava modelinin son çalışması (tahmin isteği o andaki en yeni çalışmayı döndürür; tahminlerden önce ve sonra okunur)
async function lastRunInit(): Promise<string | null> {
  try {
    const meta = (await (await fetch(`https://api.open-meteo.com/data/${WEATHER_MODEL}/static/meta.json`)).json()) as { last_run_initialisation_time?: number };
    return meta.last_run_initialisation_time ? new Date(meta.last_run_initialisation_time * 1000).toISOString() : null;
  } catch {
    return null;
  }
}
const runInit = await lastRunInit();

// Günün 00Z çalışması yoksa (ya da bilinmiyorsa) ve vakit varsa bekle
const today00z = Date.UTC(new Date(started).getUTCFullYear(), new Date(started).getUTCMonth(), new Date(started).getUTCDate());
if ((runInit === null || Date.parse(runInit) < today00z) && canWait()) {
  console.log(`${stamp()} ${target}: günün 00Z hava çalışması henüz yok (son ${runInit ?? "bilinmiyor"}); kesime vakit var, sonraki çalışma yazacak`);
  process.exit(0);
}

const out: ForecastLogPlant[] = [];
for (const [id, name] of Array.from(plants.entries()).sort((a, b) => a[0] - b[0])) {
  if (!(await readPoolPlantInfo(id))?.location) {
    out.push({ epiasPlantId: id, name, status: "error", message: "Havuzda konum yok" });
    continue;
  }
  const f = await forecastSolarPlant(id, targetDayWall(target), 24, { now: started, fresh: true });
  // Hava yanıtında hedef günün saatleri yoksa tahmin yok sayılır
  if (f.status === "ok" && !(f.hours ?? []).some((v) => v !== null)) out.push({ epiasPlantId: id, name, status: "error", message: "Hava tahmininde hedef günün saatleri yok" });
  else out.push({ epiasPlantId: id, name, ...f });
}
const weatherFailed = out.filter((p) => p.status === "error" && /Open-Meteo|fetch|ECONN|ETIMEDOUT/i.test(p.message ?? ""));
if (weatherFailed.length && canWait()) {
  console.log(`${stamp()} ${target}: ${weatherFailed.length} santralde hava isteği düştü (${weatherFailed[0].message}); kesime vakit var, sonraki çalışma yazacak`);
  process.exit(0);
}
const runInitAfter = await lastRunInit();

let code: string | null = null;
try {
  code = execSync("git rev-parse --short HEAD", { cwd: process.cwd() }).toString().trim() + (execSync("git status --porcelain -- lib scripts", { cwd: process.cwd() }).toString().trim() ? "+değişiklik" : "");
} catch {
  /* git yok */
}

// Yazılma anı: bütün hava tahminleri alındıktan sonra (kötümser)
const issuedAt = Date.now();
const log: ForecastLog = {
  schema: FORECAST_LOG_SCHEMA,
  tech: "GES",
  targetDate: target,
  issuedAt: new Date(issuedAt).toISOString(),
  cutoff: new Date(forecastCutoff(target)).toISOString(),
  onTime: isOnTime(issuedAt, target),
  model: { id: SOLAR_MODEL_ID, trainingMonths: 4 },
  weather: { source: "Open-Meteo Forecast API (CC BY 4.0)", model: WEATHER_MODEL, runInit, ...(runInitAfter !== runInit ? { runInitAfter } : {}) },
  code,
  plants: out,
};
const ok = out.filter((p) => p.status === "ok");
if (!ok.length) {
  console.error(`${stamp()} ${target}: hiçbir santral için tahmin yapılamadı; yazılmadı`);
  for (const p of out) console.error(`  ${p.name}: ${p.message ?? p.status}`);
  process.exit(1);
}
const written = await writeForecastLog(log);
const mwh = ok.reduce((s, p) => s + (p.hours ?? []).reduce((a: number, v) => a + (v ?? 0), 0), 0);
console.log(
  `${stamp()} ${target}: ${written ? "yazıldı" : "başka bir çalışma önce yazmış, dokunulmadı"}; ${ok.length}/${out.length} santral, toplam ${mwh.toFixed(1)} MWh; kesimden önce: ${log.onTime ? "evet" : "HAYIR"}; hava çalışması ${runInit ?? "?"}`
);
for (const p of out) if (p.status !== "ok" || p.warning) console.log(`  ${p.name}: ${p.message ?? p.warning}`);
