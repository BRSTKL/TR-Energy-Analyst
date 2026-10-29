/**
 * TR-Energy Analyst - Teklif öncesi görünüm bağlamı: EPİAŞ'ta bulunan ek veriler (ÖNİZLEME; hesap lib/analysis/pre-bid-context.ts)
 *
 * Hedef gün T+1 için: doğal gaz GRF geçmişi (natural-gas-service), T gününün gün öncesi arz–talep eğrisi (T−1'de açıklanmış),
 * T gününün GÖP toplam alış / satış teklif miktarı ve önceki 28 günü, T−1 gününün gün içi işlem özeti. Her seri bağımsız
 * alınır; biri hata verirse o bölüm boş kalır ve not düşülür. Geçmiş günler değişmediği için eğri ve işlem özeti uzun süre
 * bellekte tutulur (eğri için 24 istek).
 */

import {
  bidOfferRatios,
  curveHour,
  downsampleCurve,
  gipHours,
  outageOutlook,
  summarizeGas,
  type BidOfferHour,
  type CurveHour,
  type CurvePoint,
  type GasSummary,
  type GipHour,
  type OutageMessageLike,
  type OutageOutlook,
} from "@/lib/analysis/pre-bid-context";
import { damOutlook, type DamOutlook } from "@/lib/analysis/dsi-dam";
import { neighborOutlook, type NeighborOutlook } from "@/lib/analysis/neighbors";
import { readEntsoe } from "@/lib/pool/entsoe-store";
import { readDsiDam } from "@/lib/pool/dsi-dam-store";
import { prisma } from "@/lib/prisma";
import { epiasRequest, GAS_API_BASE } from "@/lib/services/epias-service";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const shift = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const hh = (h: number) => String(h).padStart(2, "0");
const iso = (d: string, h = 0) => `${d}T${hh(h)}:00:00+03:00`;

const memo = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  memo.set(key, { at: Date.now(), value });
  value.catch(() => memo.delete(key));
  return value;
}

export interface PreBidContext {
  date: string;
  /** Eğri ve teklif miktarlarının günü (hedef günden bir önceki gün) */
  refDay: string;
  /** Gün içi işlem özetinin günü (hedef günden iki önceki gün) */
  gipDay: string;
  gas: { summary: GasSummary; series: Array<{ date: string; tl: number }> } | null;
  curves: {
    day: string;
    hours: CurveHour[];
    shapes: Record<number, CurvePoint[]>;
  } | null;
  bids: { day: string; hours: BidOfferHour[] } | null;
  gip: { day: string; hours: GipHour[]; ptf: Array<number | null> } | null;
  /** Süren arızalar; yalnız hedef gün bugün ya da yarınsa (geçmiş gün için o günkü bildirim listesi saklanmıyor) */
  outages: OutageOutlook | null;
  /** DSİ baraj doluluğu (havuzdan; DSİ yalnız Türkiye IP'sinden açılır, çekimi sunucu yapar) */
  dams: DamOutlook | null;
  /** ENTSO-E komşu ülke fiyatları ve sınır akışları (havuzdan; çekimi sunucu yapar) */
  neighbors: NeighborOutlook | null;
  notes: string[];
}

async function loadGas(date: string) {
  return cached(`gas:${date}`, 3_600_000, async () => {
    const end = shift(date, -1);
    const series: Array<{ date: string; tl: number; usdMmbtu: number | null }> = [];
    for (const [a, b] of [
      [shift(end, -119), shift(end, -60)],
      [shift(end, -59), end],
    ]) {
      const r = await epiasRequest<{ items?: Array<Record<string, unknown>> }>(
        "/markets/sgp/data/daily-reference-price",
        { startDate: iso(a), endDate: iso(b) },
        GAS_API_BASE
      );
      for (const it of r.items ?? [])
        if (typeof it.grfTl === "number")
          series.push({
            date: String(it.date).slice(0, 10),
            tl: it.grfTl,
            usdMmbtu: typeof it.grfUsdMmBtu === "number" ? it.grfUsdMmBtu : null,
          });
    }
    const summary = summarizeGas(series);
    return summary
      ? { summary, series: series.map((s) => ({ date: s.date, tl: s.tl })) }
      : null;
  });
}

