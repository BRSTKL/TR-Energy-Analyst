/**
 * Bağımsız doğrulama (PLAN 11.3): hesap motorunu kullanmadan ham veriden yeniden hesaplar ve motorla karşılaştırır.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify/verify-independent.mts [projeId] [--hours 20]
 *
 * Ham veri: havuz dosyası (data/pool/<id>/<yıl>.json.gz, zlib ile doğrudan açılır, pool-codec kullanılmaz), EPİAŞ fiyatları
 * (MarketData: PTF, SMF, resmi dengesizlik fiyatları, GİP ağırlıklı ortalaması). Formüller bu dosyada, mevzuattan:
 * - Dengesizlik maliyeti: d = UEVM − plan; d > 0 ise d × (PTF − pozitif fiyat), d < 0 ise |d| × (negatif fiyat − PTF).
 *   2026: EPİAŞ resmi fiyatı (sistem dengesizlik tutarı ÷ miktarı). 2025 öncesi: MIN(PTF,SMF)×0,97 / MAX(PTF,SMF)×1,03.
 * - KÜPST (EPDK 14029 / 13025): max(0, |UEVM − KÜP| − tolerans × KÜP) × max(PTF, SMF) × katsayı; KÜP = son plan, yoksa ilk.
 * - GİP işlem maliyeti: (ilk − son plan) × (GİP − PTF).
 * Motordan yalnızca hangi saatlerin projede olduğu alınır (dönem ve plan-gerçekleşen birlikte olan saatler).
 *
 * Örneklem: rastgele (sabit tohum) saatler; en az 3'ü PTF < 150, en az 5'i sistem açığı (DEFICIT) olan sapmalı saat, en az 5'i
 * planı gün içinde değişen saat. Ayrıca bütün saatlerin toplamları ve 2025'in tamamında formül = resmi fiyat sınanır.
 * Saat başına fark 1 TL'yi aşarsa çıkış kodu 1.
 */

import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { kupstForHour } from "@/lib/calculations/kupst";
import { intradayTradeCost } from "@/lib/analysis/intraday-trade";

const args = process.argv.slice(2);
const hoursArg = args.indexOf("--hours");
const SAMPLE = hoursArg >= 0 ? Number(args[hoursArg + 1]) : 20;
const projectArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--hours");
const TOL_TL = 1;

const project = projectArg
  ? await prisma.project.findUnique({ where: { id: projectArg }, select: { id: true, name: true } })
  : await prisma.project.findFirst({ where: { name: { startsWith: "Gain" } }, select: { id: true, name: true } });
if (!project) throw new Error("Proje bulunamadı");

