/**
 * TR-Energy Analyst - Değişim algılama ve arıza uyarısı: tespit fonksiyonları (Aşama 22.7 a–c; rüzgârda 23.7)
 *
 * Santralin davranışı birden değişirse eğitim penceresi eski santrali öğretir: kapasite artışı, uzun arıza, yanlış konum.
 * Bu modül yalnız UYARI üretir; hiçbir kaydı değiştirmez (kurulu güç CLAUDE.md kuralıyla yalnız resmî kayıttan yazılır,
 * konum `lib/services/plant-location.ts` kuralıyla). Çıktı tahmin sayfasındaki uyarı satırına ve günlük akış günlüğüne
 * gider (bağlama ayrı iş: 22.7 d).
 *
 * (a) Kapasite değişimi (`capacityChange`, teknolojiden bağımsız): son 30 günün en yüksek saatlik üretimi
 *     - kayıtlı kurulu gücü %10'dan fazla aşıyor ("over"; YEKDEM eşleşmesindeki aynı eşik), ya da
 *     - önceki 90 günün en yüksek üretiminin %60'ının altında kalıyor ("under"; kısmi arıza ya da kapasite düşüşü;
 *       mevsim düşüşü güneşte Ekim → Aralık ≈ %20–30, eşiğin üstünde kalır).
 * (b) Uzun arıza (`longOutage`, güneş): gerçekleşen ışınıma göre açık gökte (günlük GHI ≥ açık gök GHI'sinin %60'ı) üretim
 *     santralin olağan açık gök gününün %5'inin altında, en az 2 gün üst üste. Bulutlu gün sayılmaz, diziyi de bozmaz;
 *     üretimli bir gün diziyi bitirir.
 * (c) Konum tutarsızlığı (`locationShift`, güneş): açık gök günlerinde üretimin saat ağırlık merkezi ile santralin
 *     koordinatındaki açık gök ışınımının ağırlık merkezi arasındaki fark (dakika; boylamda 1° = 4 dakika). Yalnız kaba
 *     hatayı yakalar (yer değiştirmiş enlem / boylam, başka santralin kaydı): ilçe merkezi tahmini (≈ 0,2–0,5°, 1–2 dk)
 *     panel yönü ve kırpmanın etkisinin altında kalır. Eşik 20 dakika (≈ 5° boylam).
 *
 * Girdi: gerçekleşen bilgiler (UEVM ya da geçici GZÜ, uydu ışınımı). Tahmin girdisi değildir, bilgi zamanı denetimi
 * gerekmez; çağıran yalnız `asOf` anında elde olan saatleri verir. Zaman: duvar saati ms. SAF: I/O yok.
 */

import { clearSkyGhiHour } from "@/lib/solar-engine/physics/solar-geometry";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const CAPACITY_WINDOW_DAYS = 30;
export const CAPACITY_REF_DAYS = 90;
export const CAPACITY_OVER = 1.1;
export const CAPACITY_UNDER = 0.6;
/** Pencerede en az bu kadar günün verisi olmalı */
export const MIN_WINDOW_DAYS = 20;

export const CLEAR_DAY_INDEX = 0.6;
export const OUTAGE_SHARE = 0.05;
export const OUTAGE_MIN_DAYS = 2;
/** Olağan açık gök günü: önceki 60 günün açık gök günlerinin medyan üretimi */
export const OUTAGE_REF_DAYS = 60;

export const LOCATION_SHIFT_MAX_MIN = 20;
export const LOCATION_MIN_DAYS = 10;

export type ChangeKind = "capacity_over" | "capacity_under" | "long_outage" | "location_shift";

export interface ChangeWarning {
  kind: ChangeKind;
  /** Ekran ve günlük için kısa Türkçe açıklama */
  message: string;
  /** Uyarının dayandığı sayılar */
  values: Record<string, number>;
}

export interface ProductionHour {
  t: number;
  uevm: number | null;
}

export interface SolarObservedHour extends ProductionHour {
  /** Gerçekleşen yatay ışınım (uydu, W/m²; saat ortalaması); yoksa null */
  ghi: number | null;
}

const dayOf = (t: number) => Math.floor(t / DAY) * DAY;
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Pencerenin en yüksek saatlik üretimi ve veri olan gün sayısı */
function peakIn(hours: ProductionHour[], from: number, to: number): { peak: number; days: number } {
  let peak = 0;
  const days = new Set<number>();
  for (const h of hours) {
    if (h.uevm === null || h.t < from || h.t >= to) continue;
    days.add(dayOf(h.t));
    if (h.uevm > peak) peak = h.uevm;
  }
  return { peak, days: days.size };
}

/** (a) Kapasite değişimi; `asOf`: elde olan son verinin ertesi günü (pencere [asOf − 30 gün, asOf)) */
export function capacityChange(hours: ProductionHour[], recordedMw: number | null, asOf: number): ChangeWarning | null {
  const winFrom = asOf - CAPACITY_WINDOW_DAYS * DAY;
  const win = peakIn(hours, winFrom, asOf);
  if (win.days < MIN_WINDOW_DAYS) return null;
  if (recordedMw !== null && recordedMw > 0 && win.peak > CAPACITY_OVER * recordedMw)
    return {
      kind: "capacity_over",
      message: `Son ${CAPACITY_WINDOW_DAYS} günün en yüksek saatlik üretimi ${nf(win.peak)} MWh, kayıtlı kurulu gücün (${nf(recordedMw)} MW) %${nf((win.peak / recordedMw - 1) * 100, 0)} üstünde: kapasite artışı ya da kayıt hatası. Kurulu güç otomatik değiştirilmez.`,
      values: { peakMwh: win.peak, recordedMw },
    };
  const ref = peakIn(hours, winFrom - CAPACITY_REF_DAYS * DAY, winFrom);
  if (ref.days >= MIN_WINDOW_DAYS && ref.peak > 0 && win.peak < CAPACITY_UNDER * ref.peak)
    return {
      kind: "capacity_under",
      message: `Son ${CAPACITY_WINDOW_DAYS} günün en yüksek saatlik üretimi ${nf(win.peak)} MWh, önceki ${CAPACITY_REF_DAYS} günün en yükseğinin (${nf(ref.peak)} MWh) %${nf((win.peak / ref.peak) * 100, 0)}'i: kısmi arıza ya da kapasite düşüşü olabilir.`,
      values: { peakMwh: win.peak, refPeakMwh: ref.peak },
    };
  return null;
}

