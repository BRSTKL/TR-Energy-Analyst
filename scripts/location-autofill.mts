/**
 * Proje güneş santrallerinin konumunu OpenStreetMap adaylarıyla tamamlar (PLAN 20.2; karar: uydu korelasyonu ≥ 0,85
 * olan aday `OSM` kaynağıyla otomatik kabul, USER'a kullanıcı onayıyla çıkar).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/location-autofill.mts [--write]
 *
 * Adaylar: `.cache/osm/renewable-plants-tr.json` (Geofabrik çıkarımı; scripts/tools/osm-renewable-extract.py) içinde
 * santral adı / şirket kelimesi eşleşen güneş kayıtları (lib/epias-plant/location-match.ts; kardeş santral koruması).
 * Sınama: adayın koordinatında 2025 uydu GHI'si (SARAH3) ile santralin saatlik UEVM'si (2025 yoksa 2026) arasındaki
 * korelasyon (gündüz saatleri). Kabul: aday ayırt edici kelimeyle eşleşmiş (yer adı değil) ve ≥ 0,85; 10 km'den uzaktaki
 * herhangi bir aday (yer adıyla eşleşenler dahil) daha iyi ya da 0,02 yakınındaysa belirsiz (santral orada olmayabilir).
 * Başka santralin konumu olarak kayıtlı alan (aynı OSM nesnesi) yalnız OSM adı bu santralin numarasını içeriyorsa.
 * `--write` olmadan hiçbir şey yazılmaz (kuru çalışma).
 *
 * `--district` (kullanıcı kararı 15.10.2026): yalnız ilçe merkezi aşaması. Adında il / ilçe adı geçen konumsuz santraller için
 * o yerin OSM düğümü (`.cache/osm/places-tr.json`, scripts/tools/osm-places-extract.py); aynı ölçüt (≥ 0,85, aynı adlı uzak
 * yer yakınsa belirsiz); `DISTRICT_CENTER` kaynağıyla (tahmin, "~"); korelasyon tutmayan boş kalır.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { districtCandidates, osmCandidates, plantNumbers, tokenFrequency, type OsmPlace, type OsmPlant } from "@/lib/epias-plant/location-match";
import { listPoolPlants, readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { setPlantLocation } from "@/lib/services/plant-location";
import { emptySatelliteYear, fetchSatellite, mergeSatellite } from "@/lib/weather/satellite";

const WRITE = process.argv.includes("--write");
const DISTRICT = process.argv.includes("--district");
const MIN_R = 0.85;
const AMBIGUOUS_KM = 10;
const AMBIGUOUS_DR = 0.02;
const HOUR = 3_600_000;

const osmFile = path.join(process.cwd(), ".cache", "osm", "renewable-plants-tr.json");
const osmDoc = JSON.parse(fs.readFileSync(osmFile, "utf8")) as { source: string; extractedAt: string; plants: OsmPlant[] };
const freq = tokenFrequency(osmDoc.plants);

// Hangi OSM nesnesi hangi santralin konumu (kaynak notundaki "OSM w123" ile)
const usedBy = new Map<string, number[]>();
for (const id of await listPoolPlants()) {
  const ref = (await readPoolPlantInfo(id))?.location?.locationRef ?? "";
  const m = /OSM ([wrn]\d+)/.exec(ref);
  if (m) usedBy.set(m[1], [...(usedBy.get(m[1]) ?? []), id]);
}

const rows = await prisma.powerPlant.findMany({ where: { type: "GES", projectId: { not: null }, epiasPlantId: { not: null } }, select: { epiasPlantId: true, name: true, organizationName: true } });
const targets = new Map<number, { name: string; org: string | null }>();
for (const r of rows) if (!isUnlicensedName(r.name)) targets.set(r.epiasPlantId!, { name: r.name, org: r.organizationName });

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const dy = (a.lat - b.lat) * 110.54;
  const dx = (a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
};
function corr(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 200) return NaN;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  return s / Math.sqrt(sa * sb);
}
const satCache = new Map<string, Array<number | null>>();
async function satGhi(lat: number, lon: number, year: number) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${year}`;
  if (!satCache.has(key)) {
    // Arşivin son günü ≈ bugün − 3 gün (SARAH3 gecikmesi): yıl sonu sınırı
    const last = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const end = `${year + 1}-01-01` < last ? `${year + 1}-01-01` : last;
    const doc = mergeSatellite(emptySatelliteYear(0, year, lat, lon), await fetchSatellite(lat, lon, `${year}-01-01`, end), [], "x");
    satCache.set(key, doc.ghi);
  }
  return satCache.get(key)!;
}

/** Santralin en çok üretim saati olan yılı (2025 ya da 2026; 2026'da devreye girenlerde 2025 boştur) */
async function productionYear(id: number) {
  let best: { year: number; doc: NonNullable<Awaited<ReturnType<typeof readPoolYear>>>; n: number } | null = null;
  for (const year of [2025, 2026]) {
    const doc = await readPoolYear(id, year);
    const n = doc ? doc.uevm.filter((u) => u !== null && u > 0).length : 0;
    if (doc && (!best || n > best.n)) best = { year, doc, n };
  }
  return best;
}

