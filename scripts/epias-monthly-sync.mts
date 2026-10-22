/**
 * Aylık EPİAŞ eşitlemesi, kendiliğinden (güneş motoru yol haritası 2. adım; kullanıcı 18.10.2026: "1. yolu yapalım").
 *
 * Mac'te saatte bir çalışır (scripts/launchd/com.tr-energy.epias-monthly.plist). Hedef ay: geçen ay (Türkiye saati).
 * Her çalışmada önce iki küçük günlük iş: geçici üretim (12 saatte bir) ve piyasa fiyatları (`market-sync.mts --recent`,
 * veri dünü içerene kadar her saat; içeriyorsa bir saniyede çıkar). Piyasa sayfası böylece her gün dünün verisini gösterir.
 *   1. Ay tamamlandıysa ya da başka bir çalışma sürüyorsa hiçbir şey yapmaz.
 *   2. EPİAŞ veri uç noktasına erişilemiyorsa yapmaz; ayın 5'inden sonra günde bir kez bildirim (20.10.2026'dan beri VPN
 *      gerekmiyor, erişim yoksa internet bağlantısı ya da EPİAŞ kesintisi).
 *   3. Hedef ayın üretimi (UEVM) henüz yayımlanmamışsa (en büyük üç karne santralinde ayın son günü boş) yapmaz.
 *   4. Adımlar sırayla, her biri ayrı süreçte; biten adım bir sonraki çalışmada atlanır (kaldığı yerden sürer). Santral
 *      toplamasında üç HTTP 403 (EPİAŞ güvenlik duvarı) gelirse durdurulur; bir saat sonraki çalışma sürdürür.
 *   5. Toplamadan sonra karne denetlenir: dönem hedef ayın sonuna ulaşmadıysa ya da lisanslı santral sayısı önceki karnenin
 *      %90'ının altına düştüyse karne önceki döneme geri kurulur (--rebuild) ve adım başarısız sayılır.
 *   6. Sonunda raporlar ve testler; başlarken ve biterken bildirim.
 * Durum: .cache/epias/monthly-sync.json; günlük: ~/Library/Logs/tr-energy-epias-monthly.log (launchd). EPİAŞ dışı adımlar
 * (Open-Meteo hava, analizler) da burada; Open-Meteo sınırına takılan adım sonraki çalışmada yeniden denenir.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/epias-monthly-sync.mts [--dry] [--force-month YYYY-AA]
 *
 * --dry: yalnız ön denetimler, adım çalıştırılmaz. --force-month: hedef ayı elle ver.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fetchUevm } from "@/lib/services/epias-plants";
import { parseUevmItems } from "@/lib/epias-plant/plant-data";
import { notify as sendNotification } from "@/lib/notify";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".cache", "epias");
const STATE_FILE = path.join(CACHE, "monthly-sync.json");
const LOCK_FILE = path.join(CACHE, "monthly-sync.lock");
const TR = 3 * 3_600_000;
const dry = process.argv.includes("--dry");
const forced = process.argv.includes("--force-month") ? process.argv[process.argv.indexOf("--force-month") + 1] : null;

const pad = (n: number) => String(n).padStart(2, "0");
const wallNow = new Date(Date.now() + TR);
const prev = new Date(Date.UTC(wallNow.getUTCFullYear(), wallNow.getUTCMonth() - 1, 1));
const month = forced ?? `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}`;
const [Y, M] = month.split("-").map(Number);
const monthStart = `${month}-01`;
const monthEnd = `${month}-${pad(new Date(Date.UTC(Y, M, 0)).getUTCDate())}`;
const today = wallNow.toISOString().slice(0, 10);
const stamp = () => new Date(Date.now() + TR).toISOString().slice(0, 16).replace("T", " ");
const log = (s: string) => console.log(`${stamp()} [${month}] ${s}`);

interface State {
  month: string;
  status: "running" | "done" | "failed" | "waiting";
  steps: Record<string, { ok: boolean; at: string; note?: string }>;
  lastNotice?: string;
  startedAt?: string;
  finishedAt?: string;
}
const readState = (): State => {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State;
    if (s.month === month) return s;
    // Yeni ay: son bildirim gününü taşı (aynı gün iki kez bildirim çıkmasın)
    return { month, status: "waiting", steps: {}, lastNotice: s.lastNotice };
  } catch {
    return { month, status: "waiting", steps: {} };
  }
};
const state = readState();
const saveState = () => {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
};

function notify(title: string, text: string) {
  log(`BİLDİRİM: ${title}: ${text}`);
  if (dry) return;
  sendNotification(title, text);
}

// Kilit: başka bir çalışma sürüyorsa çık (süreç ölmüşse kilit bayattır)
if (fs.existsSync(LOCK_FILE)) {
  const pid = Number(fs.readFileSync(LOCK_FILE, "utf8"));
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {
    /* süreç yok */
  }
  if (alive) process.exit(0);
  fs.rmSync(LOCK_FILE, { force: true });
}

