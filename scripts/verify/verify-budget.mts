/**
 * Bağımsız doğrulama (PLAN 17, kabul): gelecek yıl bütçesinin bir ayının beklenen maliyeti, bütçe hesabı
 * (lib/analysis/imbalance-budget.ts) ve hesap motoru (lib/calculations/engine.ts) kullanılmadan ham veriden yeniden
 * hesaplanır ve /api/projects/[id]/budget?intraday=0 yanıtıyla karşılaştırılır (varsayılan senaryo: makas 2026 düzeyinde,
 * 2026 kuralı, normal yıl; gün içi düzeltme kapalı, enflasyon boş → reel TL).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify/verify-budget.mts [projeId] [ay=01] [api-yanıtı.json]
 *
 * api-yanıtı.json verilmezse yanıt http://localhost:3000 adresinden alınır. İlk (önbelleksiz) yanıt 5 dakikayı aşabilir
 * (fetch zaman aşımı); o zaman önce curl --max-time 1800 ile dosyaya alınır.
 *
 * Ham veri (scripts/verify/verify-independent.mts ile aynı yaklaşım):
 * - Santraller: PowerPlant (tür, kurulu güç, EPİAŞ kimliği, sahip şirket); havuz dosyaları (data/pool/<id>/<yıl>.json.gz,
 *   zlib ile doğrudan, pool-codec kullanılmaz). Plan: ilk KGÜP.
 * - Fiyat: MarketData (PTF, SMF, sistem yönü); resmi dengesizlik fiyatı kullanılmaz.
 * - TÜFE: lib/macro/macro-series.json (JSON olarak okunur).
 *
 * Tanımlar bu dosyada:
 * - Yıllar: 2025 tam, 2026 havuzda üretimi olan son aya kadar. Saat: santralin ilk KGÜP'ü ve UEVM'si ile o saatin
 *   piyasa verisi birlikte olan saat.
 * - Uzlaştırma birimi: toplayıcıda bütün portföy tek birim; değilse sahip şirket (yoksa santral).
 * - Saatin sapması d = Σ (UEVM − ilk KGÜP), birim başına.
 * - Makas: SMF' = PTF + s × (SMF − PTF); s = 2026 reel ortalama |SMF − PTF| / o yılın reel ortalaması (2026'da 1).
 * - Dengesizlik fiyatı 2026 kuralıyla: düşük = MIN(PTF, SMF') (< 150 ise −100), pozitif = düşük × (fazlada 0,94, değilse
 *   0,97); yüksek = MAX(PTF, SMF', 150), negatif = yüksek × (açıkta 1,06, değilse 1,03).
 *   c(d) = d > 0 ise d × (PTF − pozitif), d < 0 ise |d| × (negatif − PTF).
 * - KÜPST (EPDK 14029 md. 4, topluluk): max(0, |ΣUEVM − ΣKÜP| − m̄ × ΣKÜP) × max(PTF, SMF') × 0,05; KÜP = max(ilk KGÜP, 0),
 *   m̄ = saatte verisi olan santrallerin toleransı (RES 0,15, GES 0,08, diğer 0,05) kurulu güç ağırlıklı (2026 oranları
 *   her iki yıla). Toplayıcı değilse santral bazında max(0, |UEVM − KÜP| − m × KÜP) × max(PTF, SMF') × 0,05.
 * - Reel TL: saatin tutarı × TÜFE[son ay] / TÜFE[saatin ayı].
 * - Kalite çarpanı q: 2026'nın verisi olan aylarda, 2026 MWh başına maliyeti / 2025 MWh başına maliyeti; 2025 saatlerine.
 * - Üretim (normal yıl): santral başına iki yılın aylık üretimi (ilk KGÜP'ü olan saatlerin UEVM'si); ilk üretim ayından
 *   önceki ya da verisi olmayan ay, aynı türdeki eksiksiz santrallerin o ayı × santralin ölçeğiyle doldurulur; normal =
 *   iki yılın ortalaması (verisi tek yılda olan santral iki yıl da o yılla).
 * - Ayın beklenen maliyeti = (Σ ayın günlerinin maliyeti / Σ üretimi) × normal yıl üretimi; birim = parantez içi.
 * Bağıl fark %0,1'i aşarsa çıkış kodu 1.
 */

import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";

