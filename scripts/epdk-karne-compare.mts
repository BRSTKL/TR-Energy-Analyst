/**
 * EPDK lisans listesi ile sektör karnesini karşılaştırır (Bekleyen işler: EPDK ↔ karne; güneş 15.10.2026).
 * Dosya scripts/tools/epdk-licenses-extract.py ile hazırlanır (kullanıcının EPDK dışa aktarımı).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/epdk-karne-compare.mts <GES|RES|HES> [epdk.json] [karne yılı=2026] [--json]
 * `--json`: eksik santraller ve nedenleri .cache/epdk/<tür>-karne-gaps.json
 *
 * Gruplar: geçersiz lisans (sonlandırılmış / iptal), yürürlükte ama işletmede değil (proje / inşaat), işletmede ve karnede,
 * işletmede ama karnede yok (devreye giriş tarihiyle; kalite süzgeci ya da karne tarihi), karnede olup EPDK'da adı
 * bulunmayan lisanslı santral. Lisanssız toplamlar (K3_, LÜM_, LÜY) EPDK üretim lisansı değildir, ayrı sayılır.
 * Eşleştirme adla: ayırt edici kelimeler ve numara (lib/epias-plant/location-match.ts), boşluk / tire atılmış ad ya da
 * yazım farkı (sıkıştırılmış adlarda benzerlik ≥ %85; "Çiğiltepe" / "Çiğlitepe"), baş eşleşmesi ("Tepe" / "Teperes") ya da
 * önüne yer adı eklenmiş ad ("Taşova- Yenidereköy"); Roma rakamı, kısaltma ve bitişik yazım normalleştirilir.
 *
 * Karnede olmayan işletmedeki santral için NEDEN (sektör taramasının santral dosyaları `.cache/epias/sector-<yıl>/`):
 * taranmış ama kalite süzgecine takılmış (lib/sector/benchmark.ts `passesQuality`: veri < %90, üretim yok, plan / gerçekleşen
 * oranı 0,5–2 dışında, sapma > %60) ya da hiç taranmamış (EPİAŞ santral listesinde yok, adı çok farklı ya da türü
 * addan başka tahmin edilmiş).
 */

import fs from "node:fs";
import path from "node:path";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { foldName, nameTokens, plantNumbers } from "@/lib/epias-plant/location-match";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const tech = (args[0] ?? "GES").toUpperCase();
const file = args[1] ?? path.join(".cache", "epdk", tech === "GES" ? "solar-licenses.json" : `${tech.toLowerCase()}-licenses.json`);
const year = Number(args[2] ?? 2026);

type Lic = { licenseNo: string; plant: string; status: string; opMwe: string; mwe: string; il: string; start: string };
const epdk = JSON.parse(fs.readFileSync(file, "utf8")) as { exportedAt: string; licenses: Lic[] };
const karne = (JSON.parse(fs.readFileSync(path.join(".cache", "epias", `sector-${year}.json`), "utf8")).plants as Array<{ epiasPlantId: number; name: string; type: string }>).filter(
  (p) => p.type === tech
);

import { DEVIATION_MAX_PCT, PLAN_RATIO_RANGE } from "@/lib/sector/benchmark";

/** Levenshtein benzerliği (0–1) */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

/**
 * Ad normalleştirme: Roma rakamı → sayı (I, II, III, IV, V; yalnız tek başına kelime), kısaltma ve bitişik yazım
 * ("PRJ" / "PROJESİ", "REGÜLATÖRLERİ" / "REG.", "VEHES" = "ve HES"), genel kelimeler atılır.
 */
const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5" };
const normalize = (s: string) =>
  foldName(s)
    .split(" ")
    .map((t) => ROMAN[t] ?? t)
    .join(" ");
const SUFFIX =
  /\b(ges|dges|res|hes|vehes|depolamali|santrali|santral|regulatoru|regulatorleri|regulatorler|reg|rg|regleri|leri|ruzgar|elektrik|hidroelektrik|baraji|brj|ve|gunes|enerji|prj|proje|projesi|projeleri)\b/g;
const compact = (s: string) => normalize(s).replace(SUFFIX, "").replace(/[^a-z0-9]/g, "");
function same(a: string, b: string): boolean {
  const ca = compact(a);
  const cb = compact(b);
  if (ca && ca === cb) return true;
  // Numaralar aynı ya da biri ötekinin içinde (birleşik santral: "Telli I-II" ⊇ "Telli-I"; "Viranşehir 5-7-8" ⊇ 7)
  const na = plantNumbers(normalize(a));
  const nb = plantNumbers(normalize(b));
  // Bir tarafta numara yoksa engel değil (önceki kural); ikisinde de varsa aynı ya da biri ötekinin içinde
  const sameNums = !na.length || !nb.length || na.join() === nb.join() || na.every((n) => nb.includes(n)) || nb.every((n) => na.includes(n));
  if (ca.length >= 6 && cb.length >= 6 && similarity(ca, cb) >= 0.85 && sameNums) return true;
  // Biri ötekinin başı ("tepe" / "teperes"): kısa ad en az 4 harf, numaralar aynı
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  if (short.length >= 4 && long.startsWith(short) && long.length - short.length <= 4 && sameNums) return true;
  // Kelime kümesi: kısa adın (en az 2 ayırt edici kelime) bütün kelimeleri uzun adda ("Araklı Karadere Prj Erikli-Akocak
  // Rg ve Akocak HES" / "Araklı Karadere Projesi Erikli-Akocak Reg.leri ve HES")
  const words = (x: string) => new Set(normalize(x).replace(SUFFIX, " ").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w)));
  const [wa, wb] = [words(a), words(b)];
  const [ws, wl] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (ws.size >= 2 && [...ws].every((w) => wl.has(w)) && sameNums) return true;
  // Önüne yer adı eklenmiş ("Taşova- Yenidereköy" / "Yenidereköy"): kısa ad en az 8 harf, ek en çok 8 harf
  if (short.length >= 8 && long.endsWith(short) && long.length - short.length <= 8 && sameNums) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const common = [...ta].filter((x) => tb.has(x));
  if (!common.length) return false;
  if (!sameNums) return false;
  return common.length === Math.min(ta.size, tb.size);
}

