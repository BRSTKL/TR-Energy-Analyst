/**
 * Hidro santrallerin (HES) konumunu koordinatlı kayıtlarla tamamlar (kural: lib/epias-plant/location.ts, eşleştirme:
 * lib/epias-plant/hydro-location.ts; kullanıcı 27.10.2026: hidro konumları projeye eklensin, OSM indirmesi ve ilçe merkezi
 * tahmini onaylı).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/hydro-location-autofill.mts [--write]
 *
 * Hedef: projelerdeki ve sektör karnesinin (son yıl) lisanslı HES'leri. Sıra:
 *   1. Global Energy Monitor Global Hydropower Tracker (.cache/gem/hydro-tr.json; yalnız işletmedeki, konum doğruluğu
 *      "exact"): ad + güç + EPDK ilçesi; `GEM_TRACKER`.
 *   2. OpenStreetMap hidroelektrik santralleri (.cache/osm/hydro-plants-tr.json; scripts/tools/osm-hydro-overpass.py): aynı
 *      ölçüt; `OSM`.
 *   3. Koordinatlı kayıt yoksa EPDK lisansındaki ilçenin merkezi (.cache/epdk/hes-licenses.json + .cache/osm/places-tr.json):
 *      yalnız adı eşleşen lisanslar tek ilçeye çıkıyorsa; `DISTRICT_CENTER` (tahmin, "~"; santralin kendi konumu değil).
 * Elle girilen (USER) ve koordinatlı (GEM_TRACKER, OSM) konuma dokunulmaz; ilçe merkezinin yerini koordinatlı kayıt alır.
 * `--write` olmadan hiçbir şey yazılmaz (kuru çalışma).
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { districtIsProvince, districtPoint, foldName, type OsmPlace } from "@/lib/epias-plant/location-match";
import { epdkCapacityOf, epdkLicensesOf, type EpdkLicense } from "@/lib/epias-plant/installed-capacity";
import { distanceKm, EPDK_IL_KM, EPDK_ILCE_KM, parseMw, selectHydroSite, type EpdkCenter, type HydroSite } from "@/lib/epias-plant/hydro-location";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { replacePlantLocation, setPlantLocation } from "@/lib/services/plant-location";
import { stripEic } from "@/lib/sector/plant-technology";

const WRITE = process.argv.includes("--write");
/** Denetim: mevcut konumu olan santralleri de değerlendirir, bu araçla yazılmış kaydın bugünkü kuralla hâlâ kabul edilip edilmediğini söyler (yazmaz) */
const AUDIT = process.argv.includes("--audit") || process.argv.includes("--clean");
/** Temizlik (`--clean --write`): denetimde geçersiz çıkan kaydı ilçe merkezi tahminiyle değiştirir; tahmin de çıkarılamazsa konumu boşaltır */
const CLEAN = process.argv.includes("--clean");
const cache = path.join(process.cwd(), ".cache");
const readJson = <T,>(...p: string[]) => JSON.parse(fs.readFileSync(path.join(cache, ...p), "utf8")) as T;
const today = new Date().toISOString().slice(0, 10);

interface GemHydro { project: string; localName: string | null; otherNames: string | null; mw: number | null; status: string; lat: number; lon: number; accuracy: string; gemLocationId: string; river: string | null }
const gem = readJson<{ version: string; plants: GemHydro[] }>("gem", "hydro-tr.json");
const osm = readJson<{ extractedAt: string; plants: Array<{ osm: string; name: string; name_tr?: string; operator: string; mw: string; lat: number; lon: number }> }>("osm", "hydro-plants-tr.json");
const epdk = readJson<{ exportedAt: string; licenses: EpdkLicense[] }>("epdk", "hes-licenses.json");
const places = readJson<{ places: OsmPlace[] }>("osm", "places-tr.json").places;

// GEM: her ad biçimi ayrı aday; aynı kayıttan gelenler aynı kimliği paylaşır
const gemSites: Array<HydroSite & { rec: GemHydro }> = [];
for (const g of gem.plants) {
  if (g.accuracy !== "exact" || g.status !== "operating") continue;
  const names = [g.project, g.localName, ...(g.otherNames ?? "").split(/[,;]/)].filter((x): x is string => !!x && !!x.trim());
  for (const n of Array.from(new Set(names.map((x) => x.trim())))) gemSites.push({ id: g.gemLocationId, name: n, mw: g.mw, lat: g.lat, lon: g.lon, rec: g });
}
const osmSites: HydroSite[] = [];
for (const o of osm.plants) for (const n of Array.from(new Set([o.name, o.name_tr].filter((x): x is string => !!x && !!x.trim())))) osmSites.push({ id: o.osm, name: n, mw: parseMw(o.mw), lat: o.lat, lon: o.lon });

