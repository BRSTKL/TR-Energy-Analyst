/**
 * TR-Energy Analyst - Aday santral taraması için veri (PLAN 4.2)
 *
 * Projenin portföyü (tek dengede) ile aynı yılın sektör karnesindeki santrallerin saatlik serileri karşılaştırılır.
 * Portföy üyeleri raporun adil pay slaytıyla aynıdır: toplayıcıda santral sahipleri, tek şirkette santraller, birden
 * çok şirkette şirketler; her üyenin serisi kendi içinde netleşmiştir. Projede ya da toplayıcının EPİAŞ portföyünde
 * zaten olan santraller aday sayılmaz. Saatlik sektör verisi scripts/sector-collect.mts ile toplanır.
 */

import { isYekdemExiting, YEKDEM_EXIT_LABEL } from "@/lib/analysis/yekdem-exit";
import { loadYekdemExitIndex } from "@/lib/services/yekdem-exit";
import { classifyCandidate, groupCounts, type CandidateAccessKind } from "@/lib/analysis/candidate-access";
import { loadAggregatorMembership } from "@/lib/services/aggregator-membership";
import { loadOwnerEntries } from "@/lib/services/epias-plants";
import { screenCandidates, type CandidateSort, type ScreeningCandidate, type ScreeningMember, type ScreeningResult } from "@/lib/analysis/candidate-screening";
import { settleByCompany } from "@/lib/report/plant-report";
import { decodeHourly } from "@/lib/sector/hourly-store";
import { sectorPeriodLabel, SECTOR_TECHS, type SectorTech } from "@/lib/sector/benchmark";
import { listSectorHourlyIds, loadSectorBenchmark, loadSectorHourly } from "@/lib/services/sector";
import { loadProjectHourly, type ProjectHourly } from "@/lib/services/project-hourly";
import fs from "node:fs";
import path from "node:path";
import type { ContractFormStats } from "@/lib/analysis/contract-pricing";
import type { PremiumBacktestStats } from "@/lib/analysis/sector-backtest";
import { macroSeries } from "@/lib/macro/series";
import { averagePriceLevel, latestMonth, monthLabelTr, monthsBetween } from "@/lib/macro/price-units";

/**
 * YEKDEM süzgeci: hepsi, yalnız YEKDEM dışı (serbest piyasa), yalnız YEKDEM santralleri ya da YEKDEM'den bu yıl çıkan
 * ve süresi bu yıl / yakında dolan santraller (exiting; toplayıcının en doğal hedefi)
 */
export type YekdemFilter = "all" | "exclude" | "only" | "exiting";
/** Ulaşılabilirlik süzgeci: hepsi ya da tek bir sınıf ("independent" = hedef: toplayıcısız, bağımsız) */
export type AccessFilter = "all" | CandidateAccessKind;

export interface ProjectCandidates {
  project: { id: string; name: string };
  year: number;
  /** Sektör karnesinin dönemi: "2026 (Ocak–Ağustos)" */
  sectorLabel: string;
  /** Portföy üyelerinin türü */
  basis: "owners" | "plants" | "companies";
  types: SectorTech[];
  yekdem: YekdemFilter;
  access: AccessFilter;
  /** Teknoloji ve YEKDEM süzgecinden geçen adayların ulaşılabilirlik sınıflarına dağılımı (ulaşılabilirlik süzgecinden önce) */
  accessCounts: Record<CandidateAccessKind, number>;
  /** Toplayıcı listelerinin tarihi ve sayısı; toplanmamışsa null (bu durumda "başka toplayıcıda" ayrımı yapılamaz) */
  aggregatorList: { asOf: string; aggregators: number; failed: number } | null;
  /** Aday dışı bırakılanlar: projede olan, toplayıcının EPİAŞ portföyünde olan ve YEKDEM süzgecine takılan santraller */
  excluded: { inProject: number; inAggregatorPortfolio: number; byYekdem: number; byAccess: number };
  /** Sektör karnesinde olup saatlik serisi toplanmamış santral sayısı */
  withoutHourly: number;
  /** YEKDEM çıkış sayımı (teknoloji süzgecinden geçen, projede ve toplayıcı portföyünde olmayan adaylarda); liste alınamadıysa null */
  yekdemExits: { currentYear: number; exited: number; endsThisYear: number; endsSoon: number; mw: number } | null;
  result: ScreeningResult;
  /** Sözleşme fiyatı (PLAN 16.3) için girdiler; teklif sayfada priceContract ile hesaplanır */
  pricing: CandidatePricing;
}

