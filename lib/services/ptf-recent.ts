/**
 * TR-Energy Analyst - Son günlerin PTF'si (Aşama 22.6 kısıntı gölge sürümü için)
 *
 * MarketData'ya piyasa eşitlemesi (scripts/market-sync.mts --recent) düne kadar yazar: SMF uç noktası bitişin geçmişte
 * olmasını ister. Sıfır fiyat olasılığının D günü için en güçlü özelliği D-1'in PTF'sidir; D-1 günü sabah (tahmin anı) bu
 * fiyat GÖP sonucuyla bir gün önce (D-2 14:00) yayımlanmıştır ama MarketData'da yoktur. Bu modül yalnız PTF'yi (gün öncesi
 * piyasası, /markets/dam/data/mcp) son 3 gün ve bugün için çeker, `.cache/epias/ptf-recent.json`'a yazar; MarketData'ya
 * dokunmaz (SMF / yön olmadan kayıt dengesizlik hesaplarını bozardı). Okuma MarketData'yı esas alır, eksik saatleri
 * önbellekten tamamlar.
 *
 * Zaman: duvar saati (Türkiye saati UTC alanlarında; epias-service `epiasDateToWallClock`).
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { epiasDateToWallClock, epiasRequest, formatToEpiasIso } from "@/lib/services/epias-service";

const FILE = path.join(process.cwd(), ".cache", "epias", "ptf-recent.json");
const DAY = 86_400_000;
const TR_OFFSET = 3 * 3_600_000;

interface PtfCache {
  fetchedAt: string;
  /** Duvar saati ISO → PTF (TL/MWh) */
  hours: Record<string, number>;
}

function readCache(): PtfCache | null {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as PtfCache;
  } catch {
    return null;
  }
}

/** Son `days` gün ve bugünün (Türkiye) PTF'sini EPİAŞ'tan çeker, önbelleğe yazar. EPİAŞ'a erişilemezse hata fırlatır. */
export async function syncRecentPtf(now = Date.now(), days = 3): Promise<{ hours: number; last: string | null }> {
  const todayWall = Math.floor((now + TR_OFFSET) / DAY) * DAY;
  const json = await epiasRequest<{ items?: Array<{ date: string; price: number }> }>("/markets/dam/data/mcp", {
    startDate: formatToEpiasIso(new Date(todayWall - days * DAY), false),
    endDate: formatToEpiasIso(new Date(todayWall), true),
  });
  const hours: Record<string, number> = {};
  for (const it of json.items ?? []) if (Number.isFinite(Number(it.price))) hours[epiasDateToWallClock(it.date).toISOString()] = Number(it.price);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ fetchedAt: new Date(now).toISOString(), hours } satisfies PtfCache));
  const keys = Object.keys(hours).sort();
  return { hours: keys.length, last: keys.at(-1) ?? null };
}

/** [from, to) aralığının saatlik PTF'si: MarketData, eksik saatler son günlerin önbelleğinden */
export async function readPtfMap(from: number, to: number): Promise<Map<number, number>> {
  const rows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(from), lt: new Date(to) } }, select: { timestamp: true, ptf: true } });
  const out = new Map<number, number>(rows.map((r) => [r.timestamp.getTime(), r.ptf]));
  for (const [iso, p] of Object.entries(readCache()?.hours ?? {})) {
    const t = Date.parse(iso);
    if (t >= from && t < to && !out.has(t)) out.set(t, p);
  }
  return out;
}
