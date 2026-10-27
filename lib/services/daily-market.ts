/**
 * TR-Energy Analyst - Günlük piyasa panosu: veri toplama (hesap lib/analysis/daily-market.ts'te)
 *
 * Günün doğrulanmış fiyatları (MarketData: EPİAŞ ya da dosya) ve önceki 28 günün PTF'si veri tabanından, sistem geneli seriler
 * (tüketim, gerçek zamanlı üretim, KGÜP, talimatlar) veri havuzundan (data/pool/system/<yıl>.json.gz) okunur. EPİAŞ'a gidilmez:
 * havuzu `scripts/system-sync.mts --recent` günde bir kez doldurur (scripts/epias-monthly-sync.mts).
 */

import { prisma } from "@/lib/prisma";
import { buildDailyMarket, isValidDay, lastSystemDay, REFERENCE_DAYS, sunPlanBaselineFor, systemDay, type DailyMarket, type Series24 } from "@/lib/analysis/daily-market";
import type { MarketHour } from "@/lib/analysis/market-summary";
import { readSystemYear } from "@/lib/pool/system-store";

/** app/api/market/route.ts ile aynı: LEGACY (doğrulanmamış) saatler dışarıda */
const VERIFIED = ["EPIAS", "FILE"];
const DAY_MS = 86_400_000;

export interface DailyAvailability {
  /** Doğrulanmış piyasa verisinin ilk günü */
  start: string;
  /** Son tam gün (24 saat dolu olmasa da son saat 23:00 ya da bir önceki gün) */
  end: string;
  /** Sistem verisi (gerçek zamanlı üretim) olan son gün; yoksa null */
  systemEnd: string | null;
}

export type DailyMarketResult = { ok: true; data: DailyMarket; available: DailyAvailability } | { ok: false; status: 400 | 404; error: string };

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function loadDailyMarket(requested?: string | null): Promise<DailyMarketResult> {
  if (requested && !isValidDay(requested)) return { ok: false, status: 400, error: "Tarih YYYY-AA-GG biçiminde ve geçerli bir gün olmalı." };
  const range = await prisma.marketData.aggregate({ where: { source: { in: VERIFIED } }, _min: { timestamp: true }, _max: { timestamp: true } });
  if (!range._min.timestamp || !range._max.timestamp) {
    return { ok: false, status: 404, error: "Doğrulanmış piyasa verisi yok; önce EPİAŞ'tan piyasa verisini çekin." };
  }
  const first = isoDay(range._min.timestamp.getTime());
  const last = range._max.timestamp;
  const lastFullDay = isoDay(last.getTime() - (last.getUTCHours() === 23 ? 0 : DAY_MS));
  const date = requested ?? lastFullDay;
  if (date < first || date > lastFullDay) return { ok: false, status: 404, error: `${date} için doğrulanmış piyasa verisi yok (${first} – ${lastFullDay}).` };

  const dayStart = Date.parse(`${date}T00:00:00Z`);
  const rows = await prisma.marketData.findMany({
    where: { source: { in: VERIFIED }, timestamp: { gte: new Date(dayStart - REFERENCE_DAYS * DAY_MS), lte: new Date(dayStart + 23 * 3_600_000) } },
    select: { timestamp: true, ptf: true, smf: true, systemDirection: true, gipPrice: true, gipVolumeMwh: true },
  });
  const market: Array<MarketHour | null> = Array(24).fill(null);
  const history = new Map<string, Series24>();
  for (const r of rows) {
    const t = r.timestamp.getTime();
    if (t >= dayStart) {
      market[r.timestamp.getUTCHours()] = { t, ptf: r.ptf, smf: r.smf, systemDirection: r.systemDirection, gipPrice: r.gipPrice, gipVolumeMwh: r.gipVolumeMwh };
    } else {
      const d = isoDay(t);
      let series = history.get(d);
      if (!series) history.set(d, (series = Array(24).fill(null)));
      series[r.timestamp.getUTCHours()] = r.ptf;
    }
  }

  const year = Number(date.slice(0, 4));
  const doc = await readSystemYear(year);
  const data = buildDailyMarket({ date, market, system: systemDay(doc, date), history, sunPlanBaseline: sunPlanBaselineFor(doc, date) });
  // Sistem verisinin son günü: bu yılın belgesinde yoksa (yıl başı) önceki yıla bakılır
  const systemEnd = lastSystemDay(doc) ?? lastSystemDay(await readSystemYear(year - 1));
  return { ok: true, data, available: { start: first, end: lastFullDay, systemEnd } };
}