const args = process.argv.slice(2);
const projectId = args[0] ?? "cmuoaaz620056emo57zww4wro";
const MM = args[1] ?? "01";
const apiFile = args[2];
const TOL = 0.001;
const HOUR = 3_600_000;
const [PREV, LAST] = [2025, 2026];

// --- Ham veri -------------------------------------------------------------------------------------------------------
type Pool = { start: string; kgupFirst: (number | null)[]; uevm: (number | null)[] };
function pool(epiasId: number, year: number): Pool | null {
  const file = path.join(process.env.POOL_DIR || path.join(process.cwd(), "data", "pool"), String(epiasId), `${year}.json.gz`);
  return fs.existsSync(file) ? JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8")) : null;
}

const project = await prisma.project.findUnique({
  where: { id: projectId },
  select: { name: true, aggregatorName: true, plants: { select: { id: true, name: true, type: true, capacityMw: true, epiasPlantId: true, organizationId: true } } },
});
if (!project) throw new Error("Proje bulunamadı");
const aggregator = !!project.aggregatorName?.trim();
const plants = project.plants
  .filter((p) => p.epiasPlantId !== null)
  .map((p) => ({ ...p, unit: aggregator ? "agg" : p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.id}`, docs: { [PREV]: pool(p.epiasPlantId!, PREV), [LAST]: pool(p.epiasPlantId!, LAST) } as Record<number, Pool | null> }));

// Santralin aylık üretimi (ilk KGÜP'ü olan saatler); null: o ay saat yok
function monthly(doc: Pool | null): Array<number | null> | null {
  if (!doc) return null;
  const out: Array<number | null> = new Array(12).fill(null);
  const t0 = Date.parse(doc.start);
  doc.uevm.forEach((u, i) => {
    if (u === null || doc.kgupFirst[i] === null) return;
    const m = new Date(t0 + i * HOUR).getUTCMonth();
    out[m] = (out[m] ?? 0) + u;
  });
  return out;
}
const prod: Record<number, Map<string, Array<number | null>>> = { [PREV]: new Map(), [LAST]: new Map() };
for (const p of plants)
  for (const y of [PREV, LAST]) {
    const m = monthly(p.docs[y]);
    if (m) prod[y].set(p.id, m);
  }
// 2026'nın son ayı: herhangi bir santralin üretimi > 0 olan son ay
let lastMonth = 0;
for (const m of prod[LAST].values()) m.forEach((v, i) => v !== null && v > 0 && (lastMonth = Math.max(lastMonth, i + 1)));
if (!lastMonth) throw new Error("2026 havuz verisi yok");

const market = new Map<number, { ptf: number; smf: number; dir: string }>();
for (const m of await prisma.marketData.findMany({
  where: { timestamp: { gte: new Date(Date.UTC(PREV, 0, 1)), lt: new Date(Date.UTC(LAST, lastMonth, 1)) } },
  select: { timestamp: true, ptf: true, smf: true, systemDirection: true },
}))
  market.set(m.timestamp.getTime(), { ptf: m.ptf, smf: m.smf, dir: m.systemDirection });

const macro = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib", "macro", "macro-series.json"), "utf8")) as { cpi: Record<string, number> };
const cpiKeys = Object.keys(macro.cpi).sort();
const baseMonth = cpiKeys[cpiKeys.length - 1];
const real = (t: number) => {
  const k = new Date(t).toISOString().slice(0, 7);
  if (!(k in macro.cpi)) throw new Error(`TÜFE ${k} yok`);
  return macro.cpi[baseMonth] / macro.cpi[k];
};

// --- Saatler: birim sapmaları, KÜPST miktarı (MWh; tutar = miktar × max(PTF, SMF')), üretim -----------------------------
const TOLR: Record<string, number> = { RES: 0.15, GES: 0.08 };
const tolOf = (type: string) => TOLR[type] ?? 0.05;
type Hour = { t: number; ptf: number; smf: number; dir: string; dev: Map<string, number>; act: number; kup: number; tolCap: number; cap: number; tolSum: number; n: number; plantKupst: number };
const hours = new Map<number, Hour>();
for (const p of plants)
  for (const y of [PREV, LAST]) {
    const doc = p.docs[y];
    if (!doc) continue;
    const t0 = Date.parse(doc.start);
    for (let i = 0; i < doc.uevm.length; i++) {
      const t = t0 + i * HOUR;
      const mk = market.get(t);
      const a = doc.uevm[i];
      const f = doc.kgupFirst[i];
      if (!mk || a === null || f === null) continue;
      let h = hours.get(t);
      if (!h) hours.set(t, (h = { t, ptf: mk.ptf, smf: mk.smf, dir: mk.dir, dev: new Map(), act: 0, kup: 0, tolCap: 0, cap: 0, tolSum: 0, n: 0, plantKupst: 0 }));
      h.dev.set(p.unit, (h.dev.get(p.unit) ?? 0) + a - f);
      h.act += a;
      h.kup += Math.max(f, 0);
      h.tolCap += tolOf(p.type) * p.capacityMw;
      h.cap += p.capacityMw;
      h.tolSum += tolOf(p.type);
      h.n++;
      h.plantKupst += Math.max(0, Math.abs(a - f) - tolOf(p.type) * Math.max(f, 0)) * 0.05;
    }
  }
const kupstQty = (h: Hour) => {
  if (Math.max(h.ptf, h.smf) <= 0) return 0;
  if (!aggregator) return h.plantKupst;
  const m = h.cap > 0 ? h.tolCap / h.cap : h.tolSum / h.n;
  return Math.max(0, Math.abs(h.act - h.kup) - m * h.kup) * 0.05;
};
const yearOf = (t: number) => new Date(t).getUTCFullYear();

// Reel ortalama makas ve ölçek
const spr: Record<number, { s: number; n: number }> = { [PREV]: { s: 0, n: 0 }, [LAST]: { s: 0, n: 0 } };
for (const h of hours.values()) {
  spr[yearOf(h.t)].s += Math.abs(h.smf - h.ptf) * real(h.t);
  spr[yearOf(h.t)].n++;
}
const realSpread = { [PREV]: spr[PREV].s / spr[PREV].n, [LAST]: spr[LAST].s / spr[LAST].n } as Record<number, number>;
const scale = (y: number) => realSpread[LAST] / realSpread[y];

function hourCostReal(h: Hour): number {
  const smf = h.ptf + scale(yearOf(h.t)) * (h.smf - h.ptf);
  const lo = Math.min(h.ptf, smf);
  const pos = (lo < 150 ? -100 : lo) * (h.dir === "SURPLUS" ? 0.94 : 0.97);
  const neg = Math.max(h.ptf, smf, 150) * (h.dir === "DEFICIT" ? 1.06 : 1.03);
  let c = 0;
  for (const d of h.dev.values()) c += d > 0 ? d * (h.ptf - pos) : d < 0 ? -d * (neg - h.ptf) : 0;
  c += kupstQty(h) * Math.max(h.ptf, smf);
  return c * real(h.t);
}

// Kalite çarpanı: 2026'nın verisi olan aylarda iki yılın MWh başına maliyeti
const lastMonths = new Set<number>();
for (const h of hours.values()) if (yearOf(h.t) === LAST) lastMonths.add(new Date(h.t).getUTCMonth());
const qa: Record<number, { c: number; w: number }> = { [PREV]: { c: 0, w: 0 }, [LAST]: { c: 0, w: 0 } };
for (const h of hours.values()) {
  if (!lastMonths.has(new Date(h.t).getUTCMonth())) continue;
  qa[yearOf(h.t)].c += hourCostReal(h);
  qa[yearOf(h.t)].w += h.act;
}
const quality = qa[LAST].c / qa[LAST].w / (qa[PREV].c / qa[PREV].w);

// Ayın günleri (her iki yıl): maliyet ve üretim
let monthCost = 0;
let monthMwh = 0;
const dayKeys = new Set<string>();
for (const h of hours.values()) {
  const key = new Date(h.t).toISOString().slice(0, 10);
  if (key.slice(5, 7) !== MM) continue;
  dayKeys.add(key);
  monthCost += hourCostReal(h) * (yearOf(h.t) === PREV ? quality : 1);
  monthMwh += h.act;
}
const unit = monthCost / monthMwh;

// --- Normal yıl üretimi -----------------------------------------------------------------------------------------------
// Yıl içindeki eksik aylar (ilk üretim ayından önce ya da verisi yok) aynı türdeki eksiksiz santrallerle doldurulur
function filled(year: number, months: number): Map<string, number[]> {
  const rows = Array.from(prod[year].entries()).map(([id, m]) => {
    const v = m.slice(0, months);
    const first = v.findIndex((x) => x !== null && x > 0);
    return { id, type: plants.find((p) => p.id === id)!.type, v, miss: v.map((x, i) => first < 0 || i < first || x === null) };
  });
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const vals = r.v.map((x) => x ?? 0);
    const anyMiss = r.miss.some(Boolean);
    const peers = rows.filter((q) => q.type === r.type && q.id !== r.id && !q.miss.some(Boolean));
    if (anyMiss && !r.miss.every(Boolean) && peers.length) {
      const peer = (i: number) => peers.reduce((s, q) => s + (q.v[i] ?? 0), 0);
      let own = 0;
      let base = 0;
      r.miss.forEach((m, i) => !m && ((own += vals[i]), (base += peer(i))));
      if (base > 0) r.miss.forEach((m, i) => m && (vals[i] = (own / base) * peer(i)));
    }
    out.set(r.id, vals);
  }
  return out;
}
const fPrev = filled(PREV, 12);
const fLast = filled(LAST, lastMonth);
const mi = Number(MM) - 1;
let normal = 0;
const tot = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
for (const p of plants) {
  const a = fPrev.get(p.id) ?? new Array(12).fill(0);
  const b = fLast.get(p.id);
  // 2026'nın eksik ayları: 2025'in o ayı × santralin ortak aylardaki 2026 / 2025 oranı
  let sa = 0;
  let sb = 0;
  if (b) b.forEach((v, i) => ((sa += a[i]), (sb += v)));
  const r = sa > 0 ? sb / sa : 1;
  const last = Array.from({ length: 12 }, (_, i) => (b && i < lastMonth ? b[i] : a[i] * r));
  const pa = tot(a) > 0 ? a : last;
  const pl = tot(last) > 0 ? last : a;
  normal += (pa[mi] + pl[mi]) / 2;
}
const expected = unit * normal;

// --- Uygulamanın yanıtı ---------------------------------------------------------------------------------------------
const api = apiFile ? JSON.parse(fs.readFileSync(apiFile, "utf8")) : await (await fetch(`http://localhost:3000/api/projects/${projectId}/budget?intraday=0`)).json();
if (!api.success) throw new Error(`API: ${api.error}`);
const am = (api.months as any[]).find((m) => m.month === MM);
if (!am) throw new Error(`API yanıtında ${MM}. ay yok`);
if (api.options.intraday || api.nominal) throw new Error("API yanıtı gün içi düzeltmeli ya da nominal");

const fmt = (v: number, d = 2) => v.toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d });
console.log(`${project.name} · ${api.year} ${MM}. ay · ${aggregator ? "toplayıcı (tek birim, topluluk KÜPST)" : "şirket bazında"} · ${api.unit.label}`);
console.log(`Santral ${plants.length} (havuzda ${plants.filter((p) => p.docs[PREV] || p.docs[LAST]).length}); ${PREV} Ocak – ${LAST}-${String(lastMonth).padStart(2, "0")}; ayın günleri ${dayKeys.size}\n`);
const rows: Array<[string, number, number, number]> = [
  [`Reel makas ${PREV} (TL/MWh)`, realSpread[PREV], api.spread.y2025, 4],
  [`Reel makas ${LAST} (TL/MWh)`, realSpread[LAST], api.spread.y2026, 4],
  ["Kalite çarpanı q", quality, api.qualityScale, 6],
  ["Normal yıl üretimi (MWh)", normal, am.mwh, 2],
  ["Birim maliyet (TL/MWh)", unit, am.unit.expected, 4],
  ["Beklenen maliyet (TL)", expected, am.expected, 2],
];
console.log("                                   bağımsız            uygulama         bağıl fark");
let worst = 0;
for (const [label, a, b, d] of rows) {
  const rel = Math.abs(a - b) / Math.abs(b);
  if (label.startsWith("Birim") || label.startsWith("Beklenen")) worst = Math.max(worst, rel);
  console.log(`  ${label.padEnd(32)} ${fmt(a, d).padStart(18)}  ${fmt(b, d).padStart(18)}  ${(rel * 100).toFixed(5).padStart(10)} %`);
}
const ok = worst < TOL;
console.log(`\n${ok ? "TAMAM" : "FARK VAR"}: en büyük bağıl fark %${(worst * 100).toFixed(5)} (sınır %${TOL * 100}).`);
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
