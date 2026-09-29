/**
 * TR-Energy Analyst - EPİAŞ resmi dengesizlik fiyatları
 *
 * EPİAŞ Şeffaflık Platformu her saat için sistemin pozitif ve negatif dengesizlik tutarını (TL) ve miktarını (MWh)
 * yayımlar. Tutar / miktar, o saatte uygulanan resmi dengesizlik fiyatıdır. 2026'dan itibaren fiyat 15 dakikalık SMF'ler,
 * taban (V) ve negatif fiyat (B) kurallarıyla belirlendiği için saatlik PTF/SMF'den formülle bulunamaz; hesap motoru bu
 * fiyatları esas alır (engine.ts imbalancePrices). 2025'te resmi fiyat formülle birebir aynıdır (8.760 saatte ortalama
 * fark 0,01 TL/MWh; doğrulama 29.09.2026).
 *
 * Sistem dengesizliği çok küçükse (≤ MIN_SYSTEM_MWH) bölüm anlamsızlaşır; o saatte fiyat yazılmaz (formüle düşer).
 */

import { prisma } from "@/lib/prisma";
import { epiasDateToWallClock, epiasRequest, formatToEpiasIso } from "@/lib/services/epias-service";

const AMOUNT = "/markets/imbalance/data/imbalance-amount";
const QUANTITY = "/markets/imbalance/data/imbalance-quantity";
export const MIN_SYSTEM_MWH = 1;

export interface OfficialImbalanceHour {
  /** Duvar saati, UTC alanında (uygulamanın zaman damgası kuralı) */
  timestamp: Date;
  pos: number | null;
  neg: number | null;
}

/** Tutar ve miktar satırlarından resmi fiyatlar (SAF) */
export function officialPricesFrom(
  amounts: Array<{ date: string; positiveImbalance: number; negativeImbalance: number }>,
  quantities: Array<{ date: string; positiveImbalance: number; negativeImbalance: number }>
): OfficialImbalanceHour[] {
  const q = new Map(quantities.map((x) => [x.date, x]));
  return amounts.flatMap((a) => {
    const qty = q.get(a.date);
    if (!qty) return [];
    const pos = qty.positiveImbalance > MIN_SYSTEM_MWH ? a.positiveImbalance / qty.positiveImbalance : null;
    // Negatif tarafta hem tutar hem miktar eksi işaretlidir
    const neg = qty.negativeImbalance < -MIN_SYSTEM_MWH ? a.negativeImbalance / qty.negativeImbalance : null;
    return [{ timestamp: epiasDateToWallClock(a.date), pos, neg }];
  });
}

/** Ay ay (servis uzun aralıkları reddedebilir) resmi dengesizlik fiyatları */
export async function fetchOfficialImbalancePrices(startDay: string, endDay: string): Promise<OfficialImbalanceHour[]> {
  const out: OfficialImbalanceHour[] = [];
  let d = new Date(`${startDay}T00:00:00Z`);
  const end = new Date(`${endDay}T00:00:00Z`);
  while (d <= end) {
    const monthStart = d.toISOString().slice(0, 10);
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const last = monthEnd > endDay ? endDay : monthEnd;
    const body = { startDate: formatToEpiasIso(monthStart, false), endDate: formatToEpiasIso(last, true) };
    const [a, q] = await Promise.all([
      epiasRequest<{ items?: any[] }>(AMOUNT, body),
      epiasRequest<{ items?: any[] }>(QUANTITY, body),
    ]);
    out.push(...officialPricesFrom(a.items ?? [], q.items ?? []));
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return out;
}

/** Resmi fiyatları aynı saatin MarketData satırına yazar; yazılan satır sayısını döner */
export async function storeOfficialImbalancePrices(hours: OfficialImbalanceHour[]): Promise<number> {
  let written = 0;
  const CHUNK = 500;
  for (let i = 0; i < hours.length; i += CHUNK) {
    const results = await prisma.$transaction(
      hours.slice(i, i + CHUNK).map((h) =>
        prisma.marketData.updateMany({ where: { timestamp: h.timestamp }, data: { imbalancePosPrice: h.pos, imbalanceNegPrice: h.neg } })
      )
    );
    written += results.reduce((a, r) => a + r.count, 0);
  }
  return written;
}

/** Çek ve yaz (piyasa verisi senkronizasyonundan sonra çağrılır) */
export async function syncOfficialImbalancePrices(startDay: string, endDay: string): Promise<{ hours: number; written: number }> {
  const hours = await fetchOfficialImbalancePrices(startDay, endDay);
  return { hours: hours.length, written: await storeOfficialImbalancePrices(hours) };
}
