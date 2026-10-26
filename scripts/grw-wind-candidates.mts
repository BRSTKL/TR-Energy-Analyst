/**
 * Konumu tahmini (ilçe / il merkezi) ya da boş olan proje RES'leri için Global Renewables Watch türbin kümelerinden aday
 * listesi. YALNIZ OKUR: konum yazmaz; aday kullanıcı uydu görüntüsünde doğrulayınca `scripts/plant-location.mts set` ile girilir.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/grw-wind-candidates.mts [--json <çıktı>]
 *
 * Veri `.cache/grw/wind-tr.json` (scripts/tools/grw-wind-extract.py; kaynaklar/README.md). Türbinler LINK_KM ile yeniden
 * kümelenir (çıkarıcının 1,5 km'si bitişik çiftlikleri birleştiriyor). Aday: mevcut tahmini noktadan RADIUS_KM içinde (il
 * merkezi tahmininde 2 katı) küme. Bir türbini, konumu kayıtlı (GEM, OSM ya da elle) başka bir santrale TAKEN_KM'den
 * yakın küme "dolu" işaretlenir. Beklenen türbin sayısı kurulu güç ÷ 1,5–5 MW (eski Ege santrallerinde türbin küçük).
 * Veri 2024 2. çeyreğe kadar: daha yeni santral ya da genişleme görünmez. Santral adı yok: aday kesin eşleşme değildir.
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";

const LINK_KM = 0.8;
const RADIUS_KM = 60;
const TAKEN_KM = 1.5;
const SHOW = 4;

type Pt = { lat: number; lon: number; built: string | null };
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const dy = (a.lat - b.lat) * 110.54;
  const dx = (a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

const doc = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "grw", "wind-tr.json"), "utf8")) as { version: string; points: Array<[number, number, string | null]> };
const pts: Pt[] = doc.points.map(([lat, lon, built]) => ({ lat, lon, built }));

// Tek bağlantılı kümeleme (3.254 nokta: düz karşılaştırma yeterli)
const parent = pts.map((_, i) => i);
const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (km(pts[i], pts[j]) <= LINK_KM) parent[find(i)] = find(j);
const groups = new Map<number, Pt[]>();
pts.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));
const clusters = [...groups.values()].map((g) => {
  const lat = g.reduce((s, p) => s + p.lat, 0) / g.length;
  const lon = g.reduce((s, p) => s + p.lon, 0) / g.length;
  const built = g.map((p) => p.built).filter((b): b is string => !!b).sort();
  return { lat, lon, pts: g, turbines: g.length, radiusKm: Math.max(...g.map((p) => km({ lat, lon }, p))), built: built.length ? `${built[0]}–${built.at(-1)}` : "?" };
});

// Konumu kayıtlı santraller (havuz tanımı; ilçe merkezi tahmini sayılmaz)
const located: Array<{ id: number; name: string; lat: number; lon: number; source: string }> = [];
for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  const l = info?.location;
  if (l && l.locationSource !== "DISTRICT_CENTER") located.push({ id, name: info?.name ?? `#${id}`, lat: l.latitude, lon: l.longitude, source: l.locationSource });
}

const rows = await prisma.powerPlant.findMany({
  where: { type: "RES", projectId: { not: null }, epiasPlantId: { not: null }, OR: [{ locationSource: "DISTRICT_CENTER" }, { locationSource: null }] },
  select: { epiasPlantId: true, name: true, capacityMw: true, capacitySource: true, latitude: true, longitude: true, locationRef: true },
});
const targets = [...new Map(rows.filter((r) => !isUnlicensedName(r.name)).map((r) => [r.epiasPlantId!, r])).values()].sort((a, b) => (b.capacityMw ?? 0) - (a.capacityMw ?? 0));

const out = [];
for (const t of targets) {
  if (t.latitude == null || t.longitude == null) {
    console.log(`\n#${t.epiasPlantId} ${t.name}: tahmini nokta yok, aranamadı`);
    continue;
  }
  const here = { lat: t.latitude, lon: t.longitude };
  const radius = /il merkezi/.test(t.locationRef ?? "") ? RADIUS_KM * 2 : RADIUS_KM;
  const cap = t.capacityMw ?? 0;
  const want = cap ? { min: Math.max(1, Math.floor(cap / 5)), max: Math.ceil(cap / 1.5) } : null;
  const cands = clusters
    .map((c) => {
      const takenBy = located.filter((l) => l.id !== t.epiasPlantId && c.pts.some((p) => km(p, l) <= TAKEN_KM));
      const fits = want ? c.turbines >= want.min && c.turbines <= want.max : true;
      return { ...c, distKm: km(here, c), takenBy, fits };
    })
    .filter((c) => c.distKm <= radius)
    .sort((a, b) => Number(a.takenBy.length > 0) - Number(b.takenBy.length > 0) || Number(b.fits) - Number(a.fits) || a.distKm - b.distKm);
  const free = cands.filter((c) => !c.takenBy.length);
  console.log(
    `\n#${t.epiasPlantId} ${t.name} · ${cap ? cap.toFixed(1) : "?"} MW (${t.capacitySource ?? "?"}) · beklenen türbin ${want ? `${want.min}–${want.max}` : "?"} · ${radius} km içinde ${cands.length} küme, boş ${free.length}`
  );
  for (const c of cands.slice(0, SHOW))
    console.log(
      `   ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)} · ${c.turbines} türbin · ${c.distKm.toFixed(1)} km · yarıçap ${c.radiusKm.toFixed(1)} km · kurulum ${c.built}${c.fits ? "" : " · sayı uymuyor"}${c.takenBy.length ? ` · DOLU: ${c.takenBy.map((l) => `${l.name} (${l.source})`).join(", ")}` : ""}`
    );
  out.push({ epiasPlantId: t.epiasPlantId, name: t.name, capacityMw: cap, expected: want, candidates: cands.slice(0, SHOW).map((c) => ({ lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), turbines: c.turbines, distKm: +c.distKm.toFixed(1), built: c.built, fits: c.fits, takenBy: c.takenBy.map((l) => l.name) })) });
}
const j = process.argv.indexOf("--json");
if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify({ source: doc.version, linkKm: LINK_KM, radiusKm: RADIUS_KM, plants: out }, null, 1));
await prisma.$disconnect();
