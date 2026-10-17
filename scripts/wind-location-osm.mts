/**
 * Konumu olmayan proje rüzgâr santralleri için OpenStreetMap türbin kümelerinden konum (kullanıcı, 17.10.2026; GEM Wind
 * Power Tracker'da olmayan, yalnız yaklaşık konumlu ya da EPDK ile uyuşmayan santraller).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-location-osm.mts [--write]
 *
 * Adaylar: `.cache/osm/wind-turbines-tr.json` (scripts/tools/osm-wind-turbines-extract.py; türbinler 1,5 km'den yakınsa
 * aynı küme) içinde, santralin EPDK rüzgâr lisansındaki (`.cache/epdk/res-licenses.json`, birebir ad) ilçe merkezine
 * 40 km'den (ilçesi "-" olan lisansta il merkezine 150 km'den) yakın kümeler; adı / işletmecisi santral adıyla eşleşen
 * küme önce, sonra yakınlık; en çok MAX_CANDIDATES.
 * Sınama: her adayın merkezinde ECMWF IFS 9 km 100 m rüzgârı (VALIDATION_FROM – VALIDATION_TO) ile santralin güç eğrisi
 * kurulur ve kayıpsız günlerde günlük beklenen ↔ gerçekleşen korelasyonu hesaplanır (lib/forecast/wind-loss.ts; kayıp
 * sayfasının kalite ölçütü). Korelasyon BÖLGEYİ doğrular, çiftliği ayırt etmez (aynı 9 km hücresindeki kümeler aynı r'yi
 * alır). Kabul: santralle eşleşen TEK küme (santral adının EPDK'da yalnız bu santralde geçen kelimesi kümenin adında /
 * işletmecisinde, ya da EPİAŞ şirket adı küme işletmecisinde) ya da bölgedeki tek küme, r ≥ WIND_MIN_DAILY_R ve
 * bölgedeki en iyi r'nin en çok 0,05 altında. Kanıt (EPDK yeri, küme, r) kaynak notuna yazılır.
 * Aday rüzgârı `.cache/osm/wind-candidates/` altında saklanır (yeniden çalıştırmada istek yok). `--write` olmadan hiçbir
 * şey yazılmaz. Konum `OSM` kaynağıyla (GEM_TRACKER ve USER'a dokunulmaz).
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { companyTokens, districtPoint, foldName, nameTokens, type OsmPlace } from "@/lib/epias-plant/location-match";
import { strictSameName } from "@/lib/sector/plant-technology";
import { detectWindLoss, hourMeanWind, WIND_MIN_DAILY_R, type WindLossInput } from "@/lib/forecast/wind-loss";
import { fetchWind, OpenMeteoLimitError, type WindResponse } from "@/lib/weather/reanalysis-wind";
import { setPlantLocation } from "@/lib/services/plant-location";

const WRITE = process.argv.includes("--write");
const MAX_CANDIDATES = 6;
const VALIDATION_FROM = "2026-03-01";
const VALIDATION_TO = "2026-08-31";
const HOUR = 3_600_000;
const CACHE = path.join(process.cwd(), ".cache", "osm");

type Cluster = { id: string; lat: number; lon: number; turbines: number; radiusKm: number; names: string[]; operators: string[]; refs: string[] };
const turbDoc = JSON.parse(fs.readFileSync(path.join(CACHE, "wind-turbines-tr.json"), "utf8")) as { source: string; pbfDate: string | null; clusters: Cluster[] };
const lic = (JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "epdk", "res-licenses.json"), "utf8")) as { licenses: Array<{ licenseNo: string; plant: string; il: string; ilce: string }> }).licenses;
const places = (JSON.parse(fs.readFileSync(path.join(CACHE, "places-tr.json"), "utf8")) as { places: OsmPlace[] }).places;
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const dy = (a.lat - b.lat) * 110.54;
  const dx = (a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
};
const nf = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "–");

// Ad kelimesi ayırt edici mi: EPDK'da yalnız bir santral adında ve yerinde geçiyorsa ("Akbük" birden çok santralde, "POYRAZ
// RES" Kepsut ve Susurluk'ta iki ayrı şirketin)
const tokenPlants = new Map<string, Set<string>>();
for (const l of lic) for (const t of nameTokens(l.plant.replace(/\s*\([^)]*\)\s*/g, " "))) (tokenPlants.get(t) ?? tokenPlants.set(t, new Set()).get(t)!).add(`${foldName(l.plant)}|${l.il}|${l.ilce}`);