const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const invalid = epdk.licenses.filter((l) => l.status !== "Yürürlükte");
const active = epdk.licenses.filter((l) => l.status === "Yürürlükte");
const notOperating = active.filter((l) => num(l.opMwe) <= 0);
const operating = active.filter((l) => num(l.opMwe) > 0);
const licensedKarne = karne.filter((p) => !isUnlicensedName(p.name));
const unlicensedKarne = karne.filter((p) => isUnlicensedName(p.name));
const inKarne = operating.filter((l) => licensedKarne.some((p) => same(l.plant, p.name)));
const notInKarne = operating.filter((l) => !inKarne.includes(l));
const karneNoEpdk = licensedKarne.filter((p) => !epdk.licenses.some((l) => same(l.plant, p.name)));
const dupNames = Object.values(epdk.licenses.reduce((m: Record<string, number>, l) => ((m[compact(l.plant)] = (m[compact(l.plant)] ?? 0) + 1), m), {})).filter((c) => c > 1).length;

console.log(`EPDK ${tech} lisansları (${epdk.exportedAt}): ${epdk.licenses.length}`);
console.log(`  geçersiz (sonlandırılmış / iptal): ${invalid.length}  (aynı tesis adı birden çok satırda: ${dupNames} tesis)`);
console.log(`  yürürlükte, işletmede değil (proje / inşaat): ${notOperating.length}`);
console.log(`  yürürlükte ve işletmede: ${operating.length} → karnede ${inKarne.length}, karnede yok ${notInKarne.length}`);
console.log(`Karne ${year} ${tech}: ${karne.length} = lisanslı ${licensedKarne.length} + lisanssız toplam ${unlicensedKarne.length}`);
console.log(`  karnedeki lisanslıdan EPDK listesinde adı bulunmayan: ${karneNoEpdk.length}`);
// Neden: taranmış santral dosyaları (bütün türler; tür addan tahmin edildiği için)
type Metrics = { epiasPlantId: number; name: string; type: string; hours: number; actualMwh: number; biasPct: number; deviationPct: number };
const dir = path.join(".cache", "epias", `sector-${year}`);
const scanned: Metrics[] = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) : [];
const expectedHours = Math.max(0, ...scanned.map((m) => m.hours));
function reason(m: Metrics): string {
  const out: string[] = [];
  if (m.hours < expectedHours * 0.9) out.push(`veri %${Math.round((m.hours / expectedHours) * 100)} (< %90)`);
  if (m.actualMwh <= 0) out.push("üretim yok");
  const ratio = 1 + m.biasPct / 100;
  if (ratio < PLAN_RATIO_RANGE.min || ratio > PLAN_RATIO_RANGE.max) out.push(`plan / gerçekleşen ${ratio.toFixed(2)}`);
  if (m.deviationPct > DEVIATION_MAX_PCT) out.push(`sapma %${Math.round(m.deviationPct)} (> %${DEVIATION_MAX_PCT})`);
  return out.join(", ") || "süzgeç nedeni bulunamadı";
}
const classified = notInKarne.map((l) => {
  // Yalnız aynı teknolojiyle (tür addan tahmin edildiği için farklı türdeki ad benzerliği başka santraldir)
  const m = scanned.find((x) => x.type === tech && same(l.plant, x.name));
  return { l, m, why: m ? `taranmış, elenmiş: ${reason(m)}` : "taranmamış (EPİAŞ santral taramasında aynı türde adı bulunamadı)" };
});
const groups = new Map<string, number>();
for (const c of classified) {
  const k = !c.m ? "taranmamış" : c.why.includes("veri %") ? "veri < %90" : c.why.includes("sapma") ? "sapma > %60" : c.why.includes("plan /") ? "plan oranı" : c.why.includes("üretim yok") ? "üretim yok" : "diğer";
  groups.set(k, (groups.get(k) ?? 0) + 1);
}
if (classified.length) {
  console.log(`\nKarnede olmayan ${classified.length} işletmedeki santralin nedeni: ${[...groups].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  for (const c of classified) console.log(`  ${c.l.plant} [${c.l.il}, ${c.l.opMwe} MWe] → ${c.why}${c.m ? ` (#${c.m.epiasPlantId} ${c.m.name})` : ""}`);
}
if (process.argv.includes("--json")) {
  const out = path.join(".cache", "epdk", `${tech.toLowerCase()}-karne-gaps.json`);
  fs.writeFileSync(out, JSON.stringify({ tech, year, exportedAt: epdk.exportedAt, operating: operating.length, inKarne: inKarne.length, missing: classified.map((c) => ({ plant: c.l.plant, il: c.l.il, opMwe: c.l.opMwe, licenseNo: c.l.licenseNo, epiasPlantId: c.m?.epiasPlantId ?? null, why: c.why })) }, null, 1));
  console.log(`\n→ ${out}`);
}

if (karneNoEpdk.length) {
  console.log(`\nKarnede olup EPDK listesinde adı bulunmayan lisanslı santraller:`);
  for (const p of karneNoEpdk) console.log(`  #${p.epiasPlantId} ${p.name}`);
}