/** Koordinatta uydu GHI ile santralin saatlik UEVM korelasyonu (gündüz saatleri; en çok veri olan yıl) */
async function correlationAt(id: number, lat: number, lon: number): Promise<number> {
  const py = await productionYear(id);
  if (!py) return NaN;
  const { year, doc: prod } = py;
  const g = await satGhi(lat, lon, year);
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < Math.min(g.length, prod.uevm.length); i++) {
    const u = prod.uevm[i];
    if (u === null || g[i] === null || (g[i]! <= 0 && u <= 0)) continue;
    a.push(u);
    b.push(g[i]!);
  }
  return corr(a, b);
}

const accepted: Array<{ id: number; name: string; c: OsmPlant; r: number; matched: string[] }> = [];
const nf = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "–");
for (const [id, t] of DISTRICT ? [] : targets) {
  const info = await readPoolPlantInfo(id);
  if (info?.location) continue;
  const cands = osmCandidates({ name: t.name, organizationName: t.org }, osmDoc.plants, "solar", freq).slice(0, 5);
  if (!cands.length) {
    console.log(`#${String(id).padEnd(8)} ${t.name.slice(0, 26).padEnd(26)} aday yok`);
    continue;
  }
  const py = await productionYear(id);
  const year = py?.year ?? 2025;
  const prod = py?.doc ?? null;
  if (!prod) {
    console.log(`#${String(id).padEnd(8)} ${t.name.slice(0, 26).padEnd(26)} üretim verisi yok`);
    continue;
  }
  const scored: Array<{ c: (typeof cands)[number]; r: number; note: string }> = [];
  for (const c of cands) {
    const owners = (usedBy.get(c.osm) ?? []).filter((x) => x !== id);
    const label = c.name || c.name_tr || "";
    if (owners.length && !plantNumbers(t.name).every((n) => plantNumbers(label).includes(n))) {
      scored.push({ c, r: NaN, note: `başka santralin alanı (#${owners.join(", #")})` });
      continue;
    }
    if (owners.length && !plantNumbers(t.name).length) {
      scored.push({ c, r: NaN, note: `başka santralin alanı (#${owners.join(", #")})` });
      continue;
    }
    const g = await satGhi(c.lat, c.lon, year);
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < Math.min(g.length, prod.uevm.length); i++) {
      const u = prod.uevm[i];
      if (u === null || g[i] === null || (g[i]! <= 0 && u <= 0)) continue;
      a.push(u);
      b.push(g[i]!);
    }
    scored.push({ c, r: corr(a, b), note: "" });
  }
  const ok = scored.filter((s) => Number.isFinite(s.r)).sort((x, y) => y.r - x.r);
  const best = ok.find((s) => s.c.distinctive);
  let verdict = !ok.length ? "değerlendirilemedi (veri yetersiz ya da aday başka santralin)" : !best ? "reddedildi (yalnız yer adıyla eşleşen aday)" : "reddedildi (korelasyon < 0,85)";
  if (best && best.r >= MIN_R) {
    const rival = ok.find((s) => s !== best && s.r >= best.r - AMBIGUOUS_DR && km(s.c, best.c) > AMBIGUOUS_KM);
    if (rival) verdict = `belirsiz (${rival.c.osm} ${nf(rival.r)}, ${km(rival.c, best.c).toFixed(0)} km uzakta${rival.c.distinctive ? "" : ", yer adı eşleşmesi"})`;
    else {
      verdict = "KABUL";
      accepted.push({ id, name: t.name, c: best.c, r: best.r, matched: best.c.matched });
    }
  }
  console.log(`#${String(id).padEnd(8)} ${t.name.slice(0, 26).padEnd(26)} ${verdict}`);
  for (const s of scored)
    console.log(`     ${s.c.osm.padEnd(12)} r ${nf(s.r)}  ${(s.c.name || s.c.name_tr || "-").slice(0, 40).padEnd(40)} op=${(s.c.operator || "-").slice(0, 24)} ${s.c.mw || ""} ${s.c.km2} km² [${s.c.matched.join(",")}${s.c.distinctive ? "" : "; yer adı"}] ${s.note}`);
}

