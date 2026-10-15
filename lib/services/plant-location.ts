/**
 * TR-Energy Analyst - Santral konumunu kaydetme (PLAN 15.1)
 *
 * Konum EPİAŞ santral kimliğiyle havuzdaki santral tanımına yazılır (projede olmayan sektör santralleri dahil) ve aynı
 * kimlikteki proje santrallerine (`PowerPlant`) kopyalanır. Kural (USER'a dokunulmaz, ilçe merkezi koordinatlı kaydın
 * yerini almaz): lib/epias-plant/location.ts
 */

import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo, writePoolPlantInfo } from "@/lib/pool/pool-store";
import { locationError, shouldReplaceLocation, type PlantLocation } from "@/lib/epias-plant/location";

export interface SetLocationResult {
  epiasPlantId: number;
  /** Havuz tanımına yazıldı mı (false: mevcut konum korundu) */
  pool: boolean;
  /** Güncellenen proje santrali sayısı / korunduğu için atlanan */
  projectPlants: number;
  skippedProjectPlants: number;
}

/** `manual`: kullanıcının kendi girişi (her zaman yazar); değilse otomatik içe aktarma (USER'a dokunmaz) */
export async function setPlantLocation(epiasPlantId: number, loc: PlantLocation, opts: { manual?: boolean } = {}): Promise<SetLocationResult> {
  const err = locationError(loc);
  if (err) throw new Error(`Santral ${epiasPlantId}: ${err}`);
  const value: PlantLocation = { ...loc, locationRef: loc.locationRef.trim() };

  const info = await readPoolPlantInfo(epiasPlantId);
  const pool = shouldReplaceLocation(info?.location, value, opts.manual);
  if (pool) await writePoolPlantInfo({ epiasPlantId, location: value });

  const rows = await prisma.powerPlant.findMany({ where: { epiasPlantId }, select: { id: true, locationSource: true } });
  const update = rows.filter((r) => shouldReplaceLocation(r, value, opts.manual)).map((r) => r.id);
  if (update.length) await prisma.powerPlant.updateMany({ where: { id: { in: update } }, data: value });
  return { epiasPlantId, pool, projectPlants: update.length, skippedProjectPlants: rows.length - update.length };
}

/** Havuzdaki konumu, konumu olmayan (ya da otomatik kaynaklı) proje santrallerine kopyalar: yeni eklenen santraller için */
export async function syncProjectLocations(): Promise<{ updated: number; withoutLocation: number }> {
  const rows = await prisma.powerPlant.findMany({
    where: { epiasPlantId: { not: null } },
    select: { id: true, epiasPlantId: true, locationSource: true, latitude: true, longitude: true, locationRef: true },
  });
  let updated = 0;
  let withoutLocation = 0;
  for (const r of rows) {
    const loc = (await readPoolPlantInfo(r.epiasPlantId!))?.location;
    if (!loc) {
      if (r.latitude === null) withoutLocation++;
      continue;
    }
    const same = r.latitude === loc.latitude && r.longitude === loc.longitude && r.locationSource === loc.locationSource && r.locationRef === loc.locationRef;
    if (same || !shouldReplaceLocation(r, loc)) continue;
    await prisma.powerPlant.update({ where: { id: r.id }, data: loc });
    updated++;
  }
  return { updated, withoutLocation };
}
