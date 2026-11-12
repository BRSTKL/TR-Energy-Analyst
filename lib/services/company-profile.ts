/**
 * TR-Energy Analyst - Şirket profili (/sirketler): sektör karnesindeki santraller sahip şirkete göre (diskten)
 *
 * Kaynak: seçilen yılın sektör karnesi (`.cache/epias/sector-<yıl>.json`: sahip şirket, üretim, dengesizlik, KÜPST, sapma).
 * Kurulu güç CLAUDE.md "Kurulu güç" kuralıyla çözülür (YEKDEM → EPDK lisansı → en yüksek saatlik üretim, alt sınır); ölçülen
 * en yüksek üretim karnenin kendi dönemindekidir (havuz yeniden okunmaz). YEKDEM durumu lib/services/yekdem-exit.ts.
 * Toplama lib/analysis/company-profile.ts (santral toplamı). Profilde ayrıca şirket içi netleşmiş dengesizlik
 * (lib/analysis/company-netting.ts): karnenin saatlik serileri (`sector-<yıl>-hourly`) ve veritabanındaki piyasa fiyatlarıyla,
 * karneyle aynı motor (`processHourlyRecord`, varsayılan profil); toplayıcı portföyündeki santraller
 * (`aggregator-membership.json`) netleşmeye katılmaz. EPİAŞ'a yalnız kurulu güç / YEKDEM listeleri önbellekte yoksa gider.
 * Yıl başına 30 dakika bellekte; netleşme şirket başına istenince hesaplanır ve aynı süre tutulur. Santral listesi (pahalı
 * kısım: kurulu güç ve YEKDEM eşleştirmesi) ayrıca diskte tutulur (`.cache/responses/_companies`); sürümü karne, şirket dizini
 * ve toplayıcı üyelik dosyalarının değişme anı ile gündür (kurulu güç / YEKDEM kayıtları günde bir yenilenir). Önbellek ısıtma
 * (scripts/warm-cache.mts) bunu ayrı süreçte kurar; web süreci diskten okur. Hatalı (eksik kayıtla) kurulan liste diske yazılmaz.
 *
 * Sınır: toplayıcıya geçen santral EPİAŞ'ta toplayıcının altında listelenir; karnede sahibi görünmeyen santral şirkete
 * girmez (`unknown`). Lisanssız toplamlar (K3_, LÜM_, LÜY) ve karnenin kalite süzgecinde elenen santraller yoktur.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, type SystemDirection } from "@/lib/calculations/types";
import { companyNetting, type CompanyNetting, type NettingRow } from "@/lib/analysis/company-netting";
import { buildCompanies, companyRank, type CompanyIndex, type CompanyPlant, type CompanyRow, type CompanyTech } from "@/lib/analysis/company-profile";
import { CAPACITY_SOURCE_LABEL, isRecordedCapacity } from "@/lib/epias-plant/installed-capacity";
import { prisma } from "@/lib/prisma";
import { decodeHourly } from "@/lib/sector/hourly-store";
import { loadAggregatorMembership } from "@/lib/services/aggregator-membership";
import { resolveInstalledCapacities } from "@/lib/services/installed-capacity";
import { persistedJson } from "@/lib/services/response-cache";
import { availableSectorYears, loadSectorBenchmark, loadSectorHourly, loadSectorPlants } from "@/lib/services/sector";
import { loadYekdemExitIndex } from "@/lib/services/yekdem-exit";

const TTL_MS = 30 * 60_000;
const memo = new Map<number, { at: number; promise: Promise<CompanyData> }>();

export interface CompanyData {
  year: number;
  years: number[];
  /** Karnenin veri dönemi (YYYY-AA-GG) */
  period: { start: string; end: string };
  index: CompanyIndex;
  /** Toplayıcı üyelik listesinin tarihi; liste yoksa null */
  membershipAsOf: string | null;
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
  /** Şirket içi netleşmiş dengesizlik; hesaplanamadıysa null ve nedeni `errors`'ta */
  netting: CompanyNetting | null;
  errors: string[];
}

interface CompanyBase {
  period: { start: string; end: string };
  plants: CompanyPlant[];
  membershipAsOf: string | null;
  errors: string[];
}

/** Disk sürümü: kaynak dosyaların değişme anı ve gün */
async function baseVersion(year: number, now: number): Promise<string> {
  const dir = path.join(process.cwd(), ".cache", "epias");
  const stamps = await Promise.all(
    [`sector-${year}.json`, `plant-owners-${year}.json`, "aggregator-membership.json"].map((f) =>
      fs.stat(path.join(dir, f)).then(
        (st) => Math.round(st.mtimeMs),
        () => 0
      )
    )
  );
  return `${stamps.join(":")}:${new Date(now).toISOString().slice(0, 10)}`;
}

