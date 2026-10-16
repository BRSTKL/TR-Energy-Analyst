/**
 * TR-Energy Analyst - EPDK lisans listeleri (kullanıcının EPDK sorgu dışa aktarımları; Bekleyen işler: EPDK ↔ karne)
 *
 * `.cache/epdk/solar-licenses.json` (GES), `res-licenses.json`, `hes-licenses.json` (scripts/tools/epdk-licenses-extract.py).
 * Dosya yoksa o tür atlanır. Yalnız ad ve tür döner (tür belirleme: lib/sector/plant-technology.ts).
 */

import fs from "node:fs";
import path from "node:path";
import type { EpdkLicenseLite } from "./plant-technology";

const FILES: Array<[string, EpdkLicenseLite["tech"]]> = [
  ["solar-licenses.json", "GES"],
  ["res-licenses.json", "RES"],
  ["hes-licenses.json", "HES"],
];

export function loadEpdkTechLicenses(dir = path.join(process.cwd(), ".cache", "epdk")): EpdkLicenseLite[] {
  const out: EpdkLicenseLite[] = [];
  for (const [file, tech] of FILES) {
    const f = path.join(dir, file);
    if (!fs.existsSync(f)) continue;
    for (const l of JSON.parse(fs.readFileSync(f, "utf8")).licenses as Array<{ plant: string }>) out.push({ plant: l.plant, tech });
  }
  return out;
}
