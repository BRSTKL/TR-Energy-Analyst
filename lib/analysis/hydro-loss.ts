/**
 * TR-Energy Analyst - Hidroda kayıp üretim (sektör sayfası "Kayıp üretim" kartının Hidro alt başlığı; kullanıcı 18.10.2026)
 *
 * Hidroda "santral o saatte ne üretebilirdi" dışarıdan ölçülemez (açık saatlik akış verisi yok; barajlı santralde
 * üretmemek çoğu zaman karar). İki kaynak:
 *   1. BİLDİRİLEN KAYIP (ana): EPİAŞ arıza / bakım bildirimleri (piyasa mesaj sistemi). Saat başına kullanılamayan güç =
 *      santralin normal gücü (operatorPower) − olay sırasında kullanılabilen güç (capacityAtCaseTime); aynı saate düşen
 *      bildirimlerden en büyüğü (çift sayım yok); o saatte gerçekleşen üretim verilirse normal güç − üretimi aşamaz (bir
 *      ünite için bütün santrali bildiren kayıtlar). Su / kaynak durumu gerekçeli bildirimler (kaynak yetersizliği, düşük
 *      göl seviyesi, boğulma) kayıp değil: ayrı (`resource`). Kayıp MWh = Σ saat. Şirketin beyanıdır; nehir o saatte zaten
 *      azsa gerçek kayıp daha az olabilir: "en çok".
 *   2. ÜRETİMDEN ANİ DÜŞÜŞLER (yalnız nehir tipi, çapraz kontrol): akış saatler içinde birden değişmez. Saatin "olması
 *      gereken" üretimi çevresindeki DROP_WINDOW_H saatin (öncesi ve sonrası) üretim medyanı; medyan kurulu gücün
 *      DROP_MIN_REF'inin üstünde iken üretim bunun DROP_SHARE'inin altına düşüp en az DROP_MIN_HOURS saat kalırsa olay.
 *      Kayıp = Σ (medyan − üretim). İlk KGÜP olay saatlerinin çoğunda medyanın %10'unun altındaysa planlı. Pencereden uzun
 *      duruşlar (medyanı da düşürür) görünmez: alt sınır. Barajlıya uygulanmaz.
 * SAF: I/O yok.
 */

import type { Notice, NoticeCause } from "./outage-validation";

const HOUR = 3_600_000;
export const DROP_WINDOW_H = 72;
export const DROP_MIN_REF = 0.3;
export const DROP_SHARE = 0.2;
export const DROP_MIN_HOURS = 6;
const PLANNED_SHARE = 0.1;

/**
 * [from, to) içinde saat → kullanılamayan güç (MW) ve nedeni; çakışan bildirimlerde en büyüğü. `resource: true` dönerse
 * yalnız su / kaynak durumu bildirimleri, değilse yalnız diğerleri. `produced`: saat → üretim (MWh; sınır için).
 */
export function reportedUnavailable(
  notices: Notice[],
  from: number,
  to: number,
  opts: { resource?: boolean; produced?: Map<number, number | null> } = {}
): Map<number, { mw: number; cause: NoticeCause }> {
  const out = new Map<number, { mw: number; cause: NoticeCause }>();
  for (const n of notices) {
    if (!!n.resource !== !!opts.resource) continue;
    const mw = Math.max(0, n.operatorPower - n.capacityAtCaseTime);
    if (mw <= 0) continue;
    const a = Math.max(from, Math.floor(n.start / HOUR) * HOUR);
    const b = Math.min(to, n.end);
    for (let t = a; t < b; t += HOUR) {
      // Saatin kapsanan kısmı: bildirim saatin ortasında başlıyor / bitiyorsa oranlanır
      const share = (Math.min(b, t + HOUR) - Math.max(n.start, t)) / HOUR;
      if (share <= 0) continue;
      const u = opts.produced?.get(t);
      const v = Math.min(mw, u === null || u === undefined ? mw : Math.max(0, n.operatorPower - u)) * share;
      if (v <= 0) continue;
      const cur = out.get(t);
      if (!cur || v > cur.mw) out.set(t, { mw: v, cause: n.cause });
    }
  }
  return out;
}

export interface DropEvent {
  start: number;
  hours: number;
  lostMwh: number;
  planned: boolean;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Nehir tipi santralde üretimdeki ani düşüşler (saatler sıralı, saat başı; eksik üretim null) */
export function detectHydroDrops(hours: Array<{ t: number; uevm: number | null; kgupFirst: number | null }>, capacityMw: number): DropEvent[] {
  const n = hours.length;
  const ref: Array<number | null> = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const around: number[] = [];
    for (let j = Math.max(0, i - DROP_WINDOW_H); j <= Math.min(n - 1, i + DROP_WINDOW_H); j++) {
      const u = hours[j].uevm;
      if (j !== i && u !== null) around.push(u);
    }
    if (around.length >= DROP_WINDOW_H) ref[i] = median(around);
  }
  const low = (i: number) => {
    const r = ref[i];
    const u = hours[i].uevm;
    return r !== null && u !== null && r >= DROP_MIN_REF * capacityMw && u < DROP_SHARE * r;
  };
  const events: DropEvent[] = [];
  for (let i = 0; i < n; ) {
    if (!low(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && low(j + 1) && hours[j + 1].t - hours[j].t === HOUR) j++;
    const len = j - i + 1;
    if (len >= DROP_MIN_HOURS) {
      let lost = 0;
      let planned = 0;
      for (let k = i; k <= j; k++) {
        lost += ref[k]! - hours[k].uevm!;
        const kg = hours[k].kgupFirst;
        if (kg !== null && kg < PLANNED_SHARE * ref[k]!) planned++;
      }
      events.push({ start: hours[i].t, hours: len, lostMwh: lost, planned: planned * 2 > len });
    }
    i = j + 1;
  }
  return events;
}