const rows = await prisma.powerPlant.findMany({ where: { type: "RES", projectId: { not: null }, epiasPlantId: { not: null } }, select: { epiasPlantId: true, name: true, organizationName: true, capacityMw: true } });
const targets = new Map<number, (typeof rows)[number]>();
for (const r of rows) if (!(await readPoolPlantInfo(r.epiasPlantId!))?.location) targets.set(r.epiasPlantId!, r);

/** Aday noktada IFS rüzgârı (önbellekli) */
fs.mkdirSync(path.join(CACHE, "wind-candidates"), { recursive: true });
async function candidateWind(lat: number, lon: number): Promise<WindResponse> {
  const f = path.join(CACHE, "wind-candidates", `${lat.toFixed(4)},${lon.toFixed(4)},${VALIDATION_FROM},${VALIDATION_TO}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const r = await fetchWind("ecmwf_ifs", lat, lon, VALIDATION_FROM, VALIDATION_TO);
  fs.writeFileSync(f, JSON.stringify(r));
  return r;
}

/** Santralin üretimiyle aday rüzgârının kayıpsız günlerdeki günlük korelasyonu */
async function dailyR(epiasPlantId: number, capacityMw: number, w: WindResponse): Promise<number | null> {
  const stamps = new Map<number, [number | null, number | null]>();
  w.hourly.time.forEach((t, k) => stamps.set(Date.parse(`${t}:00Z`), [w.hourly.wind_speed_100m[k], w.hourly.wind_direction_100m[k]]));
  const from = Date.parse(`${VALIDATION_FROM}T00:00:00Z`);
  const to = Date.parse(`${VALIDATION_TO}T00:00:00Z`) + 24 * HOUR;
  const hours: WindLossInput[] = [];
  for (let y = new Date(from).getUTCFullYear(); y <= new Date(to - 1).getUTCFullYear(); y++) {
    const p = await readPoolYear(epiasPlantId, y);
    if (!p) continue;
    const s0 = Date.parse(p.start);
    for (let i = 0; i < p.uevm.length; i++) {
      const t = s0 + i * HOUR;
      if (t < from || t >= to) continue;
      const a = stamps.get(t);
      const b = stamps.get(t + HOUR);
      const m = hourMeanWind(a?.[0] ?? null, b?.[0] ?? null, a?.[1] ?? null, b?.[1] ?? null);
      const u = p.uevm[i];
      hours.push({ t, uevm: u === null ? null : Math.max(0, u), kgupFirst: p.kgupFirst[i], ws: m.ws, dir: m.dir, ptf: 1 });
    }
  }
  return detectWindLoss(hours, capacityMw).dailyR;
}

const found: Array<{ id: number; name: string; c: Cluster; r: number; ref: string }> = [];
let stopped = false;
outer: for (const [id, t] of targets) {
  const name = t.name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const lics = lic.filter((l) => strictSameName(name, l.plant));
  const centers = lics
    .map((l) => ({ p: districtPoint(l.il, l.ilce, places), max: foldName(l.ilce) ? 40 : 150, where: `${l.il}${foldName(l.ilce) ? ` / ${l.ilce}` : ""}` }))
    .filter((x): x is { p: OsmPlace; max: number; where: string } => !!x.p);
  const label = `#${String(id).padEnd(8)} ${t.name.slice(0, 26).padEnd(26)}`;
  if (!centers.length) {
    console.log(`${label} EPDK lisansı / yeri bulunamadı${lics.length ? ` (${lics.map((l) => `${l.il}/${l.ilce}`).join(", ")})` : ""}`);
    continue;
  }
  // Küme kanıtı: santral adının ayırt edici kelimesi kümenin adında / işletmecisinde, ya da EPİAŞ şirket adı küme işletmecisinde
  const own = new Set(Array.from(nameTokens(name)).filter((x) => (tokenPlants.get(x)?.size ?? 0) <= 1));
  const company = companyTokens(t.organizationName, nameTokens(name));
  const named = (c: Cluster) =>
    [...c.names, ...c.operators].some((s) => Array.from(nameTokens(s)).some((x) => own.has(x))) ||
    c.operators.some((s) => Array.from(companyTokens(s)).some((x) => company.has(x)));
  const near = turbDoc.clusters
    .map((c) => ({ c, d: Math.min(...centers.map((x) => (km(c, x.p) <= x.max ? km(c, x.p) : Infinity))) }))
    .filter((x) => Number.isFinite(x.d))
    .sort((a, b) => Number(named(b.c)) - Number(named(a.c)) || a.d - b.d)
    .slice(0, MAX_CANDIDATES);
  if (!near.length) {
    console.log(`${label} ${centers.map((x) => x.where).join(", ")} çevresinde OSM türbin kümesi yok`);
    continue;
  }
  const scored: Array<{ c: Cluster; d: number; r: number | null; named: boolean }> = [];
  for (const x of near) {
    try {
      scored.push({ ...x, r: await dailyR(id, t.capacityMw, await candidateWind(x.c.lat, x.c.lon)), named: named(x.c) });
    } catch (e) {
      if (e instanceof OpenMeteoLimitError) {
        console.log(`\nOpen-Meteo sınırı (${e.message}): durdu; yeniden çalıştırınca önbellekten sürer.`);
        stopped = true;
        break outer;
      }
      throw e;
    }
  }
  const ok = scored.filter((s) => s.r !== null).sort((a, b) => b.r! - a.r!);
  const list = ok.map((s) => `${s.c.id}${s.named ? "*" : ""} ${s.c.turbines}t ${nf(s.d, 0)}km r ${nf(s.r!)}`).join(" | ");
  // Korelasyon bölgeyi doğrular, çiftliği ayırt etmez (aynı IFS hücresindeki kümeler aynı r'yi alır; ilk denemede iki
  // santral aynı 2 türbinlik kümeye atanıyordu). Çiftlik kanıtı: adı / işletmecisi eşleşen küme ya da bölgedeki tek küme.
  const top = ok[0];
  const namedOk = ok.filter((s) => s.named);
  const best = namedOk.length === 1 ? namedOk[0] : ok.length === 1 ? ok[0] : null;
  const second = ok.find((s) => s !== best);
  let verdict: string;
  if (!top) verdict = "korelasyon hesaplanamadı (üretim verisi yetersiz)";
  else if (top.r! < WIND_MIN_DAILY_R) verdict = `bölgede en iyi r ${nf(top.r!)} < ${nf(WIND_MIN_DAILY_R, 2)}: bölge de doğrulanmadı`;
  else if (!best) verdict = `bölge doğrulandı (r ${nf(top.r!)}), çiftlik ayırt edilemiyor${namedOk.length > 1 ? ` (${namedOk.length} adı eşleşen küme)` : ""}`;
  else if (best.r! < WIND_MIN_DAILY_R || top.r! - best.r! > 0.05) verdict = `adı eşleşen küme rüzgârla tutmuyor (r ${nf(best.r!)}, bölgede en iyi ${nf(top.r!)})`;
  else {
    verdict = `KABUL ${best.c.id}${best.named ? " (adı eşleşen)" : ""}`;
    found.push({
      id,
      name: t.name,
      c: best.c,
      r: best.r!,
      ref: `OpenStreetMap türbin kümesi ${best.c.id} (${best.c.turbines} türbin${best.c.names.length ? `, "${best.c.names[0]}"` : ""}${best.c.operators.length ? `, işletmeci "${best.c.operators[0]}"` : ""}; ODbL, Geofabrik çıkarımı, indirme ${turbDoc.pbfDate ?? "?"}); EPDK lisans yeri ${centers.map((x) => x.where).join(", ")}, ${nf(best.d, 1)} km; IFS 9 km rüzgârla günlük r ${nf(best.r!)} (${VALIDATION_FROM} – ${VALIDATION_TO})${second ? `, ikinci aday ${nf(second.r!)}` : ""}; ${new Date().toISOString().slice(0, 10)}`,
    });
  }
  console.log(`${label} ${verdict}\n           ${list}`);
}
console.log(`\nOSM türbinleriyle kabul: ${found.length} / ${targets.size}${stopped ? " (sınırda durdu)" : ""}${WRITE ? " (yazılıyor)" : " (kuru çalışma; yazmak için --write)"}`);
if (WRITE)
  for (const f of found) {
    const r = await setPlantLocation(f.id, { latitude: f.c.lat, longitude: f.c.lon, locationSource: "OSM", locationRef: f.ref });
    console.log(`  #${f.id} ${f.name}: havuz ${r.pool ? "yazıldı" : "korundu"}, proje santrali ${r.projectPlants}`);
  }
await prisma.$disconnect();
