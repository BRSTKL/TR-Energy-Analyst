/**
 * Bağımsız doğrulama (PLAN 16, kabul): bir adayın tek başına birim maliyeti ve adil primi, hesap motoru
 * (lib/calculations/engine.ts) ve aday taraması (lib/analysis/candidate-screening.ts) kullanılmadan ham veriden yeniden
 * hesaplanır ve /api/projects/[id]/candidates yanıtıyla karşılaştırılır.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify/verify-contract-price.mts <projeId> <epiasPlantId> [api-yanıtı.json]
 *
 * api-yanıtı.json verilmezse yanıt http://localhost:3000 adresinden alınır (access=independent, top=10).
 *
 * Ham veri (scripts/verify/verify-independent.mts ile aynı yaklaşım):
 * - Portföy: havuz dosyaları (data/pool/<id>/<yıl>.json.gz, zlib ile doğrudan), santralin plan sürümü (ilk / son KGÜP).
 * - Aday: sektör karnesinin saatlik serisi (.cache/epias/sector-<yıl>-hourly/<id>.json.gz, zlib ile doğrudan).
 * - Fiyat: MarketData (PTF, SMF, sistem yönü, EPİAŞ resmi dengesizlik fiyatları).
 * Motordan yalnızca hangi saatlerin projede olduğu alınır (loadProjectHourly'nin saatleri).
 *
 * Formüller bu dosyada, mevzuattan:
 * - Saatin dengesizlik fiyatı: resmi fiyat varsa o; yoksa 2026 kuralı: taban MIN(PTF,SMF) (< 150 ise −100) × (1 − l),
 *   MAX(PTF,SMF, 150) × (1 + k); sapma sistemle aynı yöndeyse k = l = 0,06, değilse 0,03. 2026 öncesi MIN/MAX × 0,97 / 1,03.
 * - Maliyet c(d) = d > 0 ise d × (PTF − pozitif), d < 0 ise |d| × (negatif − PTF).
 * - Tek başına = Σ c(aday); kazanç = Σ [c(portföy) + c(aday) − c(portföy + aday)].
 * - Pay: üye (toplayıcıda sahip şirket, tek şirketli projede santral, birden çok şirkette şirket) sayısı + 1 ≤ 8 ise kesin Shapley, değilse iki
 *   oyunculu bölüşüm (tek başına − kazanç / 2).
 * - KÜPST (EPDK 14029): max(0, |UEVM − KGÜP| − tolerans × KGÜP) × max(PTF, SMF) × 0,05 (RES 0,15, GES 0,08, diğer 0,05).
 * - Tavan = (tek başına + KÜPST) / üretim, taban (adil prim) = (pay + KÜPST) / üretim, öneri = taban + %50 × (tavan − taban).
 * Fark 0,1 TL/MWh'ı aşarsa çıkış kodu 1.
 */

import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import { loadProjectHourly } from "@/lib/services/project-hourly";

const [projectId, plantArg, apiFile] = process.argv.slice(2);
if (!projectId || !plantArg) throw new Error("Kullanım: verify-contract-price.mts <projeId> <epiasPlantId> [api-yanıtı.json]");
const candidateId = Number(plantArg);
const TOL = 0.1;
const MAX_EXACT = 8;
const SHARE = 0.5;
const HOUR = 3_600_000;