// Geçici üretim (EPİAŞ gerçek zamanlı üretimi): son başarıdan 12 saat geçtiyse dene (EPİAŞ'a erişim yoksa birkaç saniyede düşer).
// Aylık eşitleme sürerken çalışmaz (kilit yukarıda): EPİAŞ dakikada 80 istek sınırı.
{
  let lastOk = 0;
  try {
    lastOk = Date.parse(JSON.parse(fs.readFileSync(path.join(CACHE, "realtime-sync.json"), "utf8")).lastOkAt ?? "") || 0;
  } catch {
    /* ilk çalışma */
  }
  if (!dry && Date.now() - lastOk > 12 * 3_600_000) {
    const r = await new Promise<number | null>((resolve) => {
      const c = spawn(process.execPath, ["--env-file=.env", "node_modules/.bin/tsx", "--tsconfig", "tsconfig.json", "scripts/realtime-sync.mts", "--all-project"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      c.stdout.on("data", (b) => (out += b));
      c.stderr.on("data", (b) => (out += b));
      const timer = setTimeout(() => c.kill("SIGTERM"), 20 * 60_000);
      c.on("close", (code) => {
        clearTimeout(timer);
        console.log(`${stamp()} geçici üretim: ${out.trim().split("\n")[0] ?? ""}`);
        resolve(code);
      });
    });
    void r;
  }
}

// Piyasa fiyatları (PTF, SMF, sistem yönü, GİP): dünü içermiyorsa son üç günle birlikte çek. Aynı kilit altında.
if (!dry) {
  await new Promise<void>((resolve) => {
    const c = spawn(process.execPath, ["--env-file=.env", "node_modules/.bin/tsx", "--tsconfig", "tsconfig.json", "scripts/market-sync.mts", "--recent"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    c.stdout.on("data", (b) => (out += b));
    c.stderr.on("data", (b) => (out += b));
    const timer = setTimeout(() => c.kill("SIGTERM"), 10 * 60_000);
    c.on("close", () => {
      clearTimeout(timer);
      const line = out.trim().split("\n").pop() ?? "";
      if (!line.startsWith("Piyasa verisi güncel")) console.log(`${stamp()} günlük piyasa: ${line}`);
      resolve();
    });
  });
}

if (state.status === "done") process.exit(0);

// Erişim ve yayım denetimi: en büyük üç karne santralinde hedef ayın son günü UEVM
function sentinelPlants(): number[] {
  for (const y of [Y, Y - 1]) {
    try {
      const k = JSON.parse(fs.readFileSync(path.join(CACHE, `sector-${y}.json`), "utf8")) as { plants: Array<{ epiasPlantId: number; actualMwh: number }> };
      return [...k.plants]
        .sort((a, b) => b.actualMwh - a.actualMwh)
        .slice(0, 3)
        .map((p) => p.epiasPlantId);
    } catch {
      /* sonraki yıl */
    }
  }
  return [];
}
async function published(): Promise<"yes" | "no" | "unreachable"> {
  const ids = sentinelPlants();
  if (!ids.length) return "unreachable";
  let reached = false;
  for (const id of ids) {
    try {
      const series = parseUevmItems((await fetchUevm(id, monthEnd, monthEnd)) as Array<Record<string, unknown>>);
      reached = true;
      if (Array.from(series.values.values()).some((v) => v > 0)) return "yes";
    } catch {
      /* erişim yok ya da santral boş: sonrakine bak */
    }
  }
  return reached ? "no" : "unreachable";
}

const pub = await published();
if (pub !== "yes") {
  if (pub === "unreachable" && wallNow.getUTCDate() >= 5 && state.lastNotice !== today) {
    notify("EPİAŞ eşitlemesi bekliyor", `${month} verisi için EPİAŞ'a erişilemiyor. VPN gerekmez: internet bağlantını kontrol et; erişim gelince bir saat içinde kendiliğinden başlar.`);
    state.lastNotice = today;
  }
  log(pub === "unreachable" ? "EPİAŞ'a erişilemiyor (internet bağlantısı ya da EPİAŞ kesintisi?)" : "hedef ayın üretimi (UEVM) henüz yayımlanmamış");
  if (!dry) saveState();
  process.exit(0);
}
log("EPİAŞ erişilebilir, hedef ayın üretimi yayımlanmış");
if (dry) {
  log(`kuru çalışma: adımlar ${Object.keys(state.steps).length ? "(biten: " + Object.keys(state.steps).filter((k) => state.steps[k].ok).join(", ") + ")" : ""} çalıştırılmadı`);
  process.exit(0);
}

fs.writeFileSync(LOCK_FILE, String(process.pid));
const releaseLock = () => fs.rmSync(LOCK_FILE, { force: true });
process.on("exit", releaseLock);
if (state.status !== "running" && state.status !== "failed") notify("EPİAŞ eşitlemesi başladı", `${month}: piyasa, santral üretimi, karne ve analizler (1–3 saat).`);
state.status = "running";
state.startedAt ??= new Date().toISOString();
saveState();

/** Adımı ayrı süreçte çalıştırır; `watch403` ile üç HTTP 403'te durdurur */
function run(args: string[], opts: { watch403?: boolean } = {}): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--env-file=.env", "node_modules/.bin/tsx", "--tsconfig", "tsconfig.json", ...args], { cwd: ROOT });
    let out = "";
    let blocked = 0;
    const onData = (b: Buffer) => {
      const s = b.toString();
      out += s;
      process.stdout.write(s);
      if (opts.watch403) {
        blocked += (s.match(/HTTP 403/g) ?? []).length;
        if (blocked >= 3) child.kill("SIGTERM");
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => resolve({ ok: code === 0 && blocked < 3, out: blocked >= 3 ? out + "\nEPİAŞ 3 kez HTTP 403 (güvenlik duvarı): durduruldu" : out }));
  });
}

const karne = (y: number) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(CACHE, `sector-${y}.json`), "utf8")) as { plants: unknown[]; period?: { end: string } };
  } catch {
    return null;
  }
};

