/**
 * TR-Energy Analyst - Yeni santral radarı (/yeni-santraller): veri havuzunda ilk üretimi görülen santraller (diskten)
 *
 * Havuzdaki rüzgâr, güneş ve hidro santrallerinin UEVM serisi yıl yıl taranır; ilk dolu saat santralin "ilk üretimi"dir.
 * Seçim ve toplama lib/analysis/new-plants.ts'te. Kurulu güç CLAUDE.md kuralıyla (YEKDEM → EPDK lisansı → en yüksek üretimden alt
 * sınır) ve kaynağıyla; sahip şirket yalnız sektör karnesi ve sahip dizininde olan santrallerde (EPİAŞ yeni santrallerin
 * çoğunun sahibini yayımlamaz). Tarama birkaç saniye sürer: sonuç 6 saat bellekte.
 */

import {
  aggregatorRanking,
  monthKey,
  monthlyNewPlants,
  ownerRanking,
  selectNewPlants,
  totalsOf,
  RADAR_FROM,
  type FirstSeen,
  type AggregatorRow,
  type NewPlant,
  type OwnerRow,
  type RadarMonth,
  type RadarTotals,
  type RadarType,
} from "@/lib/analysis/new-plants";
import { CAPACITY_SOURCE_LABEL, isRecordedCapacity } from "@/lib/epias-plant/installed-capacity";
import { listPoolPlants, readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { loadAggregatorMembership } from "@/lib/services/aggregator-membership";
import { loadNewOwnerEntries, loadOwnerEntries } from "@/lib/services/epias-plants";
import { resolveInstalledCapacities } from "@/lib/services/installed-capacity";
import { sectorFacts } from "@/lib/services/plant-directory";

const HOUR = 3_600_000;
const TTL_MS = 6 * 3_600_000;
const YEARS = [2024, 2025, 2026, 2027];

export interface NewPlantRadar {
  generatedAt: string;
  /** Veri en son bu ay görülüyor (yayımlanmış UEVM); sonraki aylardaki yeni santraller henüz görünmez */
  dataThrough: string | null;
  scanned: number;
  ownersKnown: number;
  months: RadarMonth[];
  totals: RadarTotals;
  last12: RadarTotals;
  plants: NewPlant[];
  /** Sahip şirkete göre devreye giren kapasite; sahibi bilinmeyenler `unknownOwners`'ta */
  owners: OwnerRow[];
  unknownOwners: { plants: number; mw: number };
  /** Toplayıcıya göre devreye giren kapasite; hiçbirinde olmayanlar `noAggregator`'da */
  aggregators: AggregatorRow[];
  noAggregator: { plants: number; mw: number };
  /** Toplayıcı üyelik listesinin tarihi (YYYY-AA-GG); liste yoksa null */
  membershipAsOf: string | null;
}

let memo: { at: number; promise: Promise<NewPlantRadar> } | null = null;

async function scan(): Promise<{ firsts: FirstSeen[]; scanned: number; dataThrough: string | null }> {
  const ids = await listPoolPlants();
  const firsts: FirstSeen[] = [];
  const monthHits = new Map<string, number>();
  let scanned = 0;
  for (let i = 0; i < ids.length; i += 16) {
    await Promise.all(
      ids.slice(i, i + 16).map(async (id) => {
        const info = await readPoolPlantInfo(id).catch(() => null);
        if (!info?.name || !info.type || info.kind) return;
        let firstMs: number | null = null;
        let poolStartMs: number | null = null;
        let peak = 0;
        const months = new Set<string>();
        for (const year of YEARS) {
          const doc = await readPoolYear(id, year).catch(() => null);
          if (!doc) continue;
          const t0 = Date.parse(doc.start);
          if (poolStartMs === null || t0 < poolStartMs) poolStartMs = t0;
          let lastDay = -1;
          for (let k = 0; k < doc.uevm.length; k++) {
            const v = doc.uevm[k];
            if (v === null || !Number.isFinite(v)) continue;
            if (firstMs === null) firstMs = t0 + k * HOUR;
            if (v > peak) peak = v;
            const day = Math.floor(k / 24);
            if (day !== lastDay) {
              lastDay = day;
              months.add(monthKey(t0 + day * 24 * HOUR));
            }
          }
        }
        scanned++;
        for (const m of months) monthHits.set(m, (monthHits.get(m) ?? 0) + 1);
        if (firstMs !== null && poolStartMs !== null) firsts.push({ id, name: info.name, type: info.type as RadarType, firstMs, peakMwh: peak, poolStartMs });
      })
    );
  }
  const max = Math.max(0, ...monthHits.values());
  const dataThrough = Array.from(monthHits.entries())
    .filter(([, n]) => n >= 0.3 * max)
    .map(([m]) => m)
    .sort()
    .at(-1) ?? null;
  return { firsts, scanned, dataThrough };
}

async function build(now = new Date()): Promise<NewPlantRadar> {
  const { firsts, scanned, dataThrough } = await scan();
  const picked = selectNewPlants(firsts);

  const facts = await sectorFacts();
  const owners = new Map<number, string>();
  for (const year of [2026, 2025]) {
    // Yeni şirketler ayrı dosyada birikir ("EPİAŞ bilgilerini güncelle" ve sahip doldurma); tam dizinden önce okunur
    for (const [id, o] of await loadNewOwnerEntries(year).catch(() => [])) if (!owners.has(id)) owners.set(id, o.organizationName);
    for (const [id, o] of await loadOwnerEntries(year).catch(() => [])) if (!owners.has(id)) owners.set(id, o.organizationName);
  }
  const membership = await loadAggregatorMembership().catch(() => null);
  const ownerOf = (id: number) => facts.get(id)?.owner ?? owners.get(id) ?? null;

  const lastYear = Math.max(2026, ...picked.map((p) => new Date(p.firstMs).getUTCFullYear()));
  const { matches } = await resolveInstalledCapacities(
    picked.map((p) => ({ name: p.name, type: p.type, organizationName: ownerOf(p.id), epiasPlantId: p.id, kgupVersion: null })),
    { start: "2025-01-01", end: `${lastYear}-12-31` }
  );
  const plants: NewPlant[] = picked.map((p, i) => ({
    ...p,
    owner: ownerOf(p.id),
    aggregators: membership?.byPlant.get(p.id)?.map((a) => a.name) ?? [],
    mw: matches[i].mw,
    capacitySource: matches[i].source,
    capacityLabel: CAPACITY_SOURCE_LABEL[matches[i].source],
    recorded: isRecordedCapacity(matches[i].source),
  }));

  const ranking = ownerRanking(plants);
  const aggRanking = aggregatorRanking(plants);
  const toMonth = dataThrough ?? monthKey(now.getTime());
  const months = monthlyNewPlants(plants, monthKey(RADAR_FROM), toMonth);
  const last12From = monthKey(Date.UTC(Number(toMonth.slice(0, 4)), Number(toMonth.slice(5, 7)) - 12, 1));
  return {
    generatedAt: now.toISOString(),
    dataThrough,
    scanned,
    ownersKnown: plants.filter((p) => p.owner).length,
    months,
    totals: totalsOf(plants),
    last12: totalsOf(plants.filter((p) => monthKey(p.firstMs) > last12From)),
    plants,
    owners: ranking.rows,
    unknownOwners: ranking.unknown,
    aggregators: aggRanking.rows,
    noAggregator: aggRanking.none,
    membershipAsOf: membership?.asOf ?? null,
  };
}

export function loadNewPlantRadar(now = Date.now()): Promise<NewPlantRadar> {
  if (memo && now - memo.at < TTL_MS) return memo.promise;
  const promise = build(new Date(now));
  memo = { at: now, promise };
  promise.catch(() => {
    if (memo?.promise === promise) memo = null;
  });
  return promise;
}
