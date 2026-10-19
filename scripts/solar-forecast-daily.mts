/**
 * Günlük güneş tahmin kaydı (PLAN 21.1; kural lib/forecast/forecast-log.ts): proje güneş santralleri (lisanslı, konumu
 * havuzda) için D günü saatlik tahmini, GÖP kesiminden (D-1 12:30) önce bir kez yazar. Kayıt varsa dokunmaz.
 * Model ve eğitim Üretim tahmini sayfasıyla aynı (lib/services/live-forecast.ts `forecastSolarPlant`); hava tahmini
 * önbelleğe bakılmadan o an çekilir. Hedef: yarın (Türkiye saati); yarının kesimi geçtiyse yazılmaz (öbür gün eski hava
 * çalışmasıyla kilitlenmesin; sızıntı denetimi 18.10.2026). Bugün ya da geçmiş gün hiçbir zaman yazılmaz: eğitim çalışma
 * anına göre seçildiği için hedef günden sonraki üretimi görürdü, canlı hava yanıtında da geçmiş saat yoktur.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/solar-forecast-daily.mts [YYYY-MM-DD] [--late] [--dry]
 *
 * `--dry`: her şeyi yapar ama kaydı yazmaz (sınama).
 *
 * `--late`: kesimi geçmiş yarın için yine de yaz (`onTime: false`, karne saymaz). Kesimden önce başlayıp sonra biten
 * çalışma da `onTime: false` yazar (`issuedAt` bütün tahminlerden sonra alınır).
 * Önce ağ beklenir (Mac uykudan uyanınca launchd ağ gelmeden çalıştırıyor; 19.10.2026 sabahı bütün istekler düştü): en
 * çok 10 dakika. Sonra eğitim verisi tazelenir: EPİAŞ gerçek zamanlı üretimi (scripts/realtime-sync.mts; VPN kapalıysa
 * atlanır), hava tahmini arşivi ve uydu ışınımı (Open-Meteo). Her adım kendi süreç grubunda, en çok 6 dakika (kesime 15
 * dakikadan az kalacaksa kısalır; süre dolunca alt süreçleriyle birlikte kapatılır: tsx betiği ayrı süreçte çalıştırır,
 * yalnız dış süreç kapatılınca adım 29 dakika sürmüştü). Hatası kaydı durdurmaz.
 * Zamanlama: scripts/launchd/ (Mac saatiyle 08:30 ve 10:00). Kesime WAIT_MARGIN'dan çok varken şu durumlarda yazmadan
 * çıkar (sonraki çalışma yazar): günün 00Z ECMWF çalışması henüz yayımlanmamış (ya da bilinmiyor), bir santralin hava
 * isteği düşmüş. Kesime daha az kaldıysa düşen hava istekleri kesime 10 dakika kalana kadar yeniden denenir (19.10.2026:
 * Open-Meteo aşırı yüklüydü, 36 santralin 18'i düştü), sonra elde olanla yazar. Kayıt varsa ikinci çalışma bir şey yapmaz.
 */

import { execSync, spawn } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { forecastSolarPlant } from "@/lib/services/live-forecast";
import { readForecastLog, writeForecastLog, forecastLogPath } from "@/lib/services/forecast-log";
import { FORECAST_LOG_SCHEMA, SOLAR_MODEL_ID, forecastCutoff, isOnTime, nextTargetDate, targetDayWall, type ForecastLog, type ForecastLogPlant } from "@/lib/forecast/forecast-log";
import { WEATHER_MODEL } from "@/lib/weather/weather-codec";

const arg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const late = process.argv.includes("--late");
const dry = process.argv.includes("--dry");
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

const MIN = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const left = () => forecastCutoff(target) - Date.now();

/** Adımı kendi süreç grubunda çalıştırır; süre dolunca grubun tamamı (tsx'in alt süreci dahil) kapatılır */
function runStep(args: readonly string[], timeoutMs: number): Promise<{ code: number | null; timedOut: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--env-file=.env", "node_modules/.bin/tsx", "--tsconfig", "tsconfig.json", ...args], { cwd: process.cwd(), detached: true });
    let out = "";
    let timedOut = false;
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (out += b));
    const killGroup = (sig: NodeJS.Signals) => {
      try {
        process.kill(-child.pid!, sig);
      } catch {
        /* grup bitmiş */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      killGroup("SIGKILL"); // geride kalan alt süreç olmasın
      resolve({ code, timedOut, out });
    });
  });
}

// Ağ hazır mı: Open-Meteo'ya erişim (en çok 10 dakika, kesime 20 dakikadan az kalmayacak şekilde)
async function online(): Promise<boolean> {
  try {
    return (await fetch(`https://api.open-meteo.com/data/${WEATHER_MODEL}/static/meta.json`, { signal: AbortSignal.timeout(10_000) })).ok;
  } catch {
    return false;
  }
}
{
  const until = Math.min(Date.now() + 10 * MIN, forecastCutoff(target) - 20 * MIN);
  let waited = false;
  while (!(await online()) && Date.now() < until) {
    waited = true;
    await sleep(30_000);
  }
  if (waited) console.log(`${stamp()} ${target}: ağ ${(await online()) ? "hazır" : "hâlâ yok, yine de devam"} (bekleme ${Math.round((Date.now() - started) / MIN)} dk)`);
}

