/**
 * TR-Energy Analyst - Şirket profili (/sirketler): sektör karnesindeki santraller sahip şirkete göre (diskten)
 *
 * Kaynak: seçilen yılın sektör karnesi (`.cache/epias/sector-<yıl>.json`: sahip şirket, üretim, dengesizlik, KÜPST, sapma).
 * Kurulu güç CLAUDE.md "Kurulu güç" kuralıyla çözülür (YEKDEM → EPDK lisansı → en yüksek saatlik üretim, alt sınır); ölçülen
 * en yüksek üretim karnenin kendi dönemindekidir (havuz yeniden okunmaz). YEKDEM durumu lib/services/yekdem-exit.ts.
 * Toplama lib/analysis/company-profile.ts (santral toplamı; şirket içi netleşme yok). EPİAŞ'a yalnız kurulu güç / YEKDEM
 * listeleri önbellekte yoksa gider. Yıl başına 30 dakika bellekte.
 *
 * Sınır: toplayıcıya geçen santral EPİAŞ'ta toplayıcının altında listelenir; karnede sahibi görünmeyen santral şirkete
 * girmez (`unknown`). Lisanssız toplamlar (K3_, LÜM_, LÜY) ve karnenin kalite süzgecinde elenen santraller yoktur.
 */

import { buildCompanies, companyRank, type CompanyIndex, type CompanyPlant, type CompanyRow, type CompanyTech } from "@/lib/analysis/company-profile";
import { CAPACITY_SOURCE_LABEL, isRecordedCapacity } from "@/lib/epias-plant/installed-capacity";
import { resolveInstalledCapacities } from "@/lib/services/installed-capacity";
import { availableSectorYears, loadSectorBenchmark, loadSectorPlants } from "@/lib/services/sector";
import { loadYekdemExitIndex } from "@/lib/services/yekdem-exit";

const TTL_MS = 30 * 60_000;
const memo = new Map<number, { at: number; promise: Promise<CompanyData> }>();

export interface CompanyData {
  year: number;
  years: number[];
  /** Karnenin veri dönemi (YYYY-AA-GG) */
  period: { start: string; end: string };
  index: CompanyIndex;
  /** Kurulu güç ya da YEKDEM listesi alınamadıysa nedeni */
  errors: string[];
}

export interface CompanyProfile {
  year: number;
  years: number[];
  period: { start: string; end: string };
  company: CompanyRow;
  rank: { rank: number; of: number } | null;
  plants: CompanyPlant[];
  errors: string[];
}

async function build(year: number, years: number[]): Promise<CompanyData> {
  const bench = await loadSectorBenchmark(year);
  if (!bench) throw new Error(`${year} sektör karnesi yok`);
  const sector = (await loadSectorPlants(bench)).filter((p) => p.type === "RES" || p.type === "GES" || p.type === "HES");
  const errors: string[] = [];

  const caps = await resolveInstalledCapacities(
    sector.map((p) => ({ name: p.name, type: p.type, organizationName: p.organizationName, epiasPlantId: p.epiasPlantId, kgupVersion: null })),
    null,
    sector.map((p) => ({ peakMw: p.peakMw, hours: p.hours }))
  );
  errors.push(...caps.errors);

  let yekdemOf: ((p: (typeof sector)[number]) => string | null) | null = null;
  try {
    const idx = await loadYekdemExitIndex();
    errors.push(...idx.errors);
    yekdemOf = (p) => idx.of({ epiasPlantId: p.epiasPlantId, name: p.name, type: p.type, organizationName: p.organizationName }).status;
  } catch (e) {
    errors.push(`YEKDEM durumu alınamadı (${e instanceof Error ? e.message : "bağlantı"})`);
  }

  const plants: CompanyPlant[] = sector.map((p, i) => ({
    id: p.epiasPlantId,
    name: p.name,
    type: p.type as CompanyTech,
    owner: p.organizationName,
    mw: caps.matches[i].mw,
    recorded: isRecordedCapacity(caps.matches[i].source),
    capacityLabel: CAPACITY_SOURCE_LABEL[caps.matches[i].source],
    actualMwh: p.actualMwh,
    imbalanceCostTl: p.imbalanceCostTl,
    kupstTl: p.kupstTl,
    deviationPct: p.deviationPct,
    rankPct: p.rankPct,
    yekdem: p.yekdem,
    yekdemStatus: yekdemOf ? yekdemOf(p) : null,
  }));
  return {
    year,
    years,
    period: bench.period ?? { start: `${year}-01-01`, end: `${year}-12-31` },
    index: buildCompanies(plants),
    errors: Array.from(new Set(errors)),
  };
}

/** Seçilen yılın (yoksa en yeni karne yılının) şirket dizini; hiç karne yoksa null */
export async function loadCompanies(yearParam?: number | null, now = Date.now()): Promise<CompanyData | null> {
  const years = await availableSectorYears();
  if (!years.length) return null;
  const year = yearParam && years.includes(yearParam) ? yearParam : years[0];
  const hit = memo.get(year);
  if (hit && now - hit.at < TTL_MS) return hit.promise;
  const promise = build(year, years);
  memo.set(year, { at: now, promise });
  promise.catch(() => {
    if (memo.get(year)?.promise === promise) memo.delete(year);
  });
  return promise;
}

export async function loadCompanyProfile(slug: string, yearParam?: number | null): Promise<CompanyProfile | null> {
  const data = await loadCompanies(yearParam);
  const hit = data?.index.bySlug.get(slug);
  if (!data || !hit) return null;
  return {
    year: data.year,
    years: data.years,
    period: data.period,
    company: hit.row,
    rank: companyRank(data.index.rows, slug),
    plants: hit.plants,
    errors: data.errors,
  };
}
