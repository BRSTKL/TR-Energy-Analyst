/**
 * TR-Energy Analyst - Arıza izleme (/ariza): havuzdaki EPİAŞ arıza / bakım bildirimleri (diskten, EPİAŞ'a bağlanmaz)
 *
 * Bildirimler data/pool/umm'den okunur (güncel ay 6 saatte bir yenilenir: scripts/umm-sync.mts). Süren / son 24 saat / son 7 gün
 * penceresinde çıkan kapasite ve liste, son 14 günün saatlik seri. Hesap lib/analysis/outage-list.ts. Bildirimlerde yayım zamanı
 * ve yakıt türü yoktur: "süren" bildirilen başlangıç ve bitişe göre; tür yalnız santral rehberindeki (RES / GES / HES) santrallerde.
 */

import { activeAt, hourlyLoss, overlapping, toOutageRows, totalLossMw, type OutageRow } from "@/lib/analysis/outage-list";
import { mergeUmmYears } from "@/lib/pool/umm-codec";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadDocs } from "@/lib/services/outage-notices";

const HOUR = 3_600_000;
const TTL_MS = 30 * 60_000;
export const OUTAGE_LIST_LIMIT = 300;
const SERIES_DAYS = 14;

export type OutageWindow = "active" | "24h" | "7d";
export const isOutageWindow = (w: unknown): w is OutageWindow => w === "active" || w === "24h" || w === "7d";

export interface OutageListRow extends OutageRow {
  /** Santral rehberinde kartı olan santralin EPİAŞ kimliği; yoksa null */
  plantId: number | null;
  type: "RES" | "HES" | "GES" | null;
}

export interface OutageMonitor {
  /** Duvar saati, ISO (UTC alanlarında): "şimdi" */
  now: string;
  /** En son bildirim çekimi (gerçek an, ISO); havuz yoksa null */
  fetchedAt: string | null;
  coverage: { from: string; to: string } | null;
  summary: { activeCount: number; activeMw: number };
  window: OutageWindow;
  /** Pencerede kalan bildirim sayısı (liste sınırından önce) */
  total: number;
  rows: OutageListRow[];
  /** Son 14 gün, saatlik (t: duvar saati ISO) */
  series: Array<{ t: string; mw: number; count: number }>;
}

let uevcbMemo: { at: number; promise: Promise<Map<number, { id: number; type: "RES" | "HES" | "GES" | null }>> } | null = null;

/** Uzlaştırma birimi → santral (havuzdaki plant.json'lardan); kartı olan santralin türü ayrıca */
function uevcbIndex(now = Date.now()) {
  if (uevcbMemo && now - uevcbMemo.at < TTL_MS) return uevcbMemo.promise;
  const promise = (async () => {
    const map = new Map<number, { id: number; type: "RES" | "HES" | "GES" | null }>();
    const ids = await listPoolPlants();
    for (let i = 0; i < ids.length; i += 64) {
      const infos = await Promise.all(ids.slice(i, i + 64).map((id) => readPoolPlantInfo(id).catch(() => null)));
      for (const info of infos) {
        if (!info?.uevcbs) continue;
        const hasCard = !!info.name && !!info.type && !info.kind;
        for (const u of info.uevcbs) map.set(u.id, { id: info.epiasPlantId, type: hasCard ? (info.type as "RES" | "HES" | "GES") : null });
      }
    }
    return map;
  })();
  uevcbMemo = { at: now, promise };
  promise.catch(() => {
    if (uevcbMemo?.promise === promise) uevcbMemo = null;
  });
  return promise;
}

const iso = (wallMs: number) => new Date(wallMs).toISOString().slice(0, 16);

export async function loadOutageMonitor(window: OutageWindow, nowMs = Date.now()): Promise<OutageMonitor> {
  const wallNow = nowMs + 3 * HOUR;
  const docs = await loadDocs();
  const months = docs.flatMap((d) => Object.entries(d.months).map(([mm, f]) => ({ year: d.year, month: Number(mm), fetchedAt: f.fetchedAt })));
  months.sort((a, b) => a.year - b.year || a.month - b.month);
  const fetchedAt = months.length ? months.map((m) => m.fetchedAt).sort().at(-1)! : null;
  const mm = (m: { year: number; month: number }) => `${m.year}-${String(m.month).padStart(2, "0")}`;
  const coverage = months.length ? { from: mm(months[0]), to: mm(months[months.length - 1]) } : null;

  const { rows: all } = toOutageRows(mergeUmmYears(docs));
  const active = activeAt(all, wallNow);
  const inWindow =
    window === "active" ? active : overlapping(all, wallNow - (window === "24h" ? 24 : 7 * 24) * HOUR, wallNow + 1);
  inWindow.sort((a, b) => b.lossMw - a.lossMw || a.startMs - b.startMs);

  const index = await uevcbIndex();
  const rows: OutageListRow[] = inWindow.slice(0, OUTAGE_LIST_LIMIT).map((r) => {
    const p = r.uevcbId !== null ? index.get(r.uevcbId) : undefined;
    return { ...r, plantId: p?.type ? p.id : null, type: p?.type ?? null };
  });

  // Seri en son bildirim çekimine kadar: sonrasında başlayan bildirimler henüz havuzda olmadığı için eksik sayılırdı
  const hourStart = Math.floor((fetchedAt ? Math.min(wallNow, Date.parse(fetchedAt) + 3 * HOUR) : wallNow) / HOUR) * HOUR;
  const series = hourlyLoss(all, hourStart - (SERIES_DAYS * 24 - 1) * HOUR, hourStart + HOUR).map((s) => ({ t: iso(s.t), mw: Math.round(s.mw), count: s.count }));

  return {
    now: iso(wallNow),
    fetchedAt,
    coverage,
    summary: { activeCount: active.length, activeMw: Math.round(totalLossMw(active)) },
    window,
    total: inWindow.length,
    rows,
    series,
  };
}