// Eğitim verisini tazele (en iyi çaba): her adımdan önce kesime 15 dakikadan çok kalmalı; adım en çok 6 dakika ve kesime
// 15 dakika kalacak kadar
{
  const ids = Array.from(plants.keys()).map(String);
  for (const [label, args] of [
    ["gerçek zamanlı üretim", ["scripts/realtime-sync.mts", ...ids]],
    ["hava tahmini arşivi", ["scripts/weather-sync.mts", ...ids]],
    ["uydu ışınımı", ["scripts/satellite-sync.mts", ...ids]],
  ] as const) {
    if (left() < 16 * MIN) {
      console.log(`${stamp()} ${target}: ${label}: kesime az kaldı, atlandı`);
      continue;
    }
    const r = await runStep(args, Math.min(6 * MIN, left() - 15 * MIN));
    const last = r.out.trim().split("\n").filter((l) => /santral|istek|erişil|Gerçek zamanlı|429|503/i.test(l)).slice(-1)[0] ?? "";
    console.log(`${stamp()} ${target}: ${label}: ${r.code === 0 ? "tamam" : r.timedOut ? "zaman aşımı" : "atlandı"}${last ? ` (${last.slice(0, 160)})` : ""}`);
  }
}

// Hava modelinin son çalışması (tahmin isteği o andaki en yeni çalışmayı döndürür; tahminlerden önce ve sonra okunur)
async function lastRunInit(): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const meta = (await (await fetch(`https://api.open-meteo.com/data/${WEATHER_MODEL}/static/meta.json`, { signal: AbortSignal.timeout(15_000) })).json()) as { last_run_initialisation_time?: number };
      return meta.last_run_initialisation_time ? new Date(meta.last_run_initialisation_time * 1000).toISOString() : null;
    } catch {
      await sleep(10_000);
    }
  }
  return null;
}
const runInit = await lastRunInit();

// Günün 00Z çalışması yoksa (ya da bilinmiyorsa) ve vakit varsa bekle
const today00z = Date.UTC(new Date(started).getUTCFullYear(), new Date(started).getUTCMonth(), new Date(started).getUTCDate());
if ((runInit === null || Date.parse(runInit) < today00z) && canWait()) {
  console.log(`${stamp()} ${target}: günün 00Z hava çalışması henüz yok (son ${runInit ?? "bilinmiyor"}); kesime vakit var, sonraki çalışma yazacak`);
  process.exit(0);
}

async function forecastOne(id: number, name: string): Promise<ForecastLogPlant> {
  if (!(await readPoolPlantInfo(id))?.location) return { epiasPlantId: id, name, status: "error", message: "Havuzda konum yok" };
  const f = await forecastSolarPlant(id, targetDayWall(target), 24, { now: started, fresh: true });
  // Hava yanıtında hedef günün saatleri yoksa tahmin yok sayılır
  if (f.status === "ok" && !(f.hours ?? []).some((v) => v !== null)) return { epiasPlantId: id, name, status: "error", message: "Hava tahmininde hedef günün saatleri yok" };
  return { epiasPlantId: id, name, ...f };
}
const isWeatherFailure = (p: ForecastLogPlant) => p.status === "error" && /Open-Meteo|fetch|ECONN|ETIMEDOUT|abort|timeout/i.test(p.message ?? "");

const out: ForecastLogPlant[] = [];
for (const [id, name] of Array.from(plants.entries()).sort((a, b) => a[0] - b[0])) out.push(await forecastOne(id, name));
let weatherFailed = out.filter(isWeatherFailure);
if (weatherFailed.length && canWait()) {
  console.log(`${stamp()} ${target}: ${weatherFailed.length} santralde hava isteği düştü (${weatherFailed[0].message}); kesime vakit var, sonraki çalışma yazacak`);
  process.exit(0);
}
// Son çalışma: düşenleri kesime 10 dakika kalana kadar 90 saniye arayla yeniden dene
for (let round = 1; weatherFailed.length && left() > 10 * MIN + 90_000; round++) {
  console.log(`${stamp()} ${target}: ${weatherFailed.length} santralde hava isteği düştü (${weatherFailed[0].message}); ${round}. yeniden deneme`);
  await sleep(90_000);
  for (const p of weatherFailed) out[out.indexOf(p)] = await forecastOne(p.epiasPlantId, p.name);
  weatherFailed = out.filter(isWeatherFailure);
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
if (dry) {
  console.log(`${stamp()} ${target}: kuru çalışma, yazılmadı; ${ok.length}/${out.length} santral; kesimden önce: ${log.onTime ? "evet" : "HAYIR"}; hava çalışması ${runInit ?? "?"}`);
  for (const p of out) if (p.status !== "ok") console.log(`  ${p.name}: ${p.message}`);
  process.exit(0);
}
const written = await writeForecastLog(log);
const mwh = ok.reduce((s, p) => s + (p.hours ?? []).reduce((a: number, v) => a + (v ?? 0), 0), 0);
console.log(
  `${stamp()} ${target}: ${written ? "yazıldı" : "başka bir çalışma önce yazmış, dokunulmadı"}; ${ok.length}/${out.length} santral, toplam ${mwh.toFixed(1)} MWh; kesimden önce: ${log.onTime ? "evet" : "HAYIR"}; hava çalışması ${runInit ?? "?"}`
);
for (const p of out) if (p.status !== "ok" || p.warning) console.log(`  ${p.name}: ${p.message ?? p.warning}`);
