import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compareMarkets, summarizeMarket, type MarketHour } from "@/lib/analysis/market-summary";

export const dynamic = "force-dynamic";

const VERIFIED = ["EPIAS", "FILE"];
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const lastDayOfMonth = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();
const trDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** "2026 (Ocak–Ağustos)", tam yıl için "2025"; ay başı ya da sonu olmayan dönemde tarih aralığı */
function periodLabel(start: string, end: string): string {
  const y = start.slice(0, 4);
  const wholeMonths = start.endsWith("-01") && Number(end.slice(8, 10)) === lastDayOfMonth(end);
  if (!wholeMonths || !end.startsWith(y)) return `${trDate(start)} – ${trDate(end)}`;
  if (start.endsWith("-01-01") && end.endsWith("-12-31")) return y;
  const m = (d: string) => MONTHS_TR[Number(d.slice(5, 7)) - 1];
  return start.slice(5, 7) === end.slice(5, 7) ? `${m(start)} ${y}` : `${y} (${m(start)}–${m(end)})`;
}

const yearLabel = (start: string, end: string) => (start.slice(0, 4) === end.slice(0, 4) ? start.slice(0, 4) : periodLabel(start, end));

/** Aynı gün bir önceki (sonraki) yılda; ay sonu yine ay sonuna gider (29 Şubat ↔ 28 Şubat) */
function shiftYear(d: string, by: number): string {
  const moved = `${Number(d.slice(0, 4)) + by}${d.slice(4, 8)}`;
  const day = Number(d.slice(8, 10)) === lastDayOfMonth(d) ? lastDayOfMonth(`${moved}01`) : Number(d.slice(8, 10));
  return `${moved}${String(day).padStart(2, "0")}`;
}

async function load(start: string, end: string): Promise<MarketHour[]> {
  const rows = await prisma.marketData.findMany({
    where: {
      source: { in: VERIFIED },
      timestamp: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T23:00:00Z`) },
    },
    select: { timestamp: true, ptf: true, smf: true, systemDirection: true, gipPrice: true, gipVolumeMwh: true },
  });
  return rows.map((r) => ({ t: r.timestamp.getTime(), ptf: r.ptf, smf: r.smf, systemDirection: r.systemDirection, gipPrice: r.gipPrice, gipVolumeMwh: r.gipVolumeMwh }));
}

/**
 * GET /api/market?start=YYYY-AA-GG&end=YYYY-AA-GG
 *
 * Doğrulanmış (EPİAŞ ya da dosya) piyasa verisinden dönem özeti ve bir önceki yılın aynı günleriyle karşılaştırma.
 * Dönem verilmezse: son doğrulanmış tam ayın yılı, yılbaşından o ayın sonuna. Doğrulanmamış (LEGACY) saatler dışarıda
 * bırakılır ve sayısı bildirilir.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const range = await prisma.marketData.aggregate({ where: { source: { in: VERIFIED } }, _min: { timestamp: true }, _max: { timestamp: true } });
  if (!range._min.timestamp || !range._max.timestamp) {
    return NextResponse.json({ success: false, error: "Doğrulanmış piyasa verisi yok; önce EPİAŞ'tan piyasa verisini çekin." }, { status: 404 });
  }
  const first = range._min.timestamp.toISOString().slice(0, 10);
  const last = range._max.timestamp;
  // Son tam ay: son saat ayın son saatiyse o ay, değilse bir önceki ay
  const lastFullMonthEnd = (() => {
    const next = new Date(last.getTime() + 3_600_000);
    const endOfMonth = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0, 23));
    const d = next.getUTCDate() === 1 && next.getUTCHours() === 0 ? last : new Date(Date.UTC(endOfMonth.getUTCFullYear(), endOfMonth.getUTCMonth(), 0));
    return d.toISOString().slice(0, 10);
  })();

  const end = DAY.test(q.get("end") ?? "") ? q.get("end")! : lastFullMonthEnd;
  const start = DAY.test(q.get("start") ?? "") ? q.get("start")! : `${end.slice(0, 4)}-01-01`;
  if (start > end) return NextResponse.json({ success: false, error: "Başlangıç tarihi bitişten sonra olamaz." }, { status: 400 });
  const prevStart = shiftYear(start, -1);
  const prevEnd = shiftYear(end, -1);
  const unverified = (from: string, to: string) =>
    prisma.marketData.count({ where: { source: { notIn: VERIFIED }, timestamp: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T23:00:00Z`) } } });

  const [cur, prev, curUnverified, prevUnverified] = await Promise.all([
    load(start, end),
    load(prevStart, prevEnd),
    unverified(start, end),
    unverified(prevStart, prevEnd),
  ]);
  const current = summarizeMarket(cur);
  if (!current) return NextResponse.json({ success: false, error: `${periodLabel(start, end)} için doğrulanmış piyasa verisi yok.` }, { status: 404 });
  // Önceki yıl ancak dönemin en az %90'ı doluysa karşılaştırılır
  const previous = prev.length >= cur.length * 0.9 ? summarizeMarket(prev) : null;
  const label = periodLabel(start, end);
  const prevLabel = periodLabel(prevStart, prevEnd);

  return NextResponse.json({
    success: true,
    available: { start: first, end: last.toISOString().slice(0, 10), lastFullMonthEnd },
    period: { start, end, label },
    previousPeriod: { start: prevStart, end: prevEnd, label: prevLabel, verifiedHours: prev.length, compared: previous !== null },
    current,
    previous,
    // Cümlede yalnızca yıl ("2025 → 2026"); dönem başlıkta yazılı
    sentences: previous ? compareMarkets(previous, current, yearLabel(prevStart, prevEnd), yearLabel(start, end)) : [],
    /** Dönemde dışarıda bırakılan doğrulanmamış (LEGACY) saatler */
    unverifiedHours: { current: curUnverified, previous: prevUnverified },
  });
}
