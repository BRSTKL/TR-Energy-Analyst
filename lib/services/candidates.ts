/**
 * TR-Energy Analyst - Aday santral taraması için veri (PLAN 4.2)
 *
 * Projenin portföyü (tek dengede) ile aynı yılın sektör karnesindeki santrallerin saatlik serileri karşılaştırılır.
 * Portföy üyeleri raporun adil pay slaytıyla aynıdır: toplayıcıda santral sahipleri, tek şirkette santraller, birden
 * çok şirkette şirketler; her üyenin serisi kendi içinde netleşmiştir. Projede ya da toplayıcının EPİAŞ portföyünde
 * zaten olan santraller aday sayılmaz. Saatlik sektör verisi scripts/sector-collect.mts ile toplanır.
 */

import { screenCandidates, type CandidateSort, type ScreeningCandidate, type ScreeningMember, type ScreeningResult } from "@/lib/analysis/candidate-screening";
import { settleByCompany } from "@/lib/report/plant-report";
import { decodeHourly } from "@/lib/sector/hourly-store";
import { sectorPeriodLabel, SECTOR_TECHS, type SectorTech } from "@/lib/sector/benchmark";
import { listSectorHourlyIds, loadSectorBenchmark, loadSectorHourly } from "@/lib/services/sector";
import { loadProjectHourly, type ProjectHourly } from "@/lib/services/project-hourly";

/** YEKDEM süzgeci: hepsi, yalnız YEKDEM dışı (serbest piyasa) ya da yalnız YEKDEM santralleri */
export type YekdemFilter = "all" | "exclude" | "only";

export interface ProjectCandidates {
  project: { id: string; name: string };
  year: number;
  /** Sektör karnesinin dönemi: "2026 (Ocak–Ağustos)" */
  sectorLabel: string;
  /** Portföy üyelerinin türü */
  basis: "owners" | "plants" | "companies";
  types: SectorTech[];
  yekdem: YekdemFilter;
  /** Aday dışı bırakılanlar: projede olan, toplayıcının EPİAŞ portföyünde olan ve YEKDEM süzgecine takılan santraller */
  excluded: { inProject: number; inAggregatorPortfolio: number; byYekdem: number };
  /** Sektör karnesinde olup saatlik serisi toplanmamış santral sayısı */
  withoutHourly: number;
  result: ScreeningResult;
}

type Plant = ProjectHourly["plants"][number];

/** Raporun adil pay slaytıyla aynı üyeler */
function members(data: ProjectHourly): { basis: ProjectCandidates["basis"]; members: ScreeningMember[] } {
  const withData = data.plants.filter((p) => p.hourly.length > 0);
  const companies = new Set(withData.map((p) => (p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`)));
  const basis: ProjectCandidates["basis"] = data.aggregator ? "owners" : companies.size === 1 ? "plants" : "companies";
  const groups = new Map<string, { name: string; plants: Plant[] }>();
  for (const p of withData) {
    const id = basis === "owners" && p.ownerOrganizationId !== undefined ? p.ownerOrganizationId : p.organizationId;
    const name = basis === "owners" && p.ownerName !== undefined ? p.ownerName : p.organizationName;
    const [key, label] =
      basis === "plants" || id === null ? [`plant:${p.plantId}`, p.plantName] : [`org:${id}`, name ?? `Şirket ${id}`];
    const g = groups.get(key) ?? { name: label, plants: [] };
    g.plants.push(p);
    groups.set(key, g);
  }
  return {
    basis,
    members: Array.from(groups.entries()).map(([key, g]) => ({
      key,
      name: g.name,
      plantType: g.plants[0].plantType,
      hourly: settleByCompany(g.plants.map((p) => ({ ...p, organizationId: 0 })), data.profile),
    })),
  };
}

export async function projectCandidates(
  projectId: string,
  {
    types = SECTOR_TECHS,
    top = 10,
    sortBy = "total",
    yekdem = "all",
  }: { types?: SectorTech[]; top?: number; sortBy?: CandidateSort; yekdem?: YekdemFilter } = {}
): Promise<ProjectCandidates | { error: string }> {
  const data = await loadProjectHourly(projectId);
  if (!data) return { error: "Proje bulunamadı." };
  const withData = data.plants.filter((p) => p.hourly.length > 0);
  if (withData.length === 0) return { error: "Projede piyasa fiyatı eşleşmiş saatlik veri yok." };
  const year = new Date(withData[0].hourly[0].timestamp).getUTCFullYear();
  const collect = `node --env-file=.env node_modules/.bin/tsx scripts/sector-collect.mts ${year}`;

  const bench = await loadSectorBenchmark(year);
  if (!bench) return { error: `${year} sektör karnesi toplanmamış. Toplamak için: ${collect}` };
  const hourlyIds = new Set(await listSectorHourlyIds(year));
  if (hourlyIds.size === 0) return { error: `${year} sektör karnesinin saatlik serisi yok (aday taraması için gerekli). Toplamak için: ${collect}` };

  const inProject = new Set(withData.map((p) => p.epiasPlantId).filter((id): id is number => id !== null));
  const inAggregator = new Set(data.aggregator?.portfolio?.plantIds ?? []);
  const open = bench.plants.filter((p) => types.includes(p.type) && !inProject.has(p.epiasPlantId) && !inAggregator.has(p.epiasPlantId));
  // YEKDEM bilgisi olmayan santral "YEKDEM dışı" süzgecinde kalır, "yalnız YEKDEM"de elenir
  const pool = open.filter((p) => (yekdem === "exclude" ? p.yekdem !== true : yekdem === "only" ? p.yekdem === true : true));
  const candidates: ScreeningCandidate[] = [];
  let withoutHourly = 0;
  for (const p of pool) {
    const series = hourlyIds.has(p.epiasPlantId) ? await loadSectorHourly(year, p.epiasPlantId) : null;
    if (!series) {
      withoutHourly++;
      continue;
    }
    candidates.push({
      key: `epias:${p.epiasPlantId}`,
      epiasPlantId: p.epiasPlantId,
      name: p.name,
      type: p.type,
      organizationName: p.organizationName,
      yekdem: p.yekdem,
      hydroKind: p.hydroKind ?? null,
      rows: decodeHourly(series),
    });
  }

  const m = members(data);
  return {
    project: data.project,
    year,
    sectorLabel: sectorPeriodLabel(bench),
    basis: m.basis,
    types,
    yekdem,
    excluded: {
      inProject: bench.plants.filter((p) => inProject.has(p.epiasPlantId)).length,
      inAggregatorPortfolio: bench.plants.filter((p) => !inProject.has(p.epiasPlantId) && inAggregator.has(p.epiasPlantId)).length,
      byYekdem: open.length - pool.length,
    },
    withoutHourly,
    result: screenCandidates(m.members, candidates, data.profile, { top, sortBy }),
  };
}
