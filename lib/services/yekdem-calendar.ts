/**
 * TR-Energy Analyst - YEKDEM çıkış takvimi (/yekdem): santral rehberindeki bütün santrallerin YEKDEM durumu ve yıllara göre toplam
 *
 * Santral dizini (lib/services/plant-directory.ts) × YEKDEM geçmişi (lib/services/yekdem-exit.ts: kimlikli santral listeleri ve
 * katılımcı listesi, önbellekten). Toplama lib/analysis/yekdem-calendar.ts. EPİAŞ'a yalnız önbellekte olmayan yıl listesi için gider.
 * Santral listesi YEKDEM'de hiç görülmeyenleri içermez (sayısı `calendar.neverSeen`). 30 dakika bellekte.
 */

import { buildYekdemCalendar, type CalendarPlant, type YekdemCalendar } from "@/lib/analysis/yekdem-calendar";
import { loadDirectory, sectorFacts } from "@/lib/services/plant-directory";
import { loadYekdemExitIndex } from "@/lib/services/yekdem-exit";

const TTL_MS = 30 * 60_000;
let memo: { at: number; promise: Promise<YekdemCalendarData> } | null = null;

export interface YekdemCalendarData {
  calendar: YekdemCalendar;
  /** YEKDEM'de görülmüş santraller (hiç görülmeyenler hariç) */
  plants: CalendarPlant[];
  /** Eksik yıl listeleri vb. */
  errors: string[];
  note: string;
}

async function build(): Promise<YekdemCalendarData> {
  const [dir, facts, idx] = await Promise.all([loadDirectory(), sectorFacts(), loadYekdemExitIndex()]);
  const all: CalendarPlant[] = dir.map((d) => {
    const x = idx.of({ epiasPlantId: d.id, name: d.name, type: d.type, organizationName: d.owner ?? facts.get(d.id)?.owner ?? null });
    return { id: d.id, name: d.name, type: d.type, owner: d.owner, status: x.status, marketFrom: x.marketFrom, mw: x.licensedMw };
  });
  return {
    calendar: buildYekdemCalendar(all, idx.currentYear),
    plants: all.filter((p) => p.status !== "NEVER"),
    errors: idx.errors,
    note: "Kimlikli YEKDEM santral listeleri (2014'ten bugüne) ve katılımcı listesi (2016–2025); işletmeye giriş tarihi açık veride yok, süre ±1 yıl belirsiz.",
  };
}

export function loadYekdemCalendar(now = Date.now()): Promise<YekdemCalendarData> {
  if (memo && now - memo.at < TTL_MS) return memo.promise;
  const promise = build();
  memo = { at: now, promise };
  promise.catch(() => {
    if (memo?.promise === promise) memo = null;
  });
  return promise;
}