// --- Ham veri -------------------------------------------------------------------------------------------------------
const HOUR = 3_600_000;
const poolCache = new Map<string, { kgupFirst: (number | null)[]; kgupFinal: (number | null)[]; uevm: (number | null)[] } | null>();
function rawPool(epiasId: number, year: number) {
  const key = `${epiasId}/${year}`;
  if (!poolCache.has(key)) {
    const file = path.join(process.env.POOL_DIR || path.join(process.cwd(), "data", "pool"), String(epiasId), `${year}.json.gz`);
    poolCache.set(key, fs.existsSync(file) ? JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8")) : null);
  }
  return poolCache.get(key)!;
}
function rawHour(epiasId: number, t: number) {
  const year = new Date(t).getUTCFullYear();
  const doc = rawPool(epiasId, year);
  if (!doc) return null;
  const i = (t - Date.UTC(year, 0, 1)) / HOUR;
  return { first: doc.kgupFirst[i], final: doc.kgupFinal[i], uevm: doc.uevm[i] };
}

const market = new Map<number, { ptf: number; smf: number; dir: string; pos: number | null; neg: number | null; gip: number | null }>();
for (const m of await prisma.marketData.findMany({
  select: { timestamp: true, ptf: true, smf: true, systemDirection: true, imbalancePosPrice: true, imbalanceNegPrice: true, gipPrice: true },
}))
  market.set(m.timestamp.getTime(), { ptf: m.ptf, smf: m.smf, dir: m.systemDirection, pos: m.imbalancePosPrice, neg: m.imbalanceNegPrice, gip: m.gipPrice });

// --- Bağımsız formüller ---------------------------------------------------------------------------------------------
function prices(t: number, mk: { ptf: number; smf: number; pos: number | null; neg: number | null }) {
  if (new Date(t).getUTCFullYear() >= 2026) {
    if (mk.pos === null || mk.neg === null) return null; // resmi fiyat yayımlanmamış: karşılaştırılmaz
    return { pos: mk.pos, neg: mk.neg };
  }
  return { pos: Math.min(mk.ptf, mk.smf) * 0.97, neg: Math.max(mk.ptf, mk.smf) * 1.03 };
}
const imbalanceCost = (d: number, ptf: number, p: { pos: number; neg: number }) => (d > 0 ? d * (ptf - p.pos) : d < 0 ? -d * (p.neg - ptf) : 0);
function kupst(t: number, type: string, uevm: number, kup: number, ptf: number, smf: number) {
  const y = new Date(t).getUTCFullYear();
  const tol = y >= 2026 ? { RES: 0.15, GES: 0.08 } : y >= 2025 ? { RES: 0.17, GES: 0.1 } : { RES: 0.21, GES: 0.12 };
  const m = type === "RES" ? tol.RES : type === "GES" ? tol.GES : 0.05;
  const n = y >= 2026 ? 0.05 : 0.03;
  const plan = Math.max(kup, 0);
  return Math.max(0, Math.abs(uevm - kup) - m * plan) * Math.max(ptf, smf) * n;
}

// --- Motor ----------------------------------------------------------------------------------------------------------
const data = await loadProjectHourly(project.id);
if (!data) throw new Error("Proje verisi yok");
const plants = await prisma.powerPlant.findMany({ where: { projectId: project.id }, select: { id: true, epiasPlantId: true, type: true, kgupVersion: true } });
const plantInfo = new Map(plants.map((p) => [p.id, p]));

interface Row {
  plant: string;
  t: number;
  ptf: number;
  dir: string;
  planChanged: boolean;
  dev: number;
  ind: { imb: number; kupst: number; gip: number };
  eng: { imb: number; kupst: number; gip: number };
}
const rows: Row[] = [];
let skipped = 0;
for (const p of data.plants) {
  const info = plantInfo.get(p.plantId);
  if (!info?.epiasPlantId) {
    skipped += p.hourly.length;
    continue;
  }
  for (const h of p.hourly) {
    const t = new Date(h.timestamp).getTime();
    const raw = rawHour(info.epiasPlantId, t);
    const mk = market.get(t);
    const plan = info.kgupVersion === "FINAL" ? raw?.final : raw?.first;
    if (!raw || !mk || plan === null || plan === undefined || raw.uevm === null || raw.uevm === undefined) {
      skipped++;
      continue;
    }
    const pr = prices(t, mk);
    if (!pr) {
      skipped++;
      continue;
    }
    const kup = raw.final ?? plan;
    const gip = raw.final === null || raw.final === undefined || mk.gip === null ? 0 : (plan - raw.final) * (mk.gip - mk.ptf);
    rows.push({
      plant: p.plantName,
      t,
      ptf: mk.ptf,
      dir: mk.dir,
      planChanged: raw.final !== null && raw.final !== undefined && Math.abs(raw.final - plan) > 1e-6,
      dev: raw.uevm - plan,
      ind: { imb: imbalanceCost(raw.uevm - plan, mk.ptf, pr), kupst: kupst(t, info.type, raw.uevm, kup, mk.ptf, mk.smf), gip },
      eng: { imb: h.imbalanceCost, kupst: kupstForHour(h, p.plantType), gip: intradayTradeCost([h]).costTl },
    });
  }
}

// --- Örneklem -------------------------------------------------------------------------------------------------------
let seed = 20261005;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (pool: Row[], n: number, taken: Set<Row>) => {
  const cand = pool.filter((r) => !taken.has(r));
  for (let i = 0; i < n && cand.length; i++) taken.add(cand.splice(Math.floor(rand() * cand.length), 1)[0]);
};
const taken = new Set<Row>();
pick(rows.filter((r) => r.ptf < 150 && Math.abs(r.dev) > 0.1), 3, taken);
pick(rows.filter((r) => r.dir === "DEFICIT" && Math.abs(r.dev) > 0.1), 5, taken);
pick(rows.filter((r) => r.planChanged), 5, taken);
pick(rows, Math.max(0, SAMPLE - taken.size), taken);
const sample = Array.from(taken).sort((a, b) => a.t - b.t);

const fmt = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toLocaleString("tr-TR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
console.log(`${project.name}: ${rows.length.toLocaleString("tr-TR")} santral-saat karşılaştırıldı (${skipped} saat ham veride ya da resmi fiyatta eksik)\n`);
console.log("Örneklem (bağımsız / motor, TL):");
let worst = 0;
for (const r of sample) {
  const diffs = (["imb", "kupst", "gip"] as const).map((k) => Math.abs(r.ind[k] - r.eng[k]));
  worst = Math.max(worst, ...diffs);
  const tag = [r.ptf < 150 ? "PTF<150" : "", r.dir === "DEFICIT" ? "açık" : r.dir === "SURPLUS" ? "fazla" : "", r.planChanged ? "plan değişti" : ""].filter(Boolean).join(", ");
  console.log(
    `  ${new Date(r.t).toISOString().slice(0, 13).replace("T", " ")} ${r.plant.slice(0, 24).padEnd(24)} sapma ${r.dev.toFixed(2).padStart(7)} MWh` +
      ` | dengesizlik ${fmt(r.ind.imb)} / ${fmt(r.eng.imb)} | KÜPST ${fmt(r.ind.kupst)} / ${fmt(r.eng.kupst)} | GİP ${fmt(r.ind.gip)} / ${fmt(r.eng.gip)}  (${tag})`
  );
}

// --- Bütün saatler --------------------------------------------------------------------------------------------------
const sum = (k: "imb" | "kupst" | "gip", side: "ind" | "eng") => rows.reduce((s, r) => s + r[side][k], 0);
let worstAll = 0;
for (const r of rows) for (const k of ["imb", "kupst", "gip"] as const) worstAll = Math.max(worstAll, Math.abs(r.ind[k] - r.eng[k]));
console.log("\nBütün saatler (bağımsız / motor):");
for (const [k, label] of [["imb", "Dengesizlik (santral bazında)"], ["kupst", "KÜPST (santral bazında)"], ["gip", "GİP işlem maliyeti"]] as const)
  console.log(`  ${label.padEnd(30)} ${fmt(sum(k, "ind") / 1e6)} M / ${fmt(sum(k, "eng") / 1e6)} M`);
console.log(`  En büyük saatlik fark: ${fmt(worstAll)} TL (örneklemde ${fmt(worst)} TL)`);

// --- 2025: formül = resmi fiyat --------------------------------------------------------------------------------------
let n2025 = 0;
let posErr = 0;
let negErr = 0;
for (const [t, mk] of market) {
  if (new Date(t).getUTCFullYear() !== 2025 || mk.pos === null || mk.neg === null) continue;
  n2025++;
  posErr += Math.abs(Math.min(mk.ptf, mk.smf) * 0.97 - mk.pos);
  negErr += Math.abs(Math.max(mk.ptf, mk.smf) * 1.03 - mk.neg);
}
if (n2025)
  console.log(`\n2025 (${n2025.toLocaleString("tr-TR")} saat): formül ile EPİAŞ resmi fiyatı arasındaki ortalama fark pozitif ${fmt(posErr / n2025)} TL/MWh, negatif ${fmt(negErr / n2025)} TL/MWh`);

const ok = worstAll <= TOL_TL;
console.log(`\n${ok ? "TAMAM" : "FARK VAR"}: saatlik fark sınırı ${TOL_TL} TL.`);
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
