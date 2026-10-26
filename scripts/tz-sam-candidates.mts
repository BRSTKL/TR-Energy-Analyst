/**
 * Konumu tahmini (ilçe / il merkezi) ya da boş olan proje GES'leri için TZ-SAM güneş santrali alanlarından aday listesi.
 * YALNIZ OKUR: konum yazmaz; aday kullanıcı uydu görüntüsünde doğrulayınca `scripts/plant-location.mts set` ile girilir.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/tz-sam-candidates.mts
 *
 * Veri `.cache/tz-sam/solar-tr.json` (scripts/tools/tz-sam-extract.py; kaynaklar/README.md). Aday: mevcut tahmini noktadan
 * RADIUS_KM içinde (il merkezi tahmininde 2 katı) alan. Merkezi, konumu kayıtlı (GEM, OSM ya da elle) başka bir santrale
 * TAKEN_KM'den yakın alan "dolu" işaretlenir. TZ-SAM kapasitesi panel alanından tahmindir; EPDK MWm (DC) ile kıyaslanır,
 * oran 0,5–1,6 dışındaysa "kapasite uymuyor". Santral adı yok: aday kesin eşleşme değildir.
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { strictSameName } from "@/lib/sector/plant-technology";

const RADIUS_KM = 40;
const TAKEN_KM = 1.5;
const SHOW = 4;

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const dy = (a.lat - b.lat) * 110.54;
  const dx = (a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), f), "utf8"));
const doc = read(".cache/tz-sam/solar-tr.json") as { version: string; plants: Array<{ id: string; lat: number; lon: number; mw: number | null; builtAfter: string | null; builtBefore: string | null }> };
const licenses = read(".cache/epdk/solar-licenses.json").licenses as Array<{ plant: string; status: string; mwm: string; mwe: string }>;

const located: Array<{ id: number; name: string; lat: number; lon: number; source: string }> = [];
for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  const l = info?.location;
  if (l && l.locationSource !== "DISTRICT_CENTER") located.push({ id, name: info?.name ?? `#${id}`, lat: l.latitude, lon: l.longitude, source: l.locationSource });
}

const rows = await prisma.powerPlant.findMany({
  where: { type: "GES", projectId: { not: null }, epiasPlantId: { not: null }, OR: [{ locationSource: "DISTRICT_CENTER" }, { locationSource: null }] },
  select: { epiasPlantId: true, name: true, capacityMw: true, latitude: true, longitude: true, locationRef: true },
});
const targets = [...new Map(rows.filter((r) => !isUnlicensedName(r.name)).map((r) => [r.epiasPlantId!, r])).values()].sort((a, b) => (b.capacityMw ?? 0) - (a.capacityMw ?? 0));

for (const t of targets) {
  if (t.latitude == null || t.longitude == null) {
    console.log(`\n#${t.epiasPlantId} ${t.name}: tahmini nokta yok, aranamadı`);
    continue;
  }
  const lic = licenses.filter((l) => l.status === "Yürürlükte" && strictSameName(t.name, l.plant));
  const mwm = lic.length ? Number(lic[0].mwm) : null;
  const here = { lat: t.latitude, lon: t.longitude };
  const radius = /il merkezi/.test(t.locationRef ?? "") ? RADIUS_KM * 2 : RADIUS_KM;
  const cands = doc.plants
    .map((p) => {
      const takenBy = located.filter((l) => l.id !== t.epiasPlantId && km(p, l) <= TAKEN_KM);
      const ratio = mwm && p.mw ? p.mw / mwm : null;
      return { ...p, distKm: km(here, p), takenBy, ratio, fits: ratio === null || (ratio >= 0.5 && ratio <= 1.6) };
    })
    .filter((p) => p.distKm <= radius)
    .sort((a, b) => Number(a.takenBy.length > 0) - Number(b.takenBy.length > 0) || Number(b.fits) - Number(a.fits) || Math.abs(Math.log(a.ratio ?? 1)) - Math.abs(Math.log(b.ratio ?? 1)) || a.distKm - b.distKm);
  console.log(`\n#${t.epiasPlantId} ${t.name} · ${t.capacityMw?.toFixed(1) ?? "?"} MWe${mwm ? ` / ${mwm.toFixed(1)} MWm (EPDK)` : ""} · ${radius} km içinde ${cands.length} alan`);
  for (const c of cands.slice(0, SHOW))
    console.log(
      `   ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)} · ${c.mw?.toFixed(1) ?? "?"} MW${c.ratio ? ` (MWm × ${c.ratio.toFixed(2)})` : ""} · ${c.distKm.toFixed(1)} km · kurulum ${c.builtAfter ?? "?"} – ${c.builtBefore ?? "?"}${c.fits ? "" : " · kapasite uymuyor"}${c.takenBy.length ? ` · DOLU: ${c.takenBy.map((l) => `${l.name} (${l.source})`).join(", ")}` : ""}`
    );
}
await prisma.$disconnect();
