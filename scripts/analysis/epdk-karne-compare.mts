/**
 * EPDK lisans listesi ile sektör karnesini karşılaştırır (Bekleyen işler: EPDK ↔ karne; güneş 15.10.2026).
 * Dosya scripts/tools/epdk-licenses-extract.py ile hazırlanır (kullanıcının EPDK dışa aktarımı).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/epdk-karne-compare.mts <GES|RES|HES> [epdk.json] [karne yılı=2026] [--json]
 * `--json`: eksik santraller ve nedenleri .cache/epdk/<tür>-karne-gaps.json
 * `--epias` (VPN): taranmamış santraller EPİAŞ'ın UEVM santral listesinde (`injection-quantity-powerplant-list`) ve gerçek
 * zamanlı üretim santral listesinde (`powerplant-list`) aranır; listeler .cache/epias/plant-lists.json'a yazılır.
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
import { compactPlantName as compact, samePlantName as same } from "@/lib/epias-plant/plant-name-match";
import { DEVIATION_MAX_PCT, PLAN_RATIO_RANGE } from "@/lib/sector/benchmark";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const tech = (args[0] ?? "GES").toUpperCase();
const file = args[1] ?? path.join(".cache", "epdk", tech === "GES" ? "solar-licenses.json" : `${tech.toLowerCase()}-licenses.json`);
const year = Number(args[2] ?? 2026);

type Lic = { licenseNo: string; plant: string; status: string; opMwe: string; mwe: string; il: string; start: string };
const epdk = JSON.parse(fs.readFileSync(file, "utf8")) as { exportedAt: string; licenses: Lic[] };
const karne = (JSON.parse(fs.readFileSync(path.join(".cache", "epias", `sector-${year}.json`), "utf8")).plants as Array<{ epiasPlantId: number; name: string; type: string }>).filter(
  (p) => p.type === tech
);


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
if (process.argv.includes("--epias")) {
  const cacheFile = path.join(".cache", "epias", "plant-lists.json");
  const { listUevmPowerPlants } = await import("@/lib/services/epias-plants");
  const { epiasRequest } = await import("@/lib/services/epias-service");
  const uevm = await listUevmPowerPlants(true);
  const rt = ((await epiasRequest<{ items?: Array<{ id: number; name: string; eic?: string }> }>("/generation/data/powerplant-list")).items ?? []).map((p) => ({
    id: Number(p.id),
    name: String(p.name).trim(),
    eic: p.eic ?? null,
  }));
  fs.writeFileSync(cacheFile, JSON.stringify({ fetchedAt: new Date().toISOString(), uevm, realtime: rt }));
  const unscanned = classified.filter((c) => !c.m);
  console.log(`\nEPİAŞ listeleri: UEVM ${uevm.length} santral, gerçek zamanlı ${rt.length}. Taranmamış ${unscanned.length} santral:`);
  for (const c of unscanned) {
    // Her iki listede de adın sonunda EIC eki var ("OYMAPINAR-40W0000000003394"): atılır. Aynı ad başka türde olabilir
    // (Iğdır DGES / Iğdır Biyokütle): adında başka teknoloji eki olan santral alınmaz.
    const bare = (n: string) => n.replace(/\s*-?\s*40W[0-9A-Z]{12,13}\s*$/, "").trim();
    const OTHER: Record<string, RegExp> = { GES: /\b(RES|HES|BİYOKÜTLE|BIYOKUTLE|JES|TES|DGKÇS|BİYOGAZ)\b/i, RES: /\b(GES|HES|BİYOKÜTLE|JES|TES)\b/i, HES: /\b(GES|RES|BİYOKÜTLE|JES|TES)\b/i };
    const fits = (n: string) => !OTHER[tech]?.test(n);
    const u = uevm.filter((p) => fits(bare(p.name)) && same(c.l.plant, bare(p.name)));
    const r = rt.filter((p) => fits(bare(p.name)) && same(c.l.plant, bare(p.name)));
    (c as any).epias = { uevm: u.map((p) => ({ id: p.id, name: p.name })), realtime: r.map((p) => ({ id: p.id, name: p.name })) };
    const inScan = u.filter((p) => scanned.some((x) => x.epiasPlantId === p.id));
    (c as any).verdict = u.length ? (inScan.length ? "taranmış (farklı türde ya da adla)" : "EPİAŞ UEVM listesinde var, taranmamış (tür addan çıkarılamadı)") : r.length ? "yalnız gerçek zamanlı listede" : "EPİAŞ listelerinde yok";
    console.log(`  ${c.l.plant} [${c.l.il}, ${c.l.opMwe} MWe] → ${(c as any).verdict}: ${u.length ? u.map((p) => `#${p.id} ${bare(p.name)}`).join(" | ") : r.map((p) => bare(p.name)).join(" | ") || "–"}`);
  }
}

if (process.argv.includes("--json")) {
  const out = path.join(".cache", "epdk", `${tech.toLowerCase()}-karne-gaps.json`);
  fs.writeFileSync(out, JSON.stringify({ tech, year, exportedAt: epdk.exportedAt, operating: operating.length, inKarne: inKarne.length, missing: classified.map((c) => ({ plant: c.l.plant, il: c.l.il, opMwe: c.l.opMwe, licenseNo: c.l.licenseNo, epiasPlantId: c.m?.epiasPlantId ?? null, why: c.why, epias: (c as any).epias ?? null, verdict: (c as any).verdict ?? null })) }, null, 1));
  console.log(`\n→ ${out}`);
}

if (karneNoEpdk.length) {
  console.log(`\nKarnede olup EPDK listesinde adı bulunmayan lisanslı santraller:`);
  for (const p of karneNoEpdk) console.log(`  #${p.epiasPlantId} ${p.name}`);
}
