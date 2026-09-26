/**
 * TR-Energy Analyst - Dengesizlik Karnesi için EPİAŞ bağlamı ve ön kontrol
 *
 * Rapor, santrallerin sahibi (şirket bazında uzlaştırma) ve YEKDEM durumuna dayanır. Bu modül:
 *   - diskteki şirket dizininden şirketin projede olmayan santrallerini bulur (portföy eksikliği)
 *   - rapor indirilmeden önce gösterilecek uyarıları hazırlar (sahibi bilinmeyen santral, YEKDEM çıkışı bilinmeyen)
 * EPİAŞ'a yalnızca santral adları için (önbellekli liste) bağlanır; bağlantı yoksa adlar yerine kimlikler kullanılır.
 */

import { companyPlantIdsFromCache, listUevmPowerPlants } from "@/lib/services/epias-plants";
import { loadSectorBenchmark } from "@/lib/services/sector";
import type { ReportContext } from "@/lib/report/plant-report";

/** Kontrol için gereken santral bilgisi (saatlik veri gerekmez) */
export interface ReportPlantMeta {
  plantName: string;
  organizationId: number | null;
  organizationName: string | null;
  yekdem: boolean | null;
  yekdemNextYear: boolean | null;
  epiasPlantId: number | null;
}

export interface ReportCheck {
  /** EPİAŞ sahibi bilinmeyen santraller: rapor bunları ayrı şirket sayar */
  unknownOwner: string[];
  /** YEKDEM'de olup sonraki yıl durumu bilinmeyen santraller */
  yekdemNextUnknown: string[];
  /** Şirketin projede olmayan santralleri */
  missing: Array<{ company: string; plants: string[] }>;
}

/**
 * @param plants verisi olan santraller
 * @param year verinin ilk yılı (şirket dizini bu yıl için kurulur)
 */
export async function buildReportContext(plants: ReportPlantMeta[], year: number): Promise<{ context: ReportContext; check: ReportCheck }> {
  const check: ReportCheck = {
    unknownOwner: plants.filter((p) => p.organizationId === null).map((p) => p.plantName),
    yekdemNextUnknown: plants.filter((p) => p.yekdem && p.yekdemNextYear === null).map((p) => p.plantName),
    missing: [],
  };
  const context: ReportContext = { missingCompanyPlants: new Map(), companyPlantTotals: new Map() };
  context.sector = await loadSectorContext(year);

  const byOrg = await companyPlantIdsFromCache(year);
  if (!byOrg) return { context, check };

  const names = await listUevmPowerPlants()
    .then((list) => new Map(list.map((p) => [p.id, p.shortName?.trim() || p.name])))
    .catch(() => null);
  const orgs = new Map<number, { name: string; inProject: Set<number> }>();
  for (const p of plants) {
    if (p.organizationId === null) continue;
    const o = orgs.get(p.organizationId) ?? { name: p.organizationName ?? "", inProject: new Set<number>() };
    if (p.epiasPlantId !== null) o.inProject.add(p.epiasPlantId);
    orgs.set(p.organizationId, o);
  }
  for (const [orgId, o] of orgs) {
    const all = byOrg.get(orgId) ?? [];
    // Yalnızca üretim verisi yayımlanan santraller sayılır (UEVM listesi); liste yoksa hepsi
    const eligible = names ? all.filter((id) => names.has(id)) : all;
    const missingIds = eligible.filter((id) => !o.inProject.has(id));
    const missingNames = missingIds.map((id) => names?.get(id) ?? `Santral #${id}`);
    context.companyPlantTotals!.set(orgId, eligible.length);
    context.missingCompanyPlants!.set(orgId, missingNames);
    if (missingNames.length) check.missing.push({ company: o.name, plants: missingNames });
  }
  return { context, check };
}

/** Sektör karnesi özeti (scripts/sector-collect.mts ile üretilir); yoksa undefined */
async function loadSectorContext(year: number): Promise<ReportContext["sector"]> {
  const bench = await loadSectorBenchmark(year);
  if (!bench) return undefined;
  const byType: NonNullable<ReportContext["sector"]>["byType"] = {};
  for (const type of ["RES", "GES"] as const) {
    const ps = bench.plants.filter((p) => p.type === type);
    byType[type] = {
      unitImbalanceTl: bench.byType[type].unitImbalanceTl,
      unitKupstTl: bench.byType[type].unitKupstTl,
      values: ps.map((p) => p.unitImbalanceTl),
      kupstValues: ps.map((p) => p.unitKupstTl),
    };
  }
  return { year: bench.year, byType };
}