// Hedefler: projelerin ve sektör karnesinin HES'leri
const targets = new Map<number, { name: string; mw: number | null }>();
const sectorFiles = fs.readdirSync(path.join(cache, "epias")).map((f) => /^sector-(\d{4})\.json$/.exec(f)?.[1]).filter(Boolean).map(Number);
const sector = readJson<{ plants: Array<{ epiasPlantId: number; name: string; type: string }> }>("epias", `sector-${Math.max(...sectorFiles)}.json`);
for (const p of sector.plants) if (p.type === "HES" && !isUnlicensedName(p.name)) targets.set(p.epiasPlantId, { name: p.name, mw: null });
const rows = await prisma.powerPlant.findMany({ where: { type: "HES", projectId: { not: null }, epiasPlantId: { not: null } }, select: { epiasPlantId: true, name: true, capacityMw: true } });
for (const r of rows) if (!isUnlicensedName(r.name)) targets.set(r.epiasPlantId!, { name: r.name, mw: r.capacityMw > 0 ? r.capacityMw : null });

const tidy = (n: string) => stripEic(n).replace(/\s*\([^)]*\)?\s*$/, "").replace(/\s+/g, " ").trim();
const fmt = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
const found: Array<{ id: number; name: string; loc: Parameters<typeof setPlantLocation>[1]; src: string; siteId?: string; powerEvidence?: boolean }> = [];
const count: Record<string, number> = {};
let considered = 0;

for (const [id, t] of targets) {
  const cur = (await readPoolPlantInfo(id))?.location ?? null;
  if (cur && cur.locationSource !== "DISTRICT_CENTER" && !AUDIT) continue; // USER, GEM_TRACKER, OSM: dokunulmaz
  considered++;
  const name = tidy(t.name);
  const lics = epdkLicensesOf(name, epdk.licenses, "HES");
  const centers: EpdkCenter[] = [];
  for (const l of lics) {
    const p = districtPoint(l.il, l.ilce, places);
    if (p) centers.push({ lat: p.lat, lon: p.lon, maxKm: foldName(l.ilce) ? EPDK_ILCE_KM : EPDK_IL_KM });
  }
  const caps = Array.from(new Set(lics.map((l) => epdkCapacityOf(l, "HES")).filter((v) => v > 0)));
  const refMw = t.mw ?? (caps.length === 1 ? caps[0] : null);
  const label = `#${String(id).padEnd(8)} ${t.name.slice(0, 28).padEnd(28)}`;

  const g = selectHydroSite({ name, refMw }, gemSites, centers);
  if (g.ok) {
    const rec = (g.site as (typeof gemSites)[number]).rec;
    found.push({
      id, name: t.name, src: "GEM", siteId: g.site.id, powerEvidence: g.evidence.some((e) => e.startsWith("güç")),
      loc: { latitude: rec.lat, longitude: rec.lon, locationSource: "GEM_TRACKER", locationRef: `Global Energy Monitor, Global Hydropower Tracker ${gem.version} (CC BY 4.0): ${rec.project}${rec.river ? `, ${rec.river}` : ""} (GEM ${rec.gemLocationId}, konum doğruluğu ${rec.accuracy}); eşleşme ${g.evidence.join(", ")}; ${today}` },
    });
    console.log(`${label} GEM: ${rec.project} (${g.evidence.join("; ")})`);
    continue;
  }
  const o = selectHydroSite({ name, refMw }, osmSites, centers);
  if (o.ok) {
    found.push({
      id, name: t.name, src: "OSM", siteId: o.site.id, powerEvidence: o.evidence.some((e) => e.startsWith("güç")),
      loc: { latitude: o.site.lat, longitude: o.site.lon, locationSource: "OSM", locationRef: `OSM ${o.site.id} '${o.site.name}' (eşleşme ${o.evidence.join(", ")}); © OpenStreetMap katkıcıları, ODbL; Overpass ${osm.extractedAt}; otomatik kabul ${today}, kullanıcı doğrulaması bekliyor` },
    });
    console.log(`${label} OSM: ${o.site.name} (${o.evidence.join("; ")})`);
    continue;
  }
  // Koordinatlı kayıt yok: EPDK ilçe merkezi (yalnız bilinen ilçe; adı eşleşen lisanslar tek ilçeye çıkmalı)
  const where = Array.from(new Set(lics.filter((l) => foldName(l.ilce)).map((l) => `${l.il}/${l.ilce}`)));
  const lic = lics.find((l) => foldName(l.ilce));
  const point = lic ? districtPoint(lic.il, lic.ilce, places) : null;
  if (cur?.locationSource === "DISTRICT_CENTER") {
    console.log(`${label} ilçe merkezi tahmini korunuyor (GEM: ${g.reason}; OSM: ${o.reason})`);
  } else if (lic && point && where.length === 1 && lics.every((l) => !foldName(l.ilce) || `${l.il}/${l.ilce}` === where[0])) {
    found.push({
      id, name: t.name, src: "EPDK",
      loc: { latitude: point.lat, longitude: point.lon, locationSource: "DISTRICT_CENTER", locationRef: `Tahmin: EPDK lisans kaydında ${lic.il} / ${lic.ilce} (${lic.plant}, lisans ${lic.licenseNo}; EPDK dışa aktarımı ${epdk.exportedAt}); nokta ${point.name} ${point.place === "city" ? "il" : "ilçe"} merkezi (OSM ${point.osm}); koordinatlı kayıt bulunamadı (GEM: ${g.reason}; OSM: ${o.reason}); santralin kendi konumu değil; © OpenStreetMap katkıcıları, ODbL; ${today}` },
    });
    console.log(`${label} ~EPDK ilçe: ${lic.il}/${lic.ilce}`);
  } else {
    console.log(`${label} konum yok (${lics.length ? `EPDK ${where.length ? where.join(" | ") : "ilçe yok"}` : "EPDK kaydı yok"}; GEM: ${g.reason}; OSM: ${o.reason})`);
  }
}

