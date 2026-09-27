/**
 * TR-Energy Analyst - Olası arıza / kısıntı saatleri
 *
 * Tahmin yüksekken üretimin sıfıra yakın olduğu kesintisiz bloklar çoğunlukla tahmin hatası değildir: santral arızası,
 * bakım ya da TEİAŞ yük atma talimatıdır (YAT, santral bazında yayımlanmaz). Bu saatler santralin tahmin kalitesini ve
 * sektör sırasını haksız yere düşürür; ayrıca YAT ise dengesizlik sayılmaz. Modül bu blokları işaretler ve maliyet
 * payını verir; hangi nedenin geçerli olduğu santral işletmecisiyle teyit edilmelidir. SAF: I/O yok.
 *
 * Kural: tahmin ≥ kurulu gücün %30'u ve gerçekleşen ≤ kurulu gücün %2'si olan, en az 3 saat kesintisiz süren blok.
 */

import type { HourlyResult } from "@/lib/calculations/types";

export const OUTAGE_RULE = { minForecastShare: 0.3, maxActualShare: 0.02, minHours: 3 } as const;

export interface OutageEvent {
  /** Bloğun ilk ve son saati (ISO) */
  start: string;
  end: string;
  hours: number;
  /** Plan − gerçekleşen (MWh) */
  lostMwh: number;
  costTl: number;
  /**
   * Aynı saatlerde projedeki başka bir santralde de blok var: farklı santrallerin aynı anda durması arızadan çok
   * sistem geneli kısıntıya (YAT) işaret eder. markConcurrent ile doldurulur.
   */
  concurrent?: boolean;
}

export interface PlantOutages {
  plantName: string;
  events: OutageEvent[];
  hours: number;
  costTl: number;
  /** Santralin tek başına dengesizlik maliyetinin bu saatlerden gelen payı (%) */
  costSharePct: number;
}

const HOUR = 3_600_000;

/**
 * @param capacityMw kurulu güç; 0 ya da bilinmiyorsa dönemdeki en yüksek saatlik üretim kullanılır
 */
export function detectOutages(plantName: string, hourly: HourlyResult[], capacityMw: number): PlantOutages {
  const sorted = [...hourly].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const cap = capacityMw > 0 ? capacityMw : Math.max(0, ...sorted.map((h) => h.actualMwh));
  const totalCost = sorted.reduce((s, h) => s + h.imbalanceCost, 0);
  const events: OutageEvent[] = [];
  if (cap <= 0) return { plantName, events, hours: 0, costTl: 0, costSharePct: 0 };

  const flagged = (h: HourlyResult) => h.forecastMwh >= OUTAGE_RULE.minForecastShare * cap && h.actualMwh <= OUTAGE_RULE.maxActualShare * cap;
  let block: HourlyResult[] = [];
  const close = () => {
    if (block.length >= OUTAGE_RULE.minHours) {
      events.push({
        start: new Date(block[0].timestamp).toISOString(),
        end: new Date(block[block.length - 1].timestamp).toISOString(),
        hours: block.length,
        lostMwh: block.reduce((s, h) => s + (h.forecastMwh - h.actualMwh), 0),
        costTl: block.reduce((s, h) => s + h.imbalanceCost, 0),
      });
    }
    block = [];
  };
  for (const h of sorted) {
    const t = new Date(h.timestamp).getTime();
    const prev = block.length ? new Date(block[block.length - 1].timestamp).getTime() : null;
    if (!flagged(h) || (prev !== null && t - prev !== HOUR)) close();
    if (flagged(h)) block.push(h);
  }
  close();

  const hours = events.reduce((s, e) => s + e.hours, 0);
  const costTl = events.reduce((s, e) => s + e.costTl, 0);
  return { plantName, events, hours, costTl, costSharePct: totalCost > 0 ? (costTl / totalCost) * 100 : 0 };
}

/** Birden çok santralde aynı saatlere düşen blokları işaretler (olası kısıntı); diğerleri olası arızadır */
export function markConcurrent(results: PlantOutages[]): PlantOutages[] {
  const hoursOf = (e: OutageEvent) => {
    const out: number[] = [];
    for (let t = Date.parse(e.start); t <= Date.parse(e.end); t += HOUR) out.push(t);
    return out;
  };
  const owners = new Map<number, Set<string>>();
  for (const r of results) for (const e of r.events) for (const t of hoursOf(e)) owners.set(t, (owners.get(t) ?? new Set()).add(r.plantName));
  return results.map((r) => ({
    ...r,
    events: r.events.map((e) => ({ ...e, concurrent: hoursOf(e).some((t) => (owners.get(t)?.size ?? 0) > 1) })),
  }));
}
