/**
 * EPDK lisans listesi ile sektör karnesini karşılaştırır (Bekleyen işler: EPDK ↔ karne; güneş 15.10.2026).
 * Dosya scripts/tools/epdk-licenses-extract.py ile hazırlanır (kullanıcının EPDK dışa aktarımı).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/epdk-karne-compare.mts <GES|RES|HES> [epdk.json] [karne yılı=2026]
 *
 * Gruplar: geçersiz lisans (sonlandırılmış / iptal), yürürlükte ama işletmede değil (proje / inşaat), işletmede ve karnede,
 * işletmede ama karnede yok (devreye giriş tarihiyle; kalite süzgeci ya da karne tarihi), karnede olup EPDK'da adı
 * bulunmayan lisanslı santral. Lisanssız toplamlar (K3_, LÜM_, LÜY) EPDK üretim lisansı değildir, ayrı sayılır.
 * Eşleştirme adla: ayırt edici kelimeler ve numara (lib/epias-plant/location-match.ts) ya da boşluk / tire atılmış ad.
 */

import fs from "node:fs";
import path from "node:path";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { foldName, nameTokens, plantNumbers } from "@/lib/epias-plant/location-match";

const tech = (process.argv[2] ?? "GES").toUpperCase();
const file = process.argv[3] ?? path.join(".cache", "epdk", tech === "GES" ? "solar-licenses.json" : `${tech.toLowerCase()}-licenses.json`);
const year = Number(process.argv[4] ?? 2026);

type Lic = { licenseNo: string; plant: string; status: string; opMwe: string; mwe: string; il: string; start: string };
const epdk = JSON.parse(fs.readFileSync(file, "utf8")) as { exportedAt: string; licenses: Lic[] };
const karne = (JSON.parse(fs.readFileSync(path.join(".cache", "epias", `sector-${year}.json`), "utf8")).plants as Array<{ epiasPlantId: number; name: string; type: string }>).filter(
  (p) => p.type === tech
);

const SUFFIX = /\b(ges|dges|res|hes|depolamali|santrali|regulatoru|reg)\b/g;
const compact = (s: string) => foldName(s).replace(SUFFIX, "").replace(/[^a-z0-9]/g, "");
function same(a: string, b: string): boolean {
  if (compact(a) && compact(a) === compact(b)) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const common = [...ta].filter((x) => tb.has(x));
  if (!common.length) return false;
  const na = plantNumbers(a);
  const nb = plantNumbers(b);
  if (na.length && nb.length && na.join() !== nb.join()) return false;
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
if (notInKarne.length) {
  console.log(`\nİşletmede ama karnede yok (lisans başlangıcına göre):`);
  for (const l of [...notInKarne].sort((a, b) => a.start.split(".").reverse().join().localeCompare(b.start.split(".").reverse().join())))
    console.log(`  ${l.plant} [${l.il}, işletmede ${l.opMwe} MWe, lisans ${l.start}]`);
}
if (karneNoEpdk.length) {
  console.log(`\nKarnede olup EPDK listesinde adı bulunmayan lisanslı santraller:`);
  for (const p of karneNoEpdk) console.log(`  #${p.epiasPlantId} ${p.name}`);
}
