/**
 * TR-Energy Analyst - Gerçekleşen üretim, kaynağıyla (karne, PLAN 21.4; kural lib/pool/provisional.ts)
 *
 * Saat başına UEVM (kesin) ya da UEVM henüz yayımlanmamışsa EPİAŞ gerçek zamanlı üretimi (geçici, "GZÜ"). Karne geçici
 * saatlerle hemen hesaplanır, UEVM gelince aynı çağrı kesin değeri döndürür; sonuç hangi saatlerin geçici olduğunu taşır.
 */

import { readPoolYear, readProvisionalYear } from "@/lib/pool/pool-store";
import { mergeProduction, type ProductionSource } from "@/lib/pool/provisional";

const HOUR = 3_600_000;

export interface RealizedHour {
  /** Duvar saati ms (Türkiye saati UTC alanlarında) */
  t: number;
  mwh: number;
  source: ProductionSource;
}

/** [fromDay, toDay] günleri (YYYY-MM-DD, ikisi dahil); üretimi olmayan saat dönmez */
export async function realizedHours(epiasPlantId: number, fromDay: string, toDay: string): Promise<{ hours: RealizedHour[]; provisional: number; final: number }> {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`) + 24 * HOUR;
  const uevm = new Map<number, number | null>();
  const prov = new Map<number, number | null>();
  for (let y = new Date(from).getUTCFullYear(); y <= new Date(to - 1).getUTCFullYear(); y++) {
    const [p, g] = await Promise.all([readPoolYear(epiasPlantId, y), readProvisionalYear(epiasPlantId, y)]);
    if (p) p.uevm.forEach((v, i) => uevm.set(Date.parse(p.start) + i * HOUR, v));
    if (g) g.values.forEach((v, i) => prov.set(Date.parse(g.start) + i * HOUR, v));
  }
  const hours = Array.from(mergeProduction(uevm, prov).entries())
    .filter(([t]) => t >= from && t < to)
    .sort((a, b) => a[0] - b[0])
    .map(([t, x]) => ({ t, ...x }));
  const provisional = hours.filter((h) => h.source === "GZÜ").length;
  return { hours, provisional, final: hours.length - provisional };
}