interface Step {
  name: string;
  args: string[];
  watch403?: boolean;
  /** Adım bittikten sonra ek denetim; hata metni döndürürse adım başarısız */
  verify?: (before: { karnePlants: number; karneEnd: string | null }) => Promise<string | null>;
}
const steps: Step[] = [
  { name: "piyasa", args: ["scripts/market-sync.mts", monthStart] },
  { name: "sistem geneli (sistem yönü)", args: ["scripts/system-sync.mts"] },
  { name: "arıza bildirimleri", args: ["scripts/umm-sync.mts", month] },
  { name: "YEKDEM listeleri", args: ["scripts/yekdem-exit-sync.mts"] },
  { name: "toplayıcı portföyleri", args: ["scripts/aggregator-collect.mts"] },
  {
    name: "santral üretimi ve karne",
    args: ["scripts/sector-collect.mts", String(Y), "--hes"],
    watch403: true,
    verify: async (before) => {
      const k = karne(Y);
      const end = k?.period?.end ?? null;
      const n = k?.plants.length ?? 0;
      const problem =
        end === null || end < monthEnd ? `karne dönemi ${end ?? "?"} (beklenen ${monthEnd})` : before.karnePlants && n < before.karnePlants * 0.9 ? `karnede ${n} santral (önceki ${before.karnePlants})` : null;
      if (problem && before.karneEnd) {
        // Eksik santrallerle kurulmuş karneyi önceki döneme geri kur (EPİAŞ'a gitmeden)
        await run(["scripts/sector-collect.mts", String(Y), before.karneEnd, "--hes", "--rebuild"]);
      }
      return problem;
    },
  },
  { name: "uydu ışınımı", args: ["scripts/satellite-sync.mts"] },
  { name: "rüzgâr (karne)", args: ["scripts/wind-sync.mts", "--sector"] },
  { name: "hava tahmini arşivi (güneş)", args: ["scripts/weather-sync.mts"] },
  { name: "hava tahmini arşivi (rüzgâr)", args: ["scripts/wind-forecast-sync.mts"] },
  { name: "yakalama oranı", args: ["scripts/sector-capture.mts"] },
  { name: "kar derinliği (güneş kaybı için)", args: ["scripts/snow-sync.mts"] },
  { name: "güneş kaybı", args: ["scripts/sector-curtailment.mts"] },
  { name: "rüzgâr kaybı", args: ["scripts/sector-wind-curtailment.mts"] },
  { name: "hidro kaybı", args: ["scripts/sector-hydro-curtailment.mts"] },
  { name: "sistem yönü santral payları", args: ["scripts/system-attribution.mts"] },
  { name: "geçmişle sınama", args: ["scripts/sector-backtest.mts"] },
  { name: "toplayıcı kıyası", args: ["scripts/aggregator-benchmark.mts", String(Y)] },
  { name: "GİP katılımı", args: ["scripts/gip-participation.mts", String(Y), String(M)] },
  ...(Y === 2026 ? [{ name: "bütçe sınaması", args: ["scripts/budget-backtest.mts", String(M)] }] : []),
  { name: "rapor denetimi", args: ["scripts/check-reports.mts"] },
  { name: "testler", args: ["node_modules/vitest/vitest.mjs", "run"] },
];

