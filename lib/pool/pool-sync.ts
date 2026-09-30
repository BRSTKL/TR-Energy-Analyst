/**
 * TR-Energy Analyst - Veri havuzu: eksik tamamlama (PLAN 7.2)
 *
 * Bir santral ve dönem istendiğinde önce havuza bakılır. Havuzda olmayan ya da geçici (yeniden kontrol zamanı
 * gelmiş) aylar EPİAŞ'tan çekilir ve havuza yazılır; diğer aylar havuzdan okunur. Her ay çekilir çekilmez diske
 * yazılır: EPİAŞ yarıda keserse (403) başarılı aylar kaybolmaz, tekrar çağrı kaldığı yerden devam eder.
 * KGÜP santralin uzlaştırma birimlerinin toplamıdır; birimler ilk çekimde EPİAŞ'tan alınıp santral tanımına yazılır.
 */

import { fetchKgup, fetchUevm, listUevcbsForPlant } from "@/lib/services/epias-plants";
import { parseKgupItems, parseUevmItems, sumSeries, type HourlySeries, type KgupVersion } from "@/lib/epias-plant/plant-data";
import { emptyYear, fuelInRange, monthsInRange, needsFetch, readRange, writeMonth, type PoolSeries, type PoolYear } from "./pool-codec";
import { readPoolPlantInfo, readPoolYear, writePoolPlantInfo, writePoolYear, type PoolPlantInfo } from "./pool-store";

export interface PoolFetchers {
  listUevcbs: (powerPlantId: number, onDay: string) => Promise<Array<{ id: number; name: string; eic?: string | null }>>;
  kgup: (uevcbId: number, startDay: string, endDay: string, version: KgupVersion) => Promise<Array<Record<string, unknown>>>;
  uevm: (powerPlantId: number, startDay: string, endDay: string) => Promise<Array<Record<string, unknown>>>;
}

const EPIAS_FETCHERS: PoolFetchers = { listUevcbs: listUevcbsForPlant, kgup: fetchKgup, uevm: fetchUevm };

export type MonthSource = "pool" | "epias" | "failed" | "future";

export interface PlantCoverage {
  epiasPlantId: number;
  uevcbs: NonNullable<PoolPlantInfo["uevcbs"]>;
  months: Array<{ year: number; month: number; source: MonthSource; error?: string }>;
  kgup: HourlySeries;
  uevm: HourlySeries;
}

export const kgupSeriesOf = (version: KgupVersion): PoolSeries => (version === "FIRST" ? "kgupFirst" : "kgupFinal");

const pad = (n: number) => String(n).padStart(2, "0");
/** Türkiye takvim günü (duvar saati) */
const todayTr = (now: Date) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
/** Tür biliniyor ama kaynak kırılımı yoksa (sektör önbelleğinden aktarılan aylar) tür tespiti için eşdeğer kırılım */
const FUEL_OF_TYPE = { RES: "wind", GES: "sun", HES: "river" } as const;

export async function ensurePlantCoverage(
  epiasPlantId: number,
  startDay: string,
  endDay: string,
  version: KgupVersion = "FIRST",
  { now = new Date(), fetchers = EPIAS_FETCHERS }: { now?: Date; fetchers?: PoolFetchers } = {}
): Promise<PlantCoverage> {
  const kSeries = kgupSeriesOf(version);
  const today = todayTr(now);
  const docs = new Map<number, PoolYear | null>();
  const docOf = async (year: number) => {
    if (!docs.has(year)) docs.set(year, await readPoolYear(epiasPlantId, year));
    return docs.get(year) ?? null;
  };

  let info = await readPoolPlantInfo(epiasPlantId);
  const months: PlantCoverage["months"] = [];
  // EPİAŞ hatası çoğu zaman bağlantı veya erişim engelidir (VPN, 403): ilk hatadan sonra kalan aylar denenmez
  let abort: string | null = null;
  for (const { year, month } of monthsInRange(startDay, endDay)) {
    const first = `${year}-${pad(month)}-01`;
    if (first > today) {
      months.push({ year, month, source: "future" });
      continue;
    }
    const doc = await docOf(year);
    const needK = needsFetch(doc, kSeries, month, now);
    const needU = needsFetch(doc, "uevm", month, now);
    if (!needK && !needU) {
      months.push({ year, month, source: "pool" });
      continue;
    }
    if (abort) {
      months.push({ year, month, source: "failed", error: abort });
      continue;
    }
    try {
      if (needK && !info?.uevcbs?.length) {
        const uevcbs = await fetchers.listUevcbs(epiasPlantId, startDay);
        if (!uevcbs.length) throw new Error("Uzlaştırma birimi (UEVÇB) bulunamadı; KGÜP çekilemez.");
        info = await writePoolPlantInfo({ epiasPlantId, uevcbs, uevcbsAt: now.toISOString() });
      }
      const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      const to = last < today ? last : today;
      const [kLists, uItems] = await Promise.all([
        needK ? Promise.all(info!.uevcbs!.map((u) => fetchers.kgup(u.id, first, to, version))) : null,
        needU ? fetchers.uevm(epiasPlantId, first, to) : null,
      ]);
      const target = doc ?? emptyYear(epiasPlantId, year);
      if (kLists) {
        const k = sumSeries(kLists.map(parseKgupItems));
        writeMonth(target, kSeries, month, [...k.values].map(([t, value]) => ({ timestamp: new Date(t), value })), now);
      }
      if (uItems) {
        const u = parseUevmItems(uItems);
        writeMonth(target, "uevm", month, [...u.values].map(([t, value]) => ({ timestamp: new Date(t), value })), now, u.byFuel);
      }
      await writePoolYear(target);
      docs.set(year, target);
      months.push({ year, month, source: "epias" });
    } catch (e) {
      const error = e instanceof Error ? e.message : "EPİAŞ verisi alınamadı.";
      months.push({ year, month, source: "failed", error });
      abort = `Önceki ay başarısız olduğu için denenmedi (${error}).`;
    }
  }

  const all = [...docs.values()].filter((d): d is PoolYear => d !== null);
  const rows = readRange(all, startDay, endDay);
  const kgup: HourlySeries = { values: new Map(), byFuel: {}, skipped: 0 };
  const uevm: HourlySeries = { values: new Map(), byFuel: fuelInRange(all, startDay, endDay), skipped: 0 };
  for (const r of rows) {
    const k = r[kSeries];
    if (k !== null) kgup.values.set(r.timestamp.getTime(), k);
    if (r.uevm !== null) uevm.values.set(r.timestamp.getTime(), r.uevm);
  }
  if (Object.keys(uevm.byFuel).length === 0 && info?.type) {
    let total = 0;
    for (const v of uevm.values.values()) total += v;
    uevm.byFuel = { [FUEL_OF_TYPE[info.type]]: total };
  }
  return { epiasPlantId, uevcbs: info?.uevcbs ?? [], months, kgup, uevm };
}