// İlçe merkezi kipi (--district; PLAN 20.2 kullanıcı kararı): adında il / ilçe geçen konumsuz santraller, `DISTRICT_CENTER`
const districts: Array<{ id: number; name: string; p: OsmPlace; r: number }> = [];
if (DISTRICT) {
  const placesDoc = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "osm", "places-tr.json"), "utf8")) as { extractedAt: string; places: OsmPlace[] };
  for (const [id, t] of targets) {
    if ((await readPoolPlantInfo(id))?.location) continue;
    const cands = districtCandidates(t.name, placesDoc.places);
    if (!cands.length) {
      console.log(`#${String(id).padEnd(8)} ${t.name.slice(0, 26).padEnd(26)} adında il / ilçe yok`);
      continue;
    }
    const scored = [];
    for (const p of cands) scored.push({ p, r: await correlationAt(id, p.lat, p.lon) });
    const ok = scored.filter((x) => Number.isFinite(x.r)).sort((x, y) => y.r - x.r);
    const best = ok[0];
    let verdict = !best ? "değerlendirilemedi (üretim verisi yetersiz)" : "boş bırakıldı (korelasyon < 0,85)";
    if (best && best.r >= MIN_R) {
      const rival = ok.find((x) => x !== best && x.r >= best.r - AMBIGUOUS_DR && km(x.p, best.p) > AMBIGUOUS_KM);
      if (rival) verdict = `belirsiz (aynı adlı başka yer ${nf(rival.r)}, ${km(rival.p, best.p).toFixed(0)} km uzakta)`;
      else {
        verdict = "KABUL (~ ilçe merkezi)";
        districts.push({ id, name: t.name, p: best.p, r: best.r });
      }
    }
    console.log(`#${String(id).padEnd(8)} ${t.name.slice(0, 26).padEnd(26)} ${verdict}`);
    for (const x of scored) console.log(`     ${x.p.osm.padEnd(12)} r ${nf(x.r)}  ${x.p.name} (${x.p.place === "city" ? "il merkezi" : "ilçe merkezi"}) ${x.p.lat}, ${x.p.lon}`);
  }
  console.log(`\nİlçe merkezi kabul: ${districts.length}${WRITE ? " (yazılıyor)" : " (kuru çalışma; yazmak için --write)"}`);
  if (WRITE)
    for (const d of districts) {
      const r = await setPlantLocation(d.id, {
        latitude: d.p.lat,
        longitude: d.p.lon,
        locationSource: "DISTRICT_CENTER",
        locationRef: `Tahmin: ${d.p.name} ${d.p.place === "city" ? "il" : "ilçe"} merkezi (santral adında geçiyor; OSM ${d.p.osm} place=${d.p.place}); uydu GHI–UEVM korelasyonu ${nf(d.r)} ≥ ${MIN_R}; santralin kendi konumu değil (birkaç km – onlarca km sapabilir); © OpenStreetMap katkıcıları, ODbL; Geofabrik ${placesDoc.extractedAt}; ${new Date().toISOString().slice(0, 10)}`,
      });
      console.log(`  #${d.id} ${d.name}: havuz ${r.pool ? "yazıldı" : "korundu"}, proje santrali ${r.projectPlants}`);
    }
}

if (!DISTRICT) console.log(`\nKabul: ${accepted.length}${WRITE ? " (yazılıyor)" : " (kuru çalışma; yazmak için --write)"}`);
if (WRITE && !DISTRICT)
  for (const a of accepted) {
    const r = await setPlantLocation(a.id, {
      latitude: Math.round(a.c.lat * 1e5) / 1e5,
      longitude: Math.round(a.c.lon * 1e5) / 1e5,
      locationSource: "OSM",
      locationRef: `OSM ${a.c.osm} '${a.c.name || a.c.name_tr}' (ad eşleşmesi: ${a.matched.join(", ")}; uydu GHI–UEVM korelasyonu ${nf(a.r)} ≥ ${MIN_R}); © OpenStreetMap katkıcıları, ODbL; Geofabrik ${osmDoc.extractedAt}; otomatik kabul ${new Date().toISOString().slice(0, 10)}, kullanıcı doğrulaması bekliyor`,
    });
    console.log(`  #${a.id} ${a.name}: havuz ${r.pool ? "yazıldı" : "korundu"}, proje santrali ${r.projectPlants}`);
  }
await prisma.$disconnect();
void HOUR;
