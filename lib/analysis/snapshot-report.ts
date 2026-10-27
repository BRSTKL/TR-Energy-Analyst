/**
 * TR-Energy Analyst - Anlık görüntü raporu (veri havuzu: lib/pool/snapshot-store.ts)
 *
 * Bir günün (hedef gün) serisi birçok çekimde görülür: ilk kez yarın olarak, ertesi gün bugün olarak. Burada her (gün, seri) için
 *  - ilk kez dolu görüldüğü an (yayım saatinin üst sınırı: çekimler arası aralık kadar belirsiz),
 *  - çekimler arası değişim (revizyon),
 *  - her çekimin gerçekleşen rüzgâra hatası (hangi saatteki sürüm daha iyi)
 * hesaplanır. SAF: I/O yok (okuma scripts/analysis/snapshot-report.mts).
 */

import type { Snapshot, SnapshotSeries, SnapshotSeriesId } from "@/lib/pool/snapshot-store";

export interface Version {
  /** Çekim anı, Türkiye duvar saati ("2026-10-27T12:25:00+03:00") */
  wall: string;
  takenAt: string;
  series: SnapshotSeries;
}

/** (hedef gün, seri) → çekimlerdeki sürümler, çekim zamanına göre */
export function versionsByDay(snaps: Snapshot[]): Map<string, Map<SnapshotSeriesId, Version[]>> {
  const out = new Map<string, Map<SnapshotSeriesId, Version[]>>();
  for (const snap of [...snaps].sort((a, b) => a.takenAt.localeCompare(b.takenAt))) {
    for (const s of snap.series) {
      let byId = out.get(s.day);
      if (!byId) out.set(s.day, (byId = new Map()));
      let list = byId.get(s.id);
      if (!list) byId.set(s.id, (list = []));
      list.push({ wall: snap.wall, takenAt: snap.takenAt, series: s });
    }
  }
  return out;
}

/** İlk kez en az `minCount` kayıtla dolu görülen çekim; hiç yoksa null */
export function firstSeen(versions: Version[], minCount = 1): Version | null {
  return versions.find((v) => v.series.ok && v.series.count >= minCount) ?? null;
}

/** 15 dakikalık (ya da saatlik) kayıtlardan saatlik ortalama (saat 0–23); kayıt yoksa null */
export function hourly(items: unknown[], valueField: string, timeField: string): Array<number | null> {
  const sum = Array(24).fill(0);
  const n = Array(24).fill(0);
  for (const raw of items as Array<Record<string, unknown>>) {
    const t = raw[timeField];
    const v = raw[valueField];
    if (typeof t !== "string" || typeof v !== "number" || !Number.isFinite(v)) continue;
    const h = Number(t.slice(11, 13));
    if (h < 0 || h > 23) continue;
    sum[h] += v;
    n[h]++;
  }
  return sum.map((s, h) => (n[h] ? s / n[h] : null));
}

/** İki saatlik seri arasındaki ortalama mutlak fark (ikisinin de dolu olduğu saatlerde); ortak saat yoksa null */
export function meanAbsDiff(a: Array<number | null>, b: Array<number | null>): number | null {
  let s = 0;
  let n = 0;
  for (let h = 0; h < 24; h++) {
    if (a[h] === null || b[h] === null) continue;
    s += Math.abs(a[h]! - b[h]!);
    n++;
  }
  return n ? s / n : null;
}

export interface RevisionRow {
  from: string;
  to: string;
  meanAbsDiff: number | null;
}

/** Ardışık sürümler arasındaki saatlik ortalama mutlak değişim (yalnız dolu sürümler) */
export function revisions(versions: Version[], valueField: string, timeField: string): RevisionRow[] {
  const filled = versions.filter((v) => v.series.ok && v.series.count > 0);
  const rows: RevisionRow[] = [];
  for (let i = 1; i < filled.length; i++) {
    rows.push({
      from: filled[i - 1].wall,
      to: filled[i].wall,
      meanAbsDiff: meanAbsDiff(hourly(filled[i - 1].series.items, valueField, timeField), hourly(filled[i].series.items, valueField, timeField)),
    });
  }
  return rows;
}

/** Her sürümün gerçekleşene hatası (saatlik ortalama mutlak, MW) */
export function errorsAgainst(versions: Version[], valueField: string, timeField: string, actual: Array<number | null>): Array<{ wall: string; mae: number | null }> {
  return versions
    .filter((v) => v.series.ok && v.series.count > 0)
    .map((v) => ({ wall: v.wall, mae: meanAbsDiff(hourly(v.series.items, valueField, timeField), actual) }));
}

/** "2026-10-27T12:25:00+03:00" → saat.dakika sayısı (12.4166…) */
export const wallClockHours = (wall: string) => Number(wall.slice(11, 13)) + Number(wall.slice(14, 16)) / 60;