async function build(year: number, years: number[], now: number): Promise<CompanyData> {
  const base = await persistedJson(
    "_companies",
    `plants-${year}`,
    await baseVersion(year, now),
    () => buildBase(year),
    (b) => b.errors.length === 0
  );
  return { year, years, period: base.period, index: buildCompanies(base.plants), membershipAsOf: base.membershipAsOf, errors: base.errors };
}

async function buildBase(year: number): Promise<CompanyBase> {
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

  const membership = await loadAggregatorMembership().catch(() => null);
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
    aggregator: membership?.byPlant.get(p.epiasPlantId)?.map((a) => a.name).join(" / ") || null,
  }));
  return {
    period: bench.period ?? { start: `${year}-01-01`, end: `${year}-12-31` },
    plants,
    membershipAsOf: membership?.asOf ?? null,
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
  const promise = build(year, years, now);
  memo.set(year, { at: now, promise });
  promise.catch(() => {
    if (memo.get(year)?.promise === promise) memo.delete(year);
  });
  return promise;
}

type MarketRow = { timestamp: Date; ptf: number; smf: number; systemDirection: string; imbalancePosPrice: number | null; imbalanceNegPrice: number | null };
const marketMemo = new Map<string, { at: number; promise: Promise<Map<number, MarketRow>> }>();

/** Dönemin piyasa fiyatları (saat → kayıt); karneyle aynı kaynak (veritabanı) */
function loadMarket(period: { start: string; end: string }, now = Date.now()): Promise<Map<number, MarketRow>> {
  const key = `${period.start}|${period.end}`;
  const hit = marketMemo.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.promise;
  const promise = prisma.marketData
    .findMany({
      where: { timestamp: { gte: new Date(`${period.start}T00:00:00Z`), lte: new Date(`${period.end}T23:00:00Z`) } },
      select: { timestamp: true, ptf: true, smf: true, systemDirection: true, imbalancePosPrice: true, imbalanceNegPrice: true },
    })
    .then((rows) => new Map(rows.map((m) => [m.timestamp.getTime(), m as MarketRow])));
  marketMemo.set(key, { at: now, promise });
  promise.catch(() => {
    if (marketMemo.get(key)?.promise === promise) marketMemo.delete(key);
  });
  return promise;
}

const nettingMemo = new Map<string, { at: number; promise: Promise<CompanyNetting> }>();

async function buildNetting(data: CompanyData, plants: CompanyPlant[]): Promise<CompanyNetting> {
  const market = await loadMarket(data.period);
  if (!market.size) throw new Error("dönemin piyasa fiyatları veritabanında yok");
  const cost = (rows: NettingRow[]) => {
    let costTl = 0;
    let mwh = 0;
    for (const r of rows) {
      const m = market.get(r.timestamp.getTime());
      if (!m) continue;
      costTl += processHourlyRecord(
        r,
        { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice },
        DEFAULT_IMBALANCE_PROFILE
      ).imbalanceCost;
      mwh += r.actualMwh;
    }
    return { costTl, mwh };
  };
  const series = await Promise.all(
    plants.map(async (p) => {
      const s = await loadSectorHourly(data.year, p.id).catch(() => null);
      return { id: p.id, aggregator: p.aggregator ?? null, rows: s ? decodeHourly(s) : null };
    })
  );
  return companyNetting(series, cost, data.membershipAsOf);
}

export async function loadCompanyProfile(slug: string, yearParam?: number | null, now = Date.now()): Promise<CompanyProfile | null> {
  const data = await loadCompanies(yearParam);
  const hit = data?.index.bySlug.get(slug);
  if (!data || !hit) return null;
  const errors = data.errors.slice();
  const key = `${data.year}|${slug}`;
  let cached = nettingMemo.get(key);
  if (!cached || now - cached.at >= TTL_MS) {
    cached = { at: now, promise: buildNetting(data, hit.plants) };
    nettingMemo.set(key, cached);
    if (nettingMemo.size > 200) nettingMemo.delete(nettingMemo.keys().next().value as string);
  }
  let netting: CompanyNetting | null = null;
  try {
    netting = await cached.promise;
  } catch (e) {
    if (nettingMemo.get(key) === cached) nettingMemo.delete(key);
    errors.push(`Netleşmiş maliyet hesaplanamadı (${e instanceof Error ? e.message : "veri okunamadı"})`);
  }
  return {
    year: data.year,
    years: data.years,
    period: data.period,
    company: hit.row,
    rank: companyRank(data.index.rows, slug),
    plants: hit.plants,
    netting,
    errors,
  };
}
