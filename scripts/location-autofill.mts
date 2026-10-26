/**
 * Proje güneş santrallerinin konumunu OpenStreetMap adaylarıyla tamamlar (PLAN 20.2; karar: uydu korelasyonu ≥ 0,85
 * olan aday `OSM` kaynağıyla otomatik kabul, USER'a kullanıcı onayıyla çıkar).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/location-autofill.mts [--write]
 *
 * Adaylar: `.cache/osm/renewable-plants-tr.json` (Geofabrik çıkarımı; scripts/tools/osm-renewable-extract.py) içinde
 * santral adı / şirket kelimesi eşleşen güneş kayıtları (lib/epias-plant/location-match.ts; kardeş santral koruması).
 * Sınama: adayın koordinatında 2025 uydu GHI'si (SARAH3) ile santralin saatlik UEVM'si (2025 yoksa 2026) arasındaki
 * korelasyon (gündüz saatleri). Kabul: aday ayırt edici kelimeyle eşleşmiş (yer adı değil) ve ≥ 0,85; 10 km'den uzakta
 * ayırt edici bir aday 0,02 yakınındaysa ya da yalnız yer adıyla eşleşen bir aday daha iyiyse belirsiz.
 * Başka santralin konumu olarak kayıtlı alan (aynı OSM nesnesi) yalnız OSM adı bu santralin numarasını içeriyorsa.
 * `--write` olmadan hiçbir şey yazılmaz (kuru çalışma).
 *
 * `--sector`: hedef proje santralleri yerine sektör karnesinin (son yıl) lisanslı güneş santralleri (PLAN 20.4; OSM aşaması
 * karar 2 kapsamında; ilçe merkezi yalnız proje santralleri için onaylandı).
 *
 * `--epdk` (kullanıcı, 15.10.2026): EPDK lisans dışa aktarımındaki il / ilçe (`.cache/epdk/solar-licenses.json`; EPDK
 * kaydında koordinat yok) → o yerin OSM düğümü; hedef sektör + proje santralleri; aynı ölçüt; `DISTRICT_CENTER`.
 * Birebir ad (kullanıcı, 16.10.2026: projelerdeki bütün GES'lerin konumu): EPDK'da adı birebir aynı (lib/sector/plant-technology.ts
 * `strictSameName`; parantezli ek atılır, bitişik numara ayrılır: "G4-BOR2" → "G4-BOR 2"; "Depolamalı" tür eki sayılır) ve
 * birebir adlı lisansları tek il / ilçeye çıkan santral,
 * korelasyon ölçütü aranmadan kabul edilir: lisans kaydı yer kanıtıdır; depolamalı santral üretimi akşama kaydırdığı, YEKA
 * santrali sıfır fiyatlı saatlerde kısıldığı için korelasyon düşük kalır. Korelasyon kaynak notuna yazılır.
 *
 * `--gem` (kullanıcı, 16.10.2026): Global Energy Monitor Global Solar Power Tracker (`.cache/gem/solar-tr.json`;
 * scripts/tools/gem-tracker-extract.py; CC BY 4.0, koordinatlı kayıt). Eşleşme önce EPDK lisans numarasıyla (santral adı
 * EPDK dışa aktarımında birebir → lisans no → GEM "Other IDs"), yoksa birebir adla (GEM proje / yerel / diğer adlar,
 * "solar project" eki atılır; `strictSameName`). Yalnız konum doğruluğu "exact" olanlar;
 * eşleşen kayıtlar 5 km'den çok ayrılıyorsa belirsiz; EPDK ilçe merkezinden 40 km'den (ilçesi olmayan lisansta il merkezinden 150 km'den) uzak GEM koordinatı reddedilir (GEM'de
 * lisans no yanlış kayıtta olabiliyor). GEM'in Türkiye satırlarında "State/Province" kaymış; il "City" sütunundan. `GEM_TRACKER` ilçe merkezinin ve boş konumun yerini alır; OSM ve
 * elle girilen konuma dokunulmaz (mesafe raporlanır). Uydu korelasyonu bilgi için yazılır (depolama / kısıntı düşürür).
 * `--gem --res` (kullanıcı, 17.10.2026; rüzgâr sayfaları için): aynı kural rüzgârla: Global Wind Power Tracker
 * (`.cache/gem/wind-tr.json`), EPDK rüzgâr lisansları (`.cache/epdk/res-licenses.json`), proje / karne RES santralleri. Uydu
 * ışınımı rüzgârda anlamsız olduğu için korelasyon hesaplanmaz; kanıt lisans no / birebir ad ve EPDK ilçe sınırıdır. Aynı
 * adlı birden çok kayıt (Soma (Bilgin) / Soma (Polat)) santral adındaki parantezli ek ve EPİAŞ şirket adıyla GEM'in proje
 * parantezi / sahip / işletmeci adı karşılaştırılarak ayrılır (`companyTokens`); ayrılmazsa belirsiz.
 * `--epdk --res`: rüzgâr lisansları (`.cache/epdk/res-licenses.json`); uydu ışınımı rüzgârda anlamsız olduğu için yalnız
 * birebir adlı, tek il / ilçeye çıkan lisans kabul edilir (korelasyon ölçütü yok).
 * `--res` yalnız `--gem` ya da `--epdk` ile (OSM ve ilçe kipleri güneşe göre).
 * `--district` (kullanıcı kararı 15.10.2026): yalnız ilçe merkezi aşaması. Adında il / ilçe adı geçen konumsuz santraller için
 * o yerin OSM düğümü (`.cache/osm/places-tr.json`, scripts/tools/osm-places-extract.py); aynı ölçüt (≥ 0,85, aynı adlı uzak
 * yer yakınsa belirsiz); `DISTRICT_CENTER` kaynağıyla (tahmin, "~"); korelasyon tutmayan boş kalır.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { companyTokens, districtCandidates, districtPoint, foldName, nameTokens, osmCandidates, plantNumbers, tokenFrequency, type OsmPlace, type OsmPlant } from "@/lib/epias-plant/location-match";
import { listPoolPlants, readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { setPlantLocation } from "@/lib/services/plant-location";
import { emptySatelliteYear, fetchSatellite, mergeSatellite } from "@/lib/weather/satellite";
import { strictSameName } from "@/lib/sector/plant-technology";

const WRITE = process.argv.includes("--write");
const DISTRICT = process.argv.includes("--district");
const EPDK = process.argv.includes("--epdk");
const GEM = process.argv.includes("--gem");
const TECH = process.argv.includes("--res") ? "RES" : "GES";
if (TECH === "RES" && !GEM && !EPDK) throw new Error("--res yalnız --gem veya --epdk ile kullanılır");
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

const SECTOR = process.argv.includes("--sector");
const targets = new Map<number, { name: string; org: string | null }>();
if (SECTOR || EPDK || GEM) {
  // Sektör karnesinin (son yıl) lisanslı güneş santralleri (PLAN 20.4)
  const cache = path.join(process.cwd(), ".cache", "epias");
  const year = Math.max(...fs.readdirSync(cache).map((f) => Number(/^sector-(\d{4})\.json$/.exec(f)?.[1] ?? 0)));
  const sector = JSON.parse(fs.readFileSync(path.join(cache, `sector-${year}.json`), "utf8")) as { plants: Array<{ epiasPlantId: number; name: string; type: string; organizationName?: string | null }> };
  for (const p of sector.plants) if (p.type === TECH && !isUnlicensedName(p.name)) targets.set(p.epiasPlantId, { name: p.name, org: p.organizationName ?? null });
}
if (!SECTOR) {
  const rows = await prisma.powerPlant.findMany({ where: { type: TECH, projectId: { not: null }, epiasPlantId: { not: null } }, select: { epiasPlantId: true, name: true, organizationName: true } });
  for (const r of rows) if (!isUnlicensedName(r.name)) targets.set(r.epiasPlantId!, { name: r.name, org: r.organizationName });
}

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
for (const [id, t] of DISTRICT || EPDK || GEM ? [] : targets) {
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
    // Rakip: 10 km'den uzak; ayırt edici rakip 0,02 yakınındaysa, yalnız yer adıyla eşleşen rakip ancak daha iyiyse engeller
    // (yakın bölgede hava benzer: uzak bir yer adı eşleşmesi biraz düşük kalınca santral orada sayılmaz; ReNOE / Fina:
    // 0,920 > 0,895 belirsiz; Gaziantep YEKA / belediye santrali: 0,896 < 0,902 kabul)
    const rival = ok.find((s) => s !== best && km(s.c, best.c) > AMBIGUOUS_KM && (s.c.distinctive ? s.r >= best.r - AMBIGUOUS_DR : s.r > best.r));
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

// GEM kipi (--gem; başlıktaki açıklama)
if (GEM) {
  const gemDoc = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "gem", TECH === "RES" ? "wind-tr.json" : "solar-tr.json"), "utf8")) as {
    version: string;
    plants: Array<{ project: string; phase: string | null; localName: string | null; otherNames: string | null; mw: number | null; status: string | null; lat: number; lon: number; accuracy: string | null; city: string | null; province: string | null; gemLocationId: string; gemPhaseId: string; epdkLicenses: string[]; owner: string | null; operator: string | null }>;
  };
  const epdkDoc = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "epdk", TECH === "RES" ? "res-licenses.json" : "solar-licenses.json"), "utf8")) as { licenses: Array<{ licenseNo: string; plant: string; il: string; ilce: string }> };
  const placesDoc = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "osm", "places-tr.json"), "utf8")) as { places: OsmPlace[] };
  // GEM'in Türkiye satırlarında "State/Province" kaymış (ör. Acıpayam için Van); il "City" sütununda
  const gemIl = (g: (typeof gemDoc.plants)[number]) => g.city ?? g.province;
  // Lisans no karşılaştırması: GEM bazı kayıtlarda "EÜ" yerine "EU" yazıyor (G4-Bor-1: EU/12883-1/06264)
  const licenseKey = (no: string) => no.toLocaleUpperCase("tr-TR").replace(/^E[ÜU]\//, "EU/").replace(/\s+/g, "");
  const tidy = (n: string) => n.replace(/\s*\([^)]*\)\s*/g, " ").replace(/([A-Za-zÇĞİÖŞÜçğıöşü]{2,})(\d+)\b/g, "$1 $2").trim();
  const gemNames = (g: (typeof gemDoc.plants)[number]) =>
    [g.project, g.localName, ...(g.otherNames ?? "").split(/[,;]/)]
      .filter((x): x is string => !!x && !!x.trim())
      .map((x) => x.replace(/\s+(solar|pv|wind)\s+(project|farm|plant|power plant|power station)$/i, "").trim());
  const found: Array<{ id: number; name: string; g: (typeof gemDoc.plants)[number]; how: string; r: number }> = [];
  let n = 0;
  for (const [id, t0] of targets) {
    const cur = (await readPoolPlantInfo(id))?.location ?? null;
    if (cur?.locationSource === "USER" || cur?.locationSource === "GEM_TRACKER") continue;
    n++;
    const name = tidy(t0.name);
    // EPDK adı da aynı biçimde ayrılır ("OMİCRON ENGİL208 GES": santral adı ayrılıp EPDK'daki ayrılmazsa eşleşmiyordu)
    const lics = epdkDoc.licenses.filter((l) => strictSameName(name, tidy(l.plant)));
    const nos = new Set(lics.map((l) => licenseKey(l.licenseNo)));
    // EPDK ilçe merkezleri: GEM koordinatı bunlardan MAX_KM'den uzaksa reddedilir (GEM'de lisans no başka santrale yazılmış
    // olabilir: "Silopi" lisansı Sivas'taki kayıtta; aynı şirketin komşu ilçedeki santrali: Omicron Erciş / Edremit)
    // İlçesi olmayan lisans ("-", eski rüzgâr lisansları) il merkeziyle: il ilçeden büyük olduğu için sınır PROVINCE_KM ("MERKEZ" ilçedir, 40 km)
    const MAX_KM = 40;
    const PROVINCE_KM = 150;
    const centers = lics
      .map((l) => ({ p: districtPoint(l.il, l.ilce, placesDoc.places), max: foldName(l.ilce) ? MAX_KM : PROVINCE_KM }))
      .filter((x): x is { p: OsmPlace; max: number } => !!x.p);
    const byLicense = gemDoc.plants.filter((g) => g.epdkLicenses.some((x) => nos.has(licenseKey(x))));
    const byName = gemDoc.plants.filter((g) => !byLicense.includes(g) && gemNames(g).some((x) => strictSameName(name, x)));
    const hits = [...byLicense, ...byName];
    const how = (g: (typeof gemDoc.plants)[number]) => (byLicense.includes(g) ? "EPDK lisans no" : "birebir ad");
    const dist = (g: { lat: number; lon: number }) => (centers.length ? Math.min(...centers.map((c) => km(g, c.p))) : NaN);
    const near = (g: { lat: number; lon: number }) => !centers.length || centers.some((c) => km(g, c.p) <= c.max);
    const exactAll = hits.filter((g) => g.accuracy === "exact");
    const exact = exactAll.filter(near);
    let verdict: string;
    if (!hits.length) verdict = "GEM'de yok";
    else if (!exactAll.length) verdict = `yalnız yaklaşık konum (${hits.length})`;
    else if (!exact.length) verdict = `EPDK ilçe / il merkezinden uzak, reddedildi: ${exactAll.map((g) => `${g.project} ${gemIl(g) ?? ""} ${nf(dist(g), 0)} km`).join(" | ")}`;
    else {
      // Aynı adlı santraller (Soma (Bilgin) / Soma (Polat)): santral adındaki parantezli ek ve EPİAŞ'taki şirket adı, GEM'in
      // proje parantezi / sahip / işletmeci adıyla; yalnız eşleşenler tek yerde toplanıyorsa kabul (kullanıcı, 17.10.2026)
      let pick = exact;
      let byCompany = false;
      let conflict = false;
      if (exact.some((g) => km(g, exact[0]) > 5)) {
        const base = nameTokens(name.replace(/\([^)]*\)/g, " "));
        // Şirket kelimesi adın kendisi olabilir ("BAĞLAR RES (BAĞLAR ELK.)"): GEM sahip / işletmeci adında geçiyorsa sayılır, GEM
        // proje adında (yer adı: "Soma (Polat)") sayılmaz
        const mine = new Set([...companyTokens((/\(([^)]*)\)/.exec(t0.name) ?? [])[1]), ...companyTokens(t0.org)]);
        const theirs = (g: (typeof gemDoc.plants)[number]) =>
          new Set([...companyTokens((/\(([^)]*)\)/.exec(g.project) ?? [])[1], base), ...companyTokens([g.owner, g.operator].filter(Boolean).join(" "))]);
        // En iyi örtüşen sahip (Jaccard): "DATÇA RES" (Datça Rüzgar) faz 3'e, "DARES DATÇA RES" faz 1–2'ye
        const score = (g: (typeof gemDoc.plants)[number]) => {
          const t = theirs(g);
          const inter = Array.from(t).filter((x) => mine.has(x)).length;
          return inter ? inter / new Set([...Array.from(t), ...Array.from(mine)]).size : 0;
        };
        const best = Math.max(0, ...exact.map(score));
        const hit = best > 0 ? exact.filter((g) => score(g) === best) : [];
        if (hit.length) {
          pick = hit;
          byCompany = true;
        } else if (Array.from(mine).some((t) => !base.has(t))) conflict = true;
      }
      // Aynı projenin uzak fazları (GEM konum kimliği aynı; Dares Datça, Akbük (Ayen)): en büyük fazın kayıtlı koordinatı. Şirket
      // biliniyor ama GEM sahibiyle uyuşmuyorsa (AKBÜK RES(SUAY ENR.)) uygulanmaz
      let phase = false;
      if (!conflict && pick.some((g) => km(g, pick[0]) > 5) && new Set(pick.map((g) => g.gemLocationId)).size === 1) {
        // Santral numarası fazla eşleşirse o faz ("AKBÜK II RES" → faz 2), yoksa en büyük faz
        const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
        const nums = new Set([...plantNumbers(name), ...foldName(name).split(" ").flatMap((t) => (roman[t] ? [roman[t]] : []))]);
        const numbered = pick.filter((g) => g.phase !== null && nums.has(Math.trunc(Number(g.phase))));
        pick = numbered.length === 1 ? numbered : [[...pick].sort((a, b) => (b.mw ?? 0) - (a.mw ?? 0))[0]];
        phase = true;
      }
      const how2 = (g: (typeof gemDoc.plants)[number]) => how(g) + (byCompany ? " + şirket adı" : "") + (phase ? " + aynı projenin fazı" : "");
      if (pick.some((g) => km(g, pick[0]) > 5)) verdict = `belirsiz: ${exact.map((g) => `${g.project} ${gemIl(g) ?? ""}`).join(" | ")}`;
      else {
        const g = pick[0];
        // Uydu ışınımı korelasyonu yalnız güneşte anlamlı
        const r = TECH === "GES" ? await correlationAt(id, g.lat, g.lon) : NaN;
        const where = `EPDK ${centers.some((c) => c.max === PROVINCE_KM) ? "il" : "ilçe"} merkezinden ${nf(dist(g), 1)} km`;
        if (cur?.locationSource === "OSM") verdict = `OSM korunuyor (GEM ${nf(km(g, { lat: cur.latitude, lon: cur.longitude }), 1)} km uzakta)`;
        else {
          verdict = `KABUL (${how2(g)}; ${g.project}${g.phase ? ` ${g.phase}` : ""}, ${gemIl(g) ?? "?"}${TECH === "GES" ? `; r ${nf(r)}` : ""}; ${where})`;
          found.push({ id, name: t0.name, g, how: how2(g), r });
        }
      }
    }
    console.log(`#${String(id).padEnd(8)} ${t0.name.slice(0, 26).padEnd(26)} ${verdict}`);
  }
  console.log(`\nGEM ile kabul: ${found.length} / ${n}${WRITE ? " (yazılıyor)" : " (kuru çalışma; yazmak için --write)"}`);
  if (WRITE)
    for (const f of found) {
      const r = await setPlantLocation(f.id, {
        latitude: f.g.lat,
        longitude: f.g.lon,
        locationSource: "GEM_TRACKER",
        locationRef: `Global Energy Monitor, Global ${TECH === "RES" ? "Wind" : "Solar"} Power Tracker ${gemDoc.version} (CC BY 4.0): ${f.g.project}${f.g.phase ? ` / ${f.g.phase}` : ""}, ${gemIl(f.g) ?? ""} (GEM ${f.g.gemLocationId}, konum doğruluğu ${f.g.accuracy}); eşleşme ${f.how}${f.g.epdkLicenses.length ? ` (${f.g.epdkLicenses.join(", ")})` : ""}${TECH === "GES" ? `; uydu GHI–UEVM korelasyonu ${Number.isFinite(f.r) ? nf(f.r) : "hesaplanamadı"}` : ""}; ${new Date().toISOString().slice(0, 10)}`,
      });
      console.log(`  #${f.id} ${f.name}: havuz ${r.pool ? "yazıldı" : "korundu"}, proje santrali ${r.projectPlants}`);
    }
}