/** Teklif kutusunun girdileri: kötü senaryo oranı, sözleşme biçimi sınaması ve birim çarpanları */
export interface CandidatePricing {
  /** Geçmişle sınamanın dönemi ("2025 → 2026, Ocak–Ağustos"); dosya yoksa null */
  backtestLabel: string | null;
  /** Teknoloji → gerçek / tahmin oranının P90'ı (12.2) */
  worstRatio: Record<string, number>;
  /** Teknoloji → gerçek / tahmin oranının medyanı (12.2): geçen yılın verisiyle fiyatlanan bedelin tipik sapması */
  typicalRatio: Record<string, number>;
  /** Teknoloji (ve ALL) → kâr payı %50'de zarar eden santral payı, sabit TL ve PTF yüzdesi (16.2) */
  contractForms: Record<
    string,
    { n: number; fixedLossPct: number; ptfShareLossPct: number; spreadShareLossPct: number | null; ptfChange: number; spreadChange: number | null }
  >;
  /** Makas endeksli sözleşmenin referansı: projenin dönemindeki piyasa ortalaması |SMF − PTF|, TL/MWh (16.2b) */
  referenceSpreadTl: number | null;
  /** Projenin dönemindeki TL'yi son ayın fiyat düzeyine çeviren çarpan ve etiketi */
  real: { factor: number; label: string } | null;
  /** Projenin dönemindeki TL'yi ABD dolarına çeviren çarpan (dönemin ortalama kuru) */
  usdFactor: number | null;
}

/** Geçmişle sınama dosyası: verinin yılı hedef yıl olan, yoksa bir sonraki yılın (scripts/sector-backtest.mts) */
function loadPricing(year: number, start: string, end: string, referenceSpreadTl: number | null): CandidatePricing {
  let bt: { fromYear: number; toYear: number; months: string; premium: Record<string, PremiumBacktestStats>; contractForms?: Record<string, ContractFormStats> } | null = null;
  for (const y of [year, year + 1]) {
    try {
      bt = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "epias", `sector-backtest-${y}.json`), "utf8"));
      break;
    } catch {
      /* sonraki yıl */
    }
  }
  const series = macroSeries();
  const months = monthsBetween(start, end);
  const level = averagePriceLevel(series, months);
  const base = latestMonth(series.cpi);
  const usd = months.map((m) => series.usdTry[m]).filter((v) => v > 0);
  return {
    backtestLabel: bt ? `${bt.fromYear} → ${bt.toYear}, ${bt.months}` : null,
    worstRatio: bt ? Object.fromEntries(Object.entries(bt.premium).map(([t, s]) => [t, s.ratio.p90])) : {},
    typicalRatio: bt ? Object.fromEntries(Object.entries(bt.premium).map(([t, s]) => [t, s.ratio.p50])) : {},
    contractForms: bt?.contractForms
      ? Object.fromEntries(
          Object.entries(bt.contractForms).map(([t, s]) => [
            t,
            {
              n: s.n,
              fixedLossPct: s.forms.fixed.lossSharePct["0.5"],
              ptfShareLossPct: s.forms.ptfShare.lossSharePct["0.5"],
              // Eski önbellekte makas endeksi yok (16.2b öncesi)
              spreadShareLossPct: s.forms.spreadShare?.lossSharePct["0.5"] ?? null,
              ptfChange: s.ptfChangeMedian,
              spreadChange: s.spreadChangeMedian ?? null,
            },
          ])
        )
      : {},
    real: level && base ? { factor: series.cpi[base] / level, label: `${monthLabelTr(base)} TL'si` } : null,
    usdFactor: usd.length ? 1 / (usd.reduce((a, v) => a + v, 0) / usd.length) : null,
    referenceSpreadTl,
  };
}

