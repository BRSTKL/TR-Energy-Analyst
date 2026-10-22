/**
 * Sektör karnesindeki konumu olan lisanslı güneş santralleri için ERA5 saatlik kar derinliğini (lib/weather/snow.ts) havuza
 * çeker: 2025-01-01'den 6 gün öncesine. 7 günden yeni çekilmiş yıl atlanır. Güneş kayıp üretiminde "kar olası" ayrımı için
 * (scripts/sector-curtailment.mts).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/snow-sync.mts
 */

import fs from "node:fs";
import path from "node:path";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { fetchSnow, readSnowYear, snowYearsFromResponse, writeSnowYear } from "@/lib/weather/snow";

const CACHE = path.join(process.cwd(), ".cache", "epias");
const ids = new Set<number>();
for (const y of [2025, 2026]) {
  const f = path.join(CACHE, `sector-${y}.json`);
  if (!fs.existsSync(f)) continue;
  for (const p of JSON.parse(fs.readFileSync(f, "utf8")).plants as Array<{ epiasPlantId: number; name: string; type: string }>)
    if (p.type === "GES" && !isUnlicensedName(p.name)) ids.add(p.epiasPlantId);
}
const end = new Date(Date.now() + 3 * 3_600_000 - 6 * 86_400_000).toISOString().slice(0, 10);
const fresh = (at?: string) => !!at && Date.now() - Date.parse(at) < 7 * 86_400_000;
let done = 0;
let skipped = 0;
let noLoc = 0;
for (const id of ids) {
  const loc = (await readPoolPlantInfo(id))?.location;
  if (!loc) {
    noLoc++;
    continue;
  }
  const last = await readSnowYear(id, Number(end.slice(0, 4)));
  if (fresh(last?.fetchedAt) && last?.latitude === loc.latitude && last?.longitude === loc.longitude) {
    skipped++;
    continue;
  }
  const res = await fetchSnow(loc.latitude, loc.longitude, "2025-01-01", end);
  for (const doc of snowYearsFromResponse(id, loc.latitude, loc.longitude, res, new Date().toISOString())) await writeSnowYear(doc);
  done++;
}
console.log(`Kar derinliği: ${ids.size} lisanslı güneş santrali, çekilen ${done}, güncel ${skipped}, konumsuz ${noLoc}; ${end}'e kadar`);