// EPDK il / ilçe kipi (--epdk; kullanıcının EPDK lisans dışa aktarımı, .cache/epdk/solar-licenses.json veya res-licenses.json): santral adı EPDK tesis
// adıyla eşleşir (ad kelimelerinin hepsi, numara çelişkisi yok; yürürlükteki lisans önce), il / ilçenin yer düğümü
// (`districtPoint`), aynı kabul ölçütü; `DISTRICT_CENTER` ("~")
if (EPDK) {
  const placesDoc = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "osm", "places-tr.json"), "utf8")) as { extractedAt: string; places: OsmPlace[] };
  const epdkFile = TECH === "RES" ? "res-licenses.json" : "solar-licenses.json";
  const epdkDoc = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "epdk", epdkFile), "utf8")) as {
    exportedAt: string;
    licenses: Array<{ licenseNo: string; status: string; plant: string; il: string; ilce: string; mwe: string }>;
  };
  const found: Array<{ id: number; name: string; p: OsmPlace; r: number; lic: (typeof epdkDoc.licenses)[number]; exact?: boolean }> = [];
  // "BÜGET GES(ULUDER)" → "BÜGET GES"; "G4-BOR2 GES" → "G4-BOR 2 GES"
  const tidy = (n: string) => n.replace(/\s*\([^)]*\)\s*/g, " ").replace(/([A-Za-zÇĞİÖŞÜçğıöşü]{2,})(\d+)\b/g, "$1 $2").trim();
  for (const [id, t0] of targets) {
    if ((await readPoolPlantInfo(id))?.location) continue;
    const t = { ...t0, name: tidy(t0.name) };
    const own = nameTokens(t.name);
    const nums = plantNumbers(t.name);
    const lics = epdkDoc.licenses
      .filter((e) => {
        if (strictSameName(t.name, e.plant)) return true;
        const theirs = nameTokens(e.plant);
        const common = [...own].filter((x) => theirs.has(x));
        if (!common.length) return false;
        const en = plantNumbers(e.plant);
        if (nums.length && en.length && nums.join() !== en.join()) return false;
        return common.length === own.size || foldName(e.plant).replace(/ ges$/, "") === foldName(t.name).replace(/ ges$/, "");
      })
      .sort((a, b) => (a.status === "Yürürlükte" ? -1 : 1) - (b.status === "Yürürlükte" ? -1 : 1));
    if (!lics.length) {
      console.log(`#${String(id).padEnd(8)} ${t.name.slice(0, 26).padEnd(26)} EPDK kaydı yok`);
      continue;
    }
    // Farklı il / ilçeler (aynı santralin farklı lisansları aynı yerdeyse bir kez)
    const seen = new Map<string, { lic: (typeof lics)[number]; p: OsmPlace | null }>();
    for (const l of lics) {
      const k = `${l.il}/${l.ilce}`;
      if (!seen.has(k)) seen.set(k, { lic: l, p: districtPoint(l.il, l.ilce, placesDoc.places) });
    }
    const scored = [];
    // Rüzgârda uydu ışınımı korelasyonu anlamsız: yalnız birebir ad kabul edilir
    for (const { lic, p } of seen.values()) scored.push({ lic, p, r: p && TECH === "GES" ? await correlationAt(id, p.lat, p.lon) : NaN });
    const ok = scored.filter((x) => x.p && Number.isFinite(x.r)).sort((x, y) => y.r - x.r);
    const best = ok[0];
    let verdict = !scored.some((x) => x.p)
      ? "ilçe yer listesinde yok"
      : TECH === "RES"
        ? "boş bırakıldı (birebir adlı tek lisans yok)"
        : !best
          ? "değerlendirilemedi (üretim verisi yetersiz)"
          : "boş bırakıldı (korelasyon < 0,85)";
    // Birebir ad ve tek yer: korelasyon ölçütü aranmaz (lisans kaydı yer kanıtı; depolama / kısıntı korelasyonu düşürür)
    const exact = scored.filter((x) => x.p && strictSameName(t.name, x.lic.plant));
    if (exact.length && new Set(exact.map((x) => `${x.lic.il}/${x.lic.ilce}`)).size === 1) {
      const x = exact[0];
      verdict = `KABUL (~ EPDK ilçesi, birebir ad${TECH === "GES" ? `; korelasyon ${nf(x.r)}` : ""})`;
      found.push({ id, name: t0.name, p: x.p!, r: x.r, lic: x.lic, exact: true });
    } else if (best && best.r >= MIN_R) {
      const rival = ok.find((x) => x !== best && x.r >= best.r - AMBIGUOUS_DR && km(x.p!, best.p!) > AMBIGUOUS_KM);
      if (rival) verdict = `belirsiz (${rival.lic.il}/${rival.lic.ilce} ${nf(rival.r)})`;
      else {
        verdict = "KABUL (~ EPDK ilçesi)";
        found.push({ id, name: t0.name, p: best.p!, r: best.r, lic: best.lic });
      }
    }
    console.log(`#${String(id).padEnd(8)} ${t.name.slice(0, 26).padEnd(26)} ${verdict}`);
    for (const x of scored) console.log(`     EPDK ${x.lic.plant} [${x.lic.il}/${x.lic.ilce}, ${x.lic.status}] → ${x.p ? `${x.p.name} ${x.p.lat}, ${x.p.lon}` : "yer yok"}  r ${nf(x.r)}`);
  }
  console.log(`\nEPDK ilçesiyle kabul: ${found.length}${WRITE ? " (yazılıyor)" : " (kuru çalışma; yazmak için --write)"}`);
  if (WRITE)
    for (const f of found) {
      const r = await setPlantLocation(f.id, {
        latitude: f.p.lat,
        longitude: f.p.lon,
        locationSource: "DISTRICT_CENTER",
        locationRef: `Tahmin: EPDK lisans kaydında ${f.lic.il} / ${f.lic.ilce} (${f.lic.plant}, lisans ${f.lic.licenseNo}; EPDK dışa aktarımı ${epdkDoc.exportedAt}); nokta ${f.p.name} ${f.p.place === "city" ? "il" : "ilçe"} merkezi (OSM ${f.p.osm}); ${f.exact ? `EPDK'da adı birebir aynı tek lisans (yer kanıtı)${TECH === "GES" ? `; uydu GHI–UEVM korelasyonu ${Number.isFinite(f.r) ? nf(f.r) : "hesaplanamadı"} (depolama / kısıntı düşürebilir)` : ""}` : `uydu GHI–UEVM korelasyonu ${nf(f.r)} ≥ ${MIN_R}`}; santralin kendi konumu değil; © OpenStreetMap katkıcıları, ODbL; ${new Date().toISOString().slice(0, 10)}`,
      });
      console.log(`  #${f.id} ${f.name}: havuz ${r.pool ? "yazıldı" : "korundu"}, proje santrali ${r.projectPlants}`);
    }
}

if (!DISTRICT && !EPDK && !GEM) console.log(`\nKabul: ${accepted.length}${WRITE ? " (yazılıyor)" : " (kuru çalışma; yazmak için --write)"}`);
if (WRITE && !DISTRICT && !EPDK && !GEM)
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