async function loadCurves(day: string) {
  return cached(`curves:${day}`, 12 * 3_600_000, async () => {
    const hours: CurveHour[] = [];
    const shapes: Record<number, CurvePoint[]> = {};
    for (let h = 0; h < 24; h++) {
      const r = await epiasRequest<{
        items?: Array<{ price: number; supply: number; demand: number }>;
      }>("/markets/dam/data/supply-demand", { date: iso(day, h) });
      const c: CurvePoint[] = (r.items ?? []).map((x) => [x.price, x.supply, x.demand]);
      const ch = curveHour(h, c);
      if (ch) {
        hours.push(ch);
        shapes[h] = downsampleCurve(c, 50, 4600);
      }
    }
    return hours.length ? { day, hours, shapes } : null;
  });
}

/** Piyasa mesaj sistemi: son 45 gün + bugün (EPİAŞ yalnız başlamış bildirimleri verir; bitiş bir saat öncesinin saat başından geç olamaz) */
async function loadOutages(date: string) {
  return cached(`outages:${date}`, 30 * 60_000, async () => {
    const now = Date.now();
    const end = new Date(now - 3_600_000);
    end.setUTCMinutes(0, 0, 0);
    const r = await epiasRequest<{ items?: OutageMessageLike[] }>(
      "/markets/data/market-message-system",
      {
        startDate: iso(shift(date, -45)),
        endDate: `${new Date(end.getTime() + 3 * 3_600_000).toISOString().slice(0, 19)}+03:00`,
        regionId: 1,
      }
    );
    if (!Array.isArray(r.items)) throw new Error("beklenmeyen yanıt");
    return outageOutlook(
      r.items.filter((m) => Number.isFinite(m?.id)),
      date,
      now
    );
  });
}

async function loadBids(day: string) {
  return cached(`bids:${day}`, 3_600_000, async () => {
    // GÖP bitişi gün olarak okunur ("gün 00:00" o günü de verir); bugün için "23:00" bitişi 14:00'ten önce HTTP 400 döner
    const q = { startDate: iso(shift(day, -28)), endDate: iso(day) };
    const [bid, offer] = await Promise.all([
      epiasRequest<{ items?: Array<Record<string, unknown>> }>(
        "/markets/dam/data/submitted-bid-order-volume",
        q
      ),
      epiasRequest<{ items?: Array<Record<string, unknown>> }>(
        "/markets/dam/data/submitted-sales-order-volume",
        q
      ),
    ]);
    const byDay = new Map<
      string,
      { bid: Array<number | null>; offer: Array<number | null> }
    >();
    const put = (
      list: Array<Record<string, unknown>> | undefined,
      field: string,
      key: "bid" | "offer"
    ) => {
      for (const it of list ?? []) {
        const d = String(it.date).slice(0, 10);
        const h = Number(String(it.date).slice(11, 13));
        const v = it[field];
        if (typeof v !== "number" || !(h >= 0 && h < 24)) continue;
        if (!byDay.has(d))
          byDay.set(d, { bid: Array(24).fill(null), offer: Array(24).fill(null) });
        byDay.get(d)![key][h] = v;
      }
    };
    put(bid.items, "bidQuantity", "bid");
    put(offer.items, "offerQuantity", "offer");
    const today = byDay.get(day);
    if (!today) return null;
    const history = Array.from(byDay)
      .filter(([d]) => d < day)
      .map(([, v]) => v);
    return { day, hours: bidOfferRatios(today, history) };
  });
}

