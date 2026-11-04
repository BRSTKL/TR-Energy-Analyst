/**
 * TR-Energy Analyst - YEKDEM çıkış takvimi: hangi yıl kaç santral ve kaç MW serbest piyasaya geçiyor (SAF, I/O yok)
 *
 * Santral başına sınıflandırma lib/analysis/yekdem-exit.ts'tedir (10 yıllık süre, işletmeye giriş yılı ±1 belirsiz). Burada
 * santraller serbest piyasaya geçiş yılına göre toplanır:
 *   - Çıkmış (EXITED, LEFT_EARLIER): geçiş yılı = son YEKDEM yılı + 1. Kesin.
 *   - Çıkacak (ENDS_THIS_YEAR, ENDS_SOON, LATER): geçiş yılı aralığı [en erken, en geç]. Aralık tek yıl ise "kesin"; iki yıl ise
 *     "belirsiz": santral en erken yılın satırında sayılır, bir sonraki yılda da çıkabilir. Hiçbir santral iki satırda sayılmaz.
 *   - Listelerde hiç görülmeyen (NEVER) takvime girmez.
 * MW yalnız YEKDEM katılımcı listesindeki lisanslı güçten (resmî kayıt); kaydı olmayan santral sayılır ama MW'a katılmaz
 * (`noMw`). Üretimden güç türetilmez (CLAUDE.md kurulu güç kuralı).
 */

import type { YekdemExitStatus } from "@/lib/analysis/yekdem-exit";

export interface CalendarPlant {
  id: number;
  name: string;
  type: "RES" | "HES" | "GES";
  owner: string | null;
  status: YekdemExitStatus;
  /** Serbest piyasaya geçiş yılı aralığı; hiç görülmediyse null */
  marketFrom: { earliest: number; latest: number } | null;
  /** YEKDEM katılımcı listesindeki lisanslı güç, MW; yoksa null */
  mw: number | null;
}

export interface Bucket {
  plants: number;
  /** Lisanslı gücü bilinen santrallerin toplamı, MW */
  mw: number;
  /** Lisanslı gücü bilinmeyen santral sayısı (MW toplamına girmez) */
  noMw: number;
}

export interface CalendarYear {
  year: number;
  certain: Bucket;
  /** Aralığı iki yıl olan santraller, en erken yılın satırında */
  uncertain: Bucket;
}

export interface YekdemCalendar {
  currentYear: number;
  /** currentYear dahil, çıkmış santraller (yıl artan) */
  past: CalendarYear[];
  /** currentYear + 1'den, çıkacak santraller */
  future: CalendarYear[];
  /** Şu an YEKDEM'de olan (bu yıl listede) */
  inYekdem: Bucket;
  /** Listelerde hiç görülmeyen santral sayısı (takvimde yok) */
  neverSeen: number;
}

const empty = (): Bucket => ({ plants: 0, mw: 0, noMw: 0 });
const add = (b: Bucket, mw: number | null) => {
  b.plants++;
  if (mw === null) b.noMw++;
  else b.mw += mw;
};

const UPCOMING: ReadonlySet<YekdemExitStatus> = new Set(["ENDS_THIS_YEAR", "ENDS_SOON", "LATER"]);
const GONE: ReadonlySet<YekdemExitStatus> = new Set(["EXITED", "LEFT_EARLIER"]);

/** Santralin takvimdeki satırı: yıl ve belirsizlik; takvimde yoksa null */
export function calendarSlot(p: Pick<CalendarPlant, "status" | "marketFrom">): { year: number; uncertain: boolean } | null {
  if (!p.marketFrom) return null;
  if (GONE.has(p.status)) return { year: p.marketFrom.earliest, uncertain: false };
  if (UPCOMING.has(p.status)) return { year: p.marketFrom.earliest, uncertain: p.marketFrom.latest > p.marketFrom.earliest };
  return null;
}

export function buildYekdemCalendar(plants: CalendarPlant[], currentYear: number): YekdemCalendar {
  const rows = new Map<number, CalendarYear>();
  const row = (year: number) => {
    let r = rows.get(year);
    if (!r) rows.set(year, (r = { year, certain: empty(), uncertain: empty() }));
    return r;
  };
  const inYekdem = empty();
  let neverSeen = 0;
  for (const p of plants) {
    if (p.status === "NEVER") neverSeen++;
    if (UPCOMING.has(p.status)) add(inYekdem, p.mw);
    const slot = calendarSlot(p);
    if (!slot) continue;
    add(slot.uncertain ? row(slot.year).uncertain : row(slot.year).certain, p.mw);
  }
  const all = Array.from(rows.values()).sort((a, b) => a.year - b.year);
  const fill = (from: number, to: number) => {
    const out: CalendarYear[] = [];
    for (let y = from; y <= to; y++) out.push(rows.get(y) ?? { year: y, certain: empty(), uncertain: empty() });
    return out;
  };
  const first = all.length ? all[0].year : currentYear;
  const last = all.length ? all[all.length - 1].year : currentYear;
  return {
    currentYear,
    past: fill(Math.min(first, currentYear), currentYear),
    future: last > currentYear ? fill(currentYear + 1, last) : [],
    inYekdem,
    neverSeen,
  };
}