interface SolarDay {
  day: number;
  uevm: number;
  ghi: number;
  clear: number;
  /** Gün tam mı (ışınım ve üretim gündüz saatlerinin hepsinde var) */
  complete: boolean;
}

function solarDays(hours: SolarObservedHour[], site: { latitude: number; longitude: number }): SolarDay[] {
  const map = new Map<number, SolarDay>();
  for (const h of hours) {
    const d = dayOf(h.t);
    let s = map.get(d);
    if (!s) {
      s = { day: d, uevm: 0, ghi: 0, clear: 0, complete: true };
      map.set(d, s);
    }
    const cs = clearSkyGhiHour(site.latitude, site.longitude, h.t);
    if (cs <= 0) continue;
    if (h.uevm === null || h.ghi === null) {
      s.complete = false;
      continue;
    }
    s.uevm += Math.max(0, h.uevm);
    s.ghi += h.ghi;
    s.clear += cs;
  }
  return Array.from(map.values())
    .filter((s) => s.complete && s.clear > 0)
    .sort((a, b) => a.day - b.day);
}

const isClear = (s: SolarDay) => s.ghi >= CLEAR_DAY_INDEX * s.clear;

/** (b) Uzun arıza (güneş): en son dizi; `ongoing` dizi verinin son açık gök gününe kadar sürüyorsa */
export function longOutage(hours: SolarObservedHour[], site: { latitude: number; longitude: number }): (ChangeWarning & { ongoing: boolean }) | null {
  const days = solarDays(hours, site);
  let run: SolarDay[] = [];
  let last: SolarDay[] = [];
  let lastEndsAtEnd = false;
  for (let i = 0; i < days.length; i++) {
    const s = days[i];
    const ref = median(
      days.filter((x) => x.day < s.day && x.day >= s.day - OUTAGE_REF_DAYS * DAY && isClear(x) && !run.includes(x)).map((x) => x.uevm)
    );
    if (ref === null || ref <= 0) continue;
    const dead = s.uevm < OUTAGE_SHARE * ref;
    if (isClear(s) && dead) run.push(s);
    else if (!dead) {
      if (run.length >= OUTAGE_MIN_DAYS) last = run;
      run = [];
    }
    // bulutlu ve üretimsiz gün: sayılmaz, diziyi bozmaz
  }
  if (run.length >= OUTAGE_MIN_DAYS) {
    last = run;
    lastEndsAtEnd = true;
  }
  if (!last.length) return null;
  const from = isoDay(last[0].day);
  const to = isoDay(last[last.length - 1].day);
  return {
    kind: "long_outage",
    ongoing: lastEndsAtEnd,
    message: `${from} – ${to}: ${last.length} açık gök gününde üretim olağanın %${OUTAGE_SHARE * 100}'inin altında (uzun arıza ya da bağlantı kesintisi)${lastEndsAtEnd ? "; sürüyor" : ""}.`,
    values: { days: last.length, from: last[0].day, to: last[last.length - 1].day },
  };
}

/** (c) Konum tutarsızlığı (güneş): açık gök günlerinde üretim ağırlık merkezi − açık gök ağırlık merkezi (dakika, medyan) */
export function locationShift(hours: SolarObservedHour[], site: { latitude: number; longitude: number }): (ChangeWarning & { shiftMin: number; days: number }) | null {
  const days = solarDays(hours, site);
  const clearDays = new Set(days.filter(isClear).map((d) => d.day));
  const acc = new Map<number, { p: number; pt: number; c: number; ct: number }>();
  for (const h of hours) {
    const d = dayOf(h.t);
    if (!clearDays.has(d) || h.uevm === null) continue;
    const cs = clearSkyGhiHour(site.latitude, site.longitude, h.t);
    const mid = (h.t - d) / HOUR + 0.5;
    const a = acc.get(d) ?? { p: 0, pt: 0, c: 0, ct: 0 };
    const p = Math.max(0, h.uevm);
    a.p += p;
    a.pt += p * mid;
    a.c += cs;
    a.ct += cs * mid;
    acc.set(d, a);
  }
  const shifts: number[] = [];
  for (const a of acc.values()) if (a.p > 0 && a.c > 0) shifts.push((a.pt / a.p - a.ct / a.c) * 60);
  if (shifts.length < LOCATION_MIN_DAYS) return null;
  const shiftMin = median(shifts)!;
  if (Math.abs(shiftMin) <= LOCATION_SHIFT_MAX_MIN) return null;
  return {
    kind: "location_shift",
    shiftMin,
    days: shifts.length,
    message: `Açık gök günlerinde üretim, kayıtlı konumun güneş öğlesine göre ${nf(Math.abs(shiftMin), 0)} dakika ${shiftMin > 0 ? "geç" : "erken"} (${shifts.length} gün; ≈ ${nf(Math.abs(shiftMin) / 4)}° boylam): konum ya da kayıt yanlış olabilir.`,
    values: { shiftMin, days: shifts.length },
  };
}
