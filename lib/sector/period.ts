/**
 * Sektör analizlerinin dönemi: içinde bulunulan yılın sektör karnesinin dönem sonu (scripts/sector-collect.mts; piyasa
 * verisi olan son gün). Kullanıcı kararı 16.10.2026: veri her zaman en güncel tarihe kadar. Aylara göre iki yılı kıyaslayan
 * analizler (Ocak – sonAy) son TAM ayı kullanır: yarım ay geçen yılın tam ayıyla kıyaslanmaz.
 */

import fs from "node:fs";
import path from "node:path";

/** Dönem sonundan son tam ay (1–12): ayın son günüyse o ay, değilse bir önceki */
export function lastFullMonth(periodEnd: string): number {
  const [y, m, d] = periodEnd.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === lastDay ? m : m - 1;
}

/** Sektör karnesinin dönem sonu (YYYY-AA-GG); karne yoksa null */
export function karnePeriodEnd(year: number, cacheDir = path.join(process.cwd(), ".cache", "epias")): string | null {
  const f = path.join(cacheDir, `sector-${year}.json`);
  if (!fs.existsSync(f)) return null;
  return (JSON.parse(fs.readFileSync(f, "utf8")).period?.end as string | undefined) ?? null;
}