// Aynı koordinatlı kayda birden çok EPİAŞ santrali düşüyorsa ("KALE HES(KALE ENR.)", "KALE HES(AVKAL)", "KALE REG. ve HES(KARAKURT)": parantezli ek
// farklı santralleri ayırır, GEM / OSM'de tek kayıt var) ve güç kanıtı yoksa hangisinin o kayıt olduğu bilinmez: bu santrallere yazılmaz
const perSite = new Map<string, number>();
for (const f of found) if (f.siteId) perSite.set(`${f.src}:${f.siteId}`, (perSite.get(`${f.src}:${f.siteId}`) ?? 0) + 1);
const shared = found.filter((f) => f.siteId && !f.powerEvidence && (perSite.get(`${f.src}:${f.siteId}`) ?? 0) > 1);
for (const f of shared) console.log(`  elendi (aynı kayıda birden çok santral, güç kanıtı yok): #${f.id} ${f.name}`);
for (let i = found.length - 1; i >= 0; i--) if (shared.includes(found[i])) found.splice(i, 1);
for (const f of found) count[f.src] = (count[f.src] ?? 0) + 1;
console.log(`\nHedef ${targets.size}, konumu aranan ${considered}: GEM ${count.GEM ?? 0}, OSM ${count.OSM ?? 0}, EPDK ilçe (~) ${count.EPDK ?? 0}, bulunamayan ${considered - found.length}${WRITE ? " (yazılıyor)" : " (kuru çalışma; yazmak için --write)"}`);
if (AUDIT) {
  // Bu araçla yazılmış koordinatlı kayıtlar (kaynak notu bu betiğin biçiminde): bugünkü kuralla hâlâ aynı yeri veriyor mu
  const kept = new Map(found.map((f) => [f.id, f]));
  const bad: string[] = [];
  const fix: Array<{ id: number; name: string; loc: Parameters<typeof setPlantLocation>[1] | null }> = [];
  let checked = 0;
  for (const [id, t] of targets) {
    const cur = (await readPoolPlantInfo(id))?.location ?? null;
    if (!cur || !/Hydropower Tracker|Overpass/.test(cur.locationRef)) continue;
    checked++;
    const f = kept.get(id);
    if (!f) {
      bad.push(`#${id} ${t.name}: artık kabul edilmiyor (yazılı: ${cur.locationSource} ${cur.locationRef.slice(0, 90)})`);
      fix.push({ id, name: t.name, loc: null });
    } else if (distanceKm({ lat: cur.latitude, lon: cur.longitude }, { lat: f.loc.latitude, lon: f.loc.longitude }) > 5) {
      bad.push(`#${id} ${t.name}: farklı yer seçiliyor`);
      fix.push({ id, name: t.name, loc: f.loc });
    }
  }
  console.log(`\nDenetim: bu araçla yazılmış ${checked} kayıt, bugünkü kuralla geçerli sayılmayan ${bad.length}`);
  for (const b of bad) console.log(`  ${b}`);
  if (CLEAN && WRITE)
    for (const x of fix) {
      const r = await replacePlantLocation(x.id, x.loc);
      console.log(`  #${x.id} ${x.name}: ${x.loc ? `${x.loc.locationSource} yazıldı` : "konum boşaltıldı"}, havuz ${r.pool ? "güncellendi" : "değişmedi"}, proje santrali ${r.projectPlants}`);
    }
  else if (CLEAN) console.log("  (kuru çalışma; temizlemek için --clean --write)");
}
if (WRITE && !AUDIT)
  for (const f of found) {
    const r = await setPlantLocation(f.id, f.loc);
    console.log(`  #${f.id} ${f.name}: havuz ${r.pool ? "yazıldı" : "korundu"}, proje santrali ${r.projectPlants}`);
  }
await prisma.$disconnect();
