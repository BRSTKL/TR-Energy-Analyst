/**
 * Geçici üretim eşitlemesi: EPİAŞ gerçek zamanlı üretimi (GZÜ) havuza (lib/services/realtime-generation.ts, kural
 * lib/pool/provisional.ts). Yalnız eksik günler çekilir (UEVM'nin ya da son çekimin ertesinden bugün − 2'ye).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/realtime-sync.mts [--all-project] [epiasPlantId ...]
 *
 * Varsayılan: proje güneş santralleri (lisanslı). `--all-project`: projelerdeki bütün santraller (rüzgâr, hidro dahil).
 * EPİAŞ'a erişilemezse çıkış 1 (VPN kapalı). Saatlik aylık eşitleme görevi ve sabahki tahmin kaydı bunu çağırır.
 * Durum: .cache/epias/realtime-sync.json (son deneme, son başarı).
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { syncProvisional } from "@/lib/services/realtime-generation";

const STATE = path.join(process.cwd(), ".cache", "epias", "realtime-sync.json");
// Kilit: aynı anda iki GZÜ eşitlemesi ya da aylık EPİAŞ eşitlemesiyle birlikte çalışmaz (dakikada 80 istek sınırı)
const LOCK = path.join(process.cwd(), ".cache", "epias", "realtime-sync.lock");
const MONTHLY_LOCK = path.join(process.cwd(), ".cache", "epias", "monthly-sync.lock");
const alive = (file: string) => {
  try {
    process.kill(Number(fs.readFileSync(file, "utf8")), 0);
    return true;
  } catch {
    return false;
  }
};
if (alive(LOCK) || (alive(MONTHLY_LOCK) && Number(fs.readFileSync(MONTHLY_LOCK, "utf8")) !== process.ppid)) {
  console.log("Gerçek zamanlı üretim: başka bir EPİAŞ eşitlemesi sürüyor, atlandı");
  process.exit(0);
}
fs.mkdirSync(path.dirname(LOCK), { recursive: true });
fs.writeFileSync(LOCK, String(process.pid));
process.on("exit", () => fs.rmSync(LOCK, { force: true }));
const ids = process.argv.slice(2).map(Number).filter(Boolean);
const all = process.argv.includes("--all-project");
let targets = ids;
if (!targets.length) {
  const rows = await prisma.powerPlant.findMany({ where: { projectId: { not: null }, epiasPlantId: { not: null }, ...(all ? {} : { type: "GES" }) }, select: { epiasPlantId: true, name: true } });
  targets = Array.from(new Set(rows.filter((r) => !isUnlicensedName(r.name)).map((r) => r.epiasPlantId!))).sort((a, b) => a - b);
}
await prisma.$disconnect();

const prev = (() => {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
})();
const stamp = new Date().toISOString();
let res;
try {
  res = await syncProvisional(targets);
} catch (e) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ ...prev, lastRunAt: stamp, lastError: e instanceof Error ? e.message.slice(0, 200) : String(e) }, null, 1));
  console.error(`Gerçek zamanlı üretim: EPİAŞ'a erişilemedi (${e instanceof Error ? e.message.slice(0, 120) : e})`);
  process.exit(1);
}
const count = (s: string) => res.filter((r) => r.status === s).length;
const ok = count("updated") + count("current");
fs.mkdirSync(path.dirname(STATE), { recursive: true });
fs.writeFileSync(
  STATE,
  JSON.stringify({ lastRunAt: stamp, ...(ok ? { lastOkAt: stamp } : { lastOkAt: prev.lastOkAt ?? null }), targets: targets.length, updated: count("updated"), current: count("current"), notListed: count("not-listed"), errors: count("error") }, null, 1)
);
const hours = res.reduce((s, r) => s + (r.hours ?? 0), 0);
const ranges = res.filter((r) => r.range).map((r) => r.range!);
console.log(
  `Gerçek zamanlı üretim: ${targets.length} santral; güncellenen ${count("updated")} (${hours} saat${ranges.length ? `, ${ranges[0].from} – ${ranges[0].to}` : ""}), güncel ${count("current")}, listede yok ${count("not-listed")}, hata ${count("error")}`
);
for (const r of res) if (r.status === "error" || r.status === "not-listed") console.log(`  #${r.epiasPlantId}: ${r.message}`);
if (!ok) process.exit(1);