// --- Ham veri -------------------------------------------------------------------------------------------------------
type Pool = { kgupFirst: (number | null)[]; kgupFinal: (number | null)[]; uevm: (number | null)[] } | null;
const poolCache = new Map<string, Pool>();
function rawHour(epiasId: number, t: number) {
  const year = new Date(t).getUTCFullYear();
  const key = `${epiasId}/${year}`;
  if (!poolCache.has(key)) {
    const file = path.join(process.env.POOL_DIR || path.join(process.cwd(), "data", "pool"), String(epiasId), `${year}.json.gz`);
    poolCache.set(key, fs.existsSync(file) ? JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8")) : null);
  }
  const doc = poolCache.get(key);
  if (!doc) return null;
  const i = (t - Date.UTC(year, 0, 1)) / HOUR;
  return { first: doc.kgupFirst[i], final: doc.kgupFinal[i], uevm: doc.uevm[i] };
}

const market = new Map<number, { ptf: number; smf: number; dir: string; pos: number | null; neg: number | null }>();
for (const m of await prisma.marketData.findMany({
  select: { timestamp: true, ptf: true, smf: true, systemDirection: true, imbalancePosPrice: true, imbalanceNegPrice: true },
}))
  market.set(m.timestamp.getTime(), { ptf: m.ptf, smf: m.smf, dir: m.systemDirection, pos: m.imbalancePosPrice, neg: m.imbalanceNegPrice });

// --- Bağımsız formüller ---------------------------------------------------------------------------------------------
function cost(d: number, t: number): number {
  if (d === 0) return 0;
  const mk = market.get(t)!;
  let pos: number;
  let neg: number;
  if (new Date(t).getUTCFullYear() >= 2026) {
    const low = Math.min(mk.ptf, mk.smf);
    pos = mk.pos ?? (low < 150 ? -100 : low) * (mk.dir === "SURPLUS" ? 0.94 : 0.97);
    neg = mk.neg ?? Math.max(150, mk.ptf, mk.smf) * (mk.dir === "DEFICIT" ? 1.06 : 1.03);
  } else {
    pos = mk.pos ?? Math.min(mk.ptf, mk.smf) * 0.97;
    neg = mk.neg ?? Math.max(mk.ptf, mk.smf) * 1.03;
  }
  return d > 0 ? d * (mk.ptf - pos) : -d * (neg - mk.ptf);
}
function kupst(t: number, type: string, uevm: number, kup: number): number {
  const mk = market.get(t)!;
  const y = new Date(t).getUTCFullYear();
  const tol = y >= 2026 ? { RES: 0.15, GES: 0.08 } : y >= 2025 ? { RES: 0.17, GES: 0.1 } : { RES: 0.21, GES: 0.12 };
  const m = type === "RES" ? tol.RES : type === "GES" ? tol.GES : 0.05;
  const n = y >= 2026 ? 0.05 : 0.03;
  return Math.max(0, Math.abs(uevm - kup) - m * Math.max(kup, 0)) * Math.max(mk.ptf, mk.smf) * n;
}

// --- Portföy: üyeler (toplayıcıda sahip şirket) ve saatlik net sapma ---------------------------------------------------
const project = await prisma.project.findUnique({
  where: { id: projectId },
  select: { name: true, aggregatorName: true, pricingProfiles: { select: { mode: true } } },
});
if (!project) throw new Error("Proje bulunamadı");
const profileMode = project.pricingProfiles[0]?.mode ?? "REGULATORY";
if (profileMode !== "REGULATORY") throw new Error(`Profil ${profileMode}: bu betik yalnız mevzuat profilini yeniden hesaplar`);
const plants = await prisma.powerPlant.findMany({
  where: { projectId },
  select: { id: true, epiasPlantId: true, kgupVersion: true, organizationId: true },
});
const plantInfo = new Map(plants.map((p) => [p.id, p]));
const data = await loadProjectHourly(projectId);
if (!data) throw new Error("Proje verisi yok");

const pDelta = new Map<number, number>(); // saat → portföyün net sapması
const ownerDelta = new Map<string, Map<number, number>>(); // üye → saat → net sapma
let missing = 0;
// Üyeler: toplayıcıda sahip şirketler, tek şirketli projede santraller, birden çok şirkette şirketler
const withData = data.plants.filter((p) => p.hourly.length > 0).map((p) => plantInfo.get(p.plantId)!);
const byPlant = !project.aggregatorName && new Set(withData.map((p) => (p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.id}`))).size === 1;
for (const p of data.plants) {
  if (p.hourly.length === 0) continue;
  const info = plantInfo.get(p.plantId)!;
  if (!info.epiasPlantId) throw new Error(`${p.plantName}: EPİAŞ kimliği yok`);
  const owner = !byPlant && info.organizationId !== null ? `org:${info.organizationId}` : `plant:${info.id}`;
  const od = ownerDelta.get(owner) ?? new Map<number, number>();
  ownerDelta.set(owner, od);
  for (const h of p.hourly) {
    const t = new Date(h.timestamp).getTime();
    const raw = rawHour(info.epiasPlantId, t);
    const plan = info.kgupVersion === "FINAL" ? raw?.final : raw?.first;
    if (!raw || plan === null || plan === undefined || raw.uevm === null || raw.uevm === undefined || !market.has(t)) {
      missing++;
      continue;
    }
    pDelta.set(t, (pDelta.get(t) ?? 0) + raw.uevm - plan);
    od.set(t, (od.get(t) ?? 0) + raw.uevm - plan);
  }
}
if (missing) throw new Error(`${missing} portföy saati ham veride ya da fiyatta eksik`);
const n = ownerDelta.size;
const exact = n + 1 <= MAX_EXACT;

// --- Aday -----------------------------------------------------------------------------------------------------------
const year = new Date(Math.min(...pDelta.keys())).getUTCFullYear();
const series = JSON.parse(
  gunzipSync(fs.readFileSync(path.join(process.cwd(), ".cache", "epias", `sector-${year}-hourly`, `${candidateId}.json.gz`))).toString("utf8")
) as { start: string; forecast: (number | null)[]; actual: (number | null)[] };
const bench = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "epias", `sector-${year}.json`), "utf8"));
const cand = (bench.plants as Array<{ epiasPlantId: number; name: string; type: string }>).find((p) => p.epiasPlantId === candidateId);
if (!cand) throw new Error(`${candidateId} sektör karnesinde yok`);

let hours = 0;
let actual = 0;
let standalone = 0;
let gain = 0;
let kupstTl = 0;
const own = new Map<number, number>(); // saat → adayın sapması
const t0 = Date.parse(series.start);
for (let i = 0; i < series.forecast.length; i++) {
  const f = series.forecast[i];
  const a = series.actual[i];
  const t = t0 + i * HOUR;
  if (f === null || a === null || !pDelta.has(t)) continue;
  hours++;
  actual += a;
  const d = a - f;
  own.set(t, d);
  const pd = pDelta.get(t)!;
  const c = cost(d, t);
  standalone += c;
  gain += cost(pd, t) + c - cost(pd + d, t);
  kupstTl += kupst(t, cand.type, a, f);
}
// Shapley: aday, üyelerin her S alt grubuna katılımındaki marjinal maliyetini |S|!(n−|S|)!/(n+1)! ağırlığıyla öder
let allocated = standalone - gain / 2;
if (exact) {
  const fact = (x: number): number => (x <= 1 ? 1 : x * fact(x - 1));
  const members = Array.from(ownerDelta.values());
  allocated = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    const sub = members.filter((_, i) => mask & (1 << i));
    let marginal = 0;
    for (const t of pDelta.keys()) {
      const sd = sub.reduce((s, m) => s + (m.get(t) ?? 0), 0);
      marginal += cost(sd + (own.get(t) ?? 0), t) - cost(sd, t);
    }
    allocated += ((fact(sub.length) * fact(n - sub.length)) / fact(n + 1)) * marginal;
  }
}
const ceiling = (standalone + kupstTl) / actual;
const floor = (allocated + kupstTl) / actual;
const offer = floor + SHARE * (ceiling - floor);

// --- Uygulamanın yanıtı ---------------------------------------------------------------------------------------------
const api = apiFile
  ? JSON.parse(fs.readFileSync(apiFile, "utf8"))
  : await (await fetch(`http://localhost:3000/api/projects/${projectId}/candidates?access=independent&top=10`)).json();
const appC = (api.result.candidates as any[]).find((c) => c.epiasPlantId === candidateId);
if (!appC?.fair) throw new Error(`${candidateId} yanıtın ilk N adayında değil`);
const appOffer = appC.fair.fairUnitTl + SHARE * (appC.fair.standaloneUnitTl - appC.fair.fairUnitTl);

const f2 = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fM = f2;
console.log(`${project.name} · aday ${cand.name} (${cand.type}, ${candidateId})`);
console.log(`Portföy: ${n} üye (${project.aggregatorName ? "sahip şirket" : byPlant ? "santral" : "şirket"}), ${pDelta.size} saat → ${exact ? "kesin Shapley" : "iki oyunculu bölüşüm"} (uygulama: ${appC.fair.method}, ${api.result.portfolio.members} üye, ${api.result.portfolio.hours} saat)\n`);
const rows: Array<[string, number, number, (v: number) => string]> = [
  ["Saat", hours, appC.hours, String],
  ["Üretim (MWh)", actual, appC.actualMwh, f2],
  ["Tek başına dengesizlik (TL)", standalone, appC.standaloneCostTl, fM],
  ["Netleşme kazancı (TL)", gain, appC.gainTl, fM],
  ["Pay (TL)", allocated, appC.fair.allocatedCostTl, fM],
  ["KÜPST (TL)", kupstTl, appC.fair.kupstTl, fM],
];
const units: Array<[string, number, number]> = [
  ["Tavan: tek başına birim maliyet", ceiling, appC.fair.standaloneUnitTl],
  ["Taban: adil prim", floor, appC.fair.fairUnitTl],
  ["Öneri (%50)", offer, appOffer],
];
console.log("                                   bağımsız          uygulama          fark");
for (const [label, a, b, fmt] of rows) console.log(`  ${label.padEnd(32)} ${fmt(a).padStart(16)}  ${fmt(b).padStart(16)}  ${fmt(a - b).padStart(12)}`);
let worst = 0;
for (const [label, a, b] of units) {
  worst = Math.max(worst, Math.abs(a - b));
  console.log(`  ${(label + " (TL/MWh)").padEnd(32)} ${a.toFixed(4).padStart(16)}  ${b.toFixed(4).padStart(16)}  ${(a - b).toFixed(4).padStart(12)}`);
}
const ok = worst < TOL && hours === appC.hours;
console.log(`\n${ok ? "TAMAM" : "FARK VAR"}: en büyük birim fark ${worst.toFixed(4)} TL/MWh (sınır ${TOL}).`);
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
