/**
 * TR-Energy Analyst - Piyasa geneli arızalı kapasite (Aşama 14: yön modelinin dış girdisi)
 *
 * Kaynak: EPİAŞ piyasa mesaj sistemi bildirimleri (havuz: data/pool/umm). Bir bildirimin kaybı
 * max(0, işletmedeki güç − olay anındaki kapasite) MW'tır ve [başlangıç, bitiş) aralığında sürer.
 *
 * Bilgi anı: bildirimlerde yayım zamanı yok. Temkinli varsayım: bildirim başlangıç anında bilinir; önceden ilan edilmiş
 * planlı bakım ileriye dönük kullanılmaz. Bitiş, EPİAŞ'taki son hâlidir: "karar anında sürüyor mu" sorusu bitişin karar
 * anından sonra olup olmadığına bakar (o anda bitiş bildirilmemiş olması gözlenebilir; sonradan öne çekilen bitişler
 * küçük bir sızıntı olabilir, metodolojide yazılır).
 *
 * Zamanlar: bildirimler +03:00 ofsetli gerçek zaman; uygulama duvar saatini UTC alanlarında tutar (gerçek an + 3 saat).
 * SAF: I/O yok.
 */

import type { UmmMessage } from "@/lib/pool/umm-codec";

const HOUR = 3_600_000;

/** "+03:00" ofsetli zamanı uygulamanın duvar saati ms'ine çevirir; geçersizse null */
export function wallClockMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t + 3 * HOUR : null;
}

export interface OutageIndex {
  /** Duvar saati t anında süren arızalı kapasite (MW): başlangıç ≤ t < bitiş */
  activeMw: (t: number) => number;
  /** Dizine giren bildirim ve atlanan (zamanı geçersiz ya da kaybı 0) bildirim sayısı */
  used: number;
  skipped: number;
  /** Dizinin kapsadığı ilk ve son başlangıç (duvar saati ms) */
  firstStart: number | null;
  lastStart: number | null;
}

/** Sıralı dizide ≤ t olan son elemanın sırası + 1 */
function countAtMost(sorted: number[], t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Bildirimlerden arızalı kapasite dizini. Süren kapasite = Σ(başlangıcı ≤ t) − Σ(bitişi ≤ t), önek toplamlarıyla
 * O(log n). Kimliği aynı bildirim bir kez sayılır.
 */
export function buildOutageIndex(messages: UmmMessage[]): OutageIndex {
  const starts: Array<[number, number]> = [];
  const ends: Array<[number, number]> = [];
  const seen = new Set<number>();
  let skipped = 0;
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const s = wallClockMs(m.caseStartDate);
    const e = wallClockMs(m.caseEndDate);
    const loss = Math.max(0, Number(m.operatorPower ?? 0) - Number(m.capacityAtCaseTime ?? 0));
    if (s === null || e === null || e <= s || !Number.isFinite(loss) || loss <= 0) {
      skipped++;
      continue;
    }
    starts.push([s, loss]);
    ends.push([e, loss]);
  }
  const prep = (list: Array<[number, number]>) => {
    list.sort((a, b) => a[0] - b[0]);
    const times = list.map(([t]) => t);
    const prefix = [0];
    for (const [, mw] of list) prefix.push(prefix[prefix.length - 1] + mw);
    return { times, prefix };
  };
  const S = prep(starts);
  const E = prep(ends);
  return {
    activeMw: (t) => Math.max(0, S.prefix[countAtMost(S.times, t)] - E.prefix[countAtMost(E.times, t)]),
    used: starts.length,
    skipped,
    firstStart: S.times[0] ?? null,
    lastStart: S.times[S.times.length - 1] ?? null,
  };
}