type Plant = ProjectHourly["plants"][number];
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Raporun adil pay slaytıyla aynı üyeler (verilen santrallerden) */
function members(data: ProjectHourly, withData: Plant[]): { basis: ProjectCandidates["basis"]; members: ScreeningMember[] } {
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
    access = "all",
  }: { types?: SectorTech[]; top?: number; sortBy?: CandidateSort; yekdem?: YekdemFilter; access?: AccessFilter } = {}
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
  // Lisanssız toplamlar karnenin dağılımında yok (benchmark.ts `unlicensed`) ama aday olarak "Lisanssız / tedarik" süzgecinde
  const benchPool = [...bench.plants, ...(bench.unlicensed ?? [])];
  const open = benchPool.filter((p) => types.includes(p.type) && !inProject.has(p.epiasPlantId) && !inAggregator.has(p.epiasPlantId));
  // YEKDEM çıkışı: iki EPİAŞ YEKDEM listesinden (alınamazsa çıkış bilgisi olmadan devam)
  const exitIndex = await loadYekdemExitIndex().catch((e) => {
    console.error("YEKDEM exit index error:", e);
    return null;
  });
  const exitOf = new Map(
    open.map((p) => {
      const x = exitIndex?.of(p);
      return [p.epiasPlantId, x ? { status: x.status, label: YEKDEM_EXIT_LABEL[x.status], note: x.note, marketFrom: x.marketFrom, licensedMw: x.licensedMw } : null] as const;
    })
  );
  // YEKDEM bilgisi olmayan santral "YEKDEM dışı" süzgecinde kalır, "yalnız YEKDEM"de elenir
  const byYekdem = open.filter((p) => {
    if (yekdem === "exiting") {
      const x = exitOf.get(p.epiasPlantId);
      return !!x && isYekdemExiting(x.status);
    }
    return yekdem === "exclude" ? p.yekdem !== true : yekdem === "only" ? p.yekdem === true : true;
  });

  // Ulaşılabilirlik: başka bir toplayıcıda mı (EPİAŞ toplayıcı listeleri), grupta mı (sahip dizini), bağımsız mı
  const [membership, ownerEntries] = await Promise.all([loadAggregatorMembership(), loadOwnerEntries(year)]);
  const owners = new Map(ownerEntries);
  const ownOrgId = data.aggregator?.portfolio?.orgId ?? null;
  const aggregatorOf = new Map<number, string>();
  for (const [plantId, list] of membership?.byPlant ?? []) {
    const others = list.filter((a) => a.id !== ownOrgId);
    if (others.length) aggregatorOf.set(plantId, others.map((a) => a.name).join(", "));
  }
  const ctx = { aggregatorOf, groups: groupCounts(owners.values()) };
  const accessOf = new Map(
    byYekdem.map((p) => [
      p.epiasPlantId,
      classifyCandidate(
        { epiasPlantId: p.epiasPlantId, name: p.name, organizationId: owners.get(p.epiasPlantId)?.organizationId ?? null, organizationName: p.organizationName },
        ctx
      ),
    ])
  );
  const accessCounts: Record<CandidateAccessKind, number> = { independent: 0, group: 0, aggregator: 0, retail: 0, unknown: 0 };
  for (const a of accessOf.values()) accessCounts[a.kind]++;
  const pool = byYekdem.filter((p) => access === "all" || accessOf.get(p.epiasPlantId)!.kind === access);
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
      access: accessOf.get(p.epiasPlantId) ?? null,
      yekdemExit: exitOf.get(p.epiasPlantId) ?? null,
      rows: decodeHourly(series),
    });
  }

  // Portföyün tüm santralleri netleşir (YEKDEM santrallerinin dengesizliği de kendilerine aittir)
  const m = members(data, withData);
  return {
    project: data.project,
    year,
    sectorLabel: sectorPeriodLabel(bench),
    basis: m.basis,
    types,
    yekdem,
    access,
    accessCounts,
    aggregatorList: membership ? { asOf: membership.asOf, aggregators: membership.aggregatorCount, failed: membership.failedCount } : null,
    excluded: {
      inProject: benchPool.filter((p) => inProject.has(p.epiasPlantId)).length,
      inAggregatorPortfolio: benchPool.filter((p) => !inProject.has(p.epiasPlantId) && inAggregator.has(p.epiasPlantId)).length,
      byYekdem: open.length - byYekdem.length,
      byAccess: byYekdem.length - pool.length,
    },
    withoutHourly,
    yekdemExits: exitIndex
      ? (() => {
          const xs = open.map((p) => ({ x: exitOf.get(p.epiasPlantId), mw: p.peakMw })).filter((r) => r.x && isYekdemExiting(r.x.status));
          return {
            currentYear: exitIndex.currentYear,
            exited: xs.filter((r) => r.x!.status === "EXITED").length,
            endsThisYear: xs.filter((r) => r.x!.status === "ENDS_THIS_YEAR").length,
            endsSoon: xs.filter((r) => r.x!.status === "ENDS_SOON").length,
            mw: xs.reduce((a, r) => a + (r.x!.licensedMw ?? r.mw), 0),
          };
        })()
      : null,
    result: screenCandidates(m.members, candidates, data.profile, { top, sortBy }),
    pricing: (() => {
      const ts = withData.flatMap((p) => [new Date(p.hourly[0].timestamp).getTime(), new Date(p.hourly[p.hourly.length - 1].timestamp).getTime()]);
      // Piyasa makası portföyün saatlerinden (her saat bir kez)
      const spread = new Map<number, number>();
      for (const p of withData) for (const h of p.hourly) spread.set(new Date(h.timestamp).getTime(), Math.abs(h.smf - h.ptf));
      const ref = spread.size ? Array.from(spread.values()).reduce((a, b) => a + b, 0) / spread.size : null;
      return loadPricing(year, iso(Math.min(...ts)), iso(Math.max(...ts)), ref);
    })(),
  };
}
