/**
 * TR-Energy Analyst - DSİ baraj doluluğu görünümü (havuz: lib/pool/dsi-dam-codec.ts; SAF, I/O yok)
 *
 * Amaca göre ülke ortalaması doluluk, bir hafta ve bir yıl önceye göre değişim, mevsim karşılaştırması (aynı gün, yıllar) ve
 * dört büyük ilin içme suyu doluluğu. DSİ yalnız iş günleri ve yalnız mayıs–ekim aralığında yayımlıyor gibi görünüyor
 * (15.05.2024'ten beri 330 gün; kış ayları boş): eksik günler doldurulmaz, "bir hafta önce" en yakın önceki yayım gününe bakar.
 */

import { DSI_PURPOSES, type DsiDamDoc, type DsiPurpose } from "@/lib/pool/dsi-dam-codec";

export const PURPOSE_LABEL: Record<DsiPurpose, string> = {
  Energy: "Enerji amaçlı",
  Irrigation: "Sulama amaçlı",
  DrinkingWater: "İçme suyu amaçlı",
};

const DAY_MS = 86_400_000;
const shift = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** `days` içinde ≤ date olan en yakın kayıt ve en çok `maxBack` gün geriye bakar */
function nearest<T>(
  days: Record<string, T>,
  date: string,
  maxBack: number
): { date: string; v: T } | null {
  for (let i = 0; i <= maxBack; i++) {
    const d = shift(date, -i);
    if (days[d]) return { date: d, v: days[d] };
  }
  return null;
}

export interface DamPurposeRow {
  purpose: DsiPurpose;
  label: string;
  date: string;
  occupancyPct: number;
  activeVolumeMm3: number;
  /** Yedi gün önceki doluluk (%) ve bir yıl önceki aynı gün (en çok 4 gün geriye) */
  weekAgoPct: number | null;
  yearAgoPct: number | null;
}

export interface DamCityRow {
  name: string;
  date: string;
  occupancyPct: number;
  weekAgoPct: number | null;
  supplyDays: string | null;
}

export interface DamSeasonPoint {
  /** "AA-GG" */
  md: string;
  [year: string]: number | string | null;
}

export interface DamOutlook {
  /** Enerji amaçlı serinin en son günü ve bugüne göre kaç gün eski (takvim günü) */
  asOf: string;
  staleDays: number;
  fetchedAt: string | null;
  purposes: DamPurposeRow[];
  cities: DamCityRow[];
  /** Enerji amaçlı doluluk: gün-ay bazında yıllar yan yana */
  season: DamSeasonPoint[];
  seasonYears: number[];
}

export function damOutlook(doc: DsiDamDoc | null, today: string): DamOutlook | null {
  if (!doc) return null;
  const energyDays = Object.keys(doc.national.Energy).sort();
  if (!energyDays.length) return null;
  const asOf = energyDays[energyDays.length - 1];

  const purposes: DamPurposeRow[] = [];
  for (const p of DSI_PURPOSES) {
    const days = doc.national[p];
    const last = nearest(days, asOf, 7);
    if (!last) continue;
    purposes.push({
      purpose: p,
      label: PURPOSE_LABEL[p],
      date: last.date,
      occupancyPct: last.v.occupancyPct,
      activeVolumeMm3: last.v.activeVolumeMm3,
      weekAgoPct: nearest(days, shift(last.date, -7), 4)?.v.occupancyPct ?? null,
      yearAgoPct: nearest(days, shift(last.date, -365), 4)?.v.occupancyPct ?? null,
    });
  }

  const cities: DamCityRow[] = [];
  for (const c of Object.values(doc.provinces)) {
    const last = nearest(c.days, asOf, 7);
    if (!last) continue;
    cities.push({
      name: c.name,
      date: last.date,
      occupancyPct: last.v.occupancyPct,
      weekAgoPct: nearest(c.days, shift(last.date, -7), 4)?.v.occupancyPct ?? null,
      supplyDays: last.v.supplyDays,
    });
  }
  cities.sort((a, b) => a.occupancyPct - b.occupancyPct);

  const years = [...new Set(energyDays.map((d) => Number(d.slice(0, 4))))].sort();
  const byMd = new Map<string, DamSeasonPoint>();
  for (const d of energyDays) {
    const md = d.slice(5);
    const pt = byMd.get(md) ?? { md };
    pt[d.slice(0, 4)] = doc.national.Energy[d].occupancyPct;
    byMd.set(md, pt);
  }
  const season = [...byMd.values()].sort((a, b) => a.md.localeCompare(b.md));

  return {
    asOf,
    staleDays: Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / DAY_MS
    ),
    fetchedAt: doc.fetchedAt,
    purposes,
    cities,
    season,
    seasonYears: years,
  };
}

/** Enerji amaçlı doluluk (%), her gün için son bilinen değer (en çok `maxAge` gün eski); kayıt olmayan gün yok sayılır */
export function energyOccupancyByDay(
  doc: DsiDamDoc | null,
  from: string,
  to: string,
  maxAge = 5
): Map<string, number> {
  const out = new Map<string, number>();
  if (!doc) return out;
  for (let d = from; d <= to; d = shift(d, 1)) {
    const hit = nearest(doc.national.Energy, d, maxAge);
    if (hit) out.set(d, hit.v.occupancyPct);
  }
  return out;
}