let failed: string | null = null;
for (const s of steps) {
  if (state.steps[s.name]?.ok) continue;
  log(`adım: ${s.name}`);
  const k = karne(Y);
  const before = { karnePlants: k?.plants.length ?? 0, karneEnd: k?.period?.end ?? null };
  const r = s.name === "testler" ? await runPlain(s.args) : await run(s.args, { watch403: s.watch403 });
  const problem = r.ok ? ((await s.verify?.(before)) ?? null) : r.out.trim().split("\n").slice(-1)[0]?.slice(0, 200) || "hata";
  state.steps[s.name] = { ok: !problem, at: new Date().toISOString(), ...(problem ? { note: problem } : {}) };
  saveState();
  if (problem) {
    failed = `${s.name}: ${problem}`;
    break;
  }
}

/** vitest tsx olmadan çalışır */
function runPlain(args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT });
    let out = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stderr.on("data", (b) => (out += b.toString()));
    child.on("close", (code) => {
      process.stdout.write(out.split("\n").filter((l) => /Test Files|Tests|FAIL/.test(l)).join("\n") + "\n");
      resolve({ ok: code === 0, out });
    });
  });
}

if (failed) {
  state.status = "failed";
  // Saatte bir yeniden denenir; bildirim günde bir kez
  if (state.lastNotice !== today) {
    notify("EPİAŞ eşitlemesi yarım kaldı", `${failed}. Saatte bir kaldığı yerden yeniden denenecek.`);
    state.lastNotice = today;
  }
  saveState();
  process.exit(1);
}
state.status = "done";
state.finishedAt = new Date().toISOString();
saveState();
const k = karne(Y);
notify("EPİAŞ eşitlemesi bitti", `${month}: karne ${k?.period?.end ?? "?"} dönemine, ${k?.plants.length ?? "?"} lisanslı santral. Raporlar ve testler temiz.`);
