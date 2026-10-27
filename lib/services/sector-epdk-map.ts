/**
 * TR-Energy Analyst - Sektör il haritası verisi: EPDK lisanslarının il toplamları (hesap lib/sector/epdk-by-province.ts)
 * Dosya yoksa o tür null döner (kaynak: scripts/tools/epdk-licenses-extract.py).
 */

import { promises as fs } from "fs";
import path from "path";
import { TR_PROVINCES } from "@/components/ui/turkiye-map-data";
import { aggregateByProvince, EPDK_MAP_TECHS, normalizeIl, type EpdkMapTech, type EpdkProvinceMap, type EpdkRow } from "@/lib/sector/epdk-by-province";

const FILE: Record<EpdkMapTech, string> = { GES: "solar-licenses.json", RES: "res-licenses.json", HES: "hes-licenses.json" };

export interface SectorEpdkMap {
  provinces: Array<{ plate: string; name: string }>;
  techs: Record<EpdkMapTech, (EpdkProvinceMap & { exportedAt: string | null }) | null>;
}

export async function loadSectorEpdkMap(): Promise<SectorEpdkMap> {
  const plateByName = new Map(TR_PROVINCES.map((p) => [normalizeIl(p.name), p.plate] as const));
  const techs = {} as SectorEpdkMap["techs"];
  for (const tech of EPDK_MAP_TECHS) {
    try {
      const file = JSON.parse(await fs.readFile(path.join(process.cwd(), ".cache", "epdk", FILE[tech]), "utf8")) as { exportedAt?: string; licenses: EpdkRow[] };
      techs[tech] = { ...aggregateByProvince(file.licenses, tech, plateByName), exportedAt: file.exportedAt ?? null };
    } catch {
      techs[tech] = null;
    }
  }
  return { provinces: TR_PROVINCES.map((p) => ({ plate: p.plate, name: p.name })), techs };
}