/** Bulgaristan ve Yunanistan fiyatı, sınır akışları ve PTF (EUR'ya çevrilmiş) karşılaştırması: hedef günden önceki son tam gün */
async function loadNeighbors(date: string) {
  const doc = await readEntsoe();
  if (!doc) return null;
  const from = shift(date, -8);
  const rows = await prisma.marketData.findMany({
    where: {
      source: { in: ["EPIAS", "FILE"] },
      timestamp: {
        gte: new Date(Date.parse(`${from}T00:00:00Z`)),
        lt: new Date(Date.parse(`${date}T00:00:00Z`)),
      },
    },
    select: { timestamp: true, ptf: true },
  });
  const ptf = new Map<string, number[]>();
  for (const x of rows) {
    const d = x.timestamp.toISOString().slice(0, 10);
    const arr = ptf.get(d) ?? Array(24).fill(NaN);
    arr[x.timestamp.getUTCHours()] = x.ptf;
    ptf.set(d, arr);
  }
  for (const [d, arr] of Array.from(ptf))
    if (arr.some((v) => !Number.isFinite(v))) ptf.delete(d);
  // Veri tabanı bugünün (ya da dünün) PTF'sini henüz içermeyebilir: eksik son iki günü EPİAŞ'tan canlı al
  for (const d of [shift(date, -1), shift(date, -2)]) {
    if (ptf.has(d)) continue;
    try {
      const r = await epiasRequest<{
        items?: Array<{ date?: string; price?: number }>;
      }>("/markets/dam/data/mcp", { startDate: iso(d), endDate: iso(d) });
      const arr: number[] = Array(24).fill(NaN);
      for (const it of r.items ?? []) {
        const h = typeof it.date === "string" ? Number(it.date.slice(11, 13)) : NaN;
        if (h >= 0 && h < 24 && typeof it.price === "number") arr[h] = it.price;
      }
      if (arr.every((v) => Number.isFinite(v))) ptf.set(d, arr);
    } catch {
      // karşılaştırma PTF'siz de gösterilir
    }
  }
  return neighborOutlook(doc, ptf, date);
}

async function loadGip(day: string) {
  return cached(`gip:${day}`, 12 * 3_600_000, async () => {
    const r = await epiasRequest<{
      items?: Array<{ contractName: string; price: number; quantity: number }>;
    }>("/markets/idm/data/transaction-history", {
      startDate: iso(day),
      endDate: iso(day, 23),
    });
    const hours = gipHours(r.items ?? [], day);
    if (!hours.some((h) => h.trades > 0)) return null;
    const rows = await prisma.marketData.findMany({
      where: {
        source: { in: ["EPIAS", "FILE"] },
        timestamp: {
          gte: new Date(Date.parse(`${day}T00:00:00Z`)),
          lt: new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS),
        },
      },
      select: { timestamp: true, ptf: true },
    });
    const ptf: Array<number | null> = Array(24).fill(null);
    for (const x of rows)
      ptf[
        Math.floor((x.timestamp.getTime() - Date.parse(`${day}T00:00:00Z`)) / HOUR_MS)
      ] = x.ptf;
    return { day, hours, ptf };
  });
}

export async function loadPreBidContext(date: string): Promise<PreBidContext> {
  const refDay = shift(date, -1);
  const gipDay = shift(date, -2);
  const notes: string[] = [];
  const settle = async <T>(label: string, p: Promise<T | null>): Promise<T | null> => {
    try {
      return await p;
    } catch (e) {
      notes.push(
        `${label} alınamadı: ${e instanceof Error ? e.message.slice(0, 120) : "hata"}`
      );
      return null;
    }
  };
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const [gas, curves, bids, gip, outages] = await Promise.all([
    settle("Doğal gaz referans fiyatı", loadGas(date)),
    settle("Arz–talep eğrisi", loadCurves(refDay)),
    settle("Teklif miktarları", loadBids(refDay)),
    settle("Gün içi işlemler", loadGip(gipDay)),
    date >= today
      ? settle("Arıza bildirimleri", loadOutages(date))
      : Promise.resolve(null),
  ]);
  const dams = await settle(
    "DSİ baraj doluluğu",
    readDsiDam().then((doc) => damOutlook(doc, today))
  );
  if (!dams)
    notes.push(
      "DSİ baraj doluluğu havuzda yok: çekim sunucuda çalışır (dsi-dam-sync.mts)."
    );
  const neighbors = await settle("Komşu ülke fiyatları", loadNeighbors(date));
  if (!neighbors)
    notes.push(
      "ENTSO-E komşu fiyatları havuzda yok: çekim sunucuda çalışır (entsoe-sync.mts)."
    );
  return {
    date,
    refDay,
    gipDay,
    gas,
    curves,
    bids,
    gip,
    outages,
    dams,
    neighbors,
    notes,
  };
}
