/**
 * TR-Energy Analyst - Rüzgârda kısıntı / arıza kaybı (güneşteki lib/forecast/curtailment.ts'in rüzgâr karşılığı)
 *
 * Gerçekleşen rüzgâr (ECMWF IFS 9 km / ERA5, 100 m; lib/weather/reanalysis-wind.ts) santralin kendi üretiminden öğrenilen
 * güç eğrisiyle beklenen üretime çevrilir. Eğri: hız (WIND_BIN m/s) × yön (SECTORS dilim) hücresinde üretimin medyanı;
 * hücrede yeterli saat yoksa yalnız hız dilimi. (Gün dilimi ayrımı denendi, 17.10.2026: sabah 08–10 olay yığılmasını
 * gidermedi, dilim sınırında yapay olay üretti; yığılma büyük olasılıkla mesai başında başlayan bildirilmemiş bakım.) 0,25° ızgara sırtı / vadiyi görmediği için eğri santrale özgüdür; yön
 * dilimi arazinin hızlandırma etkisini taşır. İki geçiş: ilk eğriyle bulunan kayıp saatleri ve şirketin ilk KGÜP'te
 * önceden düşürdüğü saatler eğitimden çıkarılıp eğri yeniden kurulur (kısıntı eğriyi aşağı çekmesin).
 *
 * KAYIP SAAT: beklenen üretim kapasitenin LOSS_EXPECTED_MIN'i üstünde iken üretim beklenenin LOSS_SHARE'inin altında.
 * Güneşten sıkı (orada %50): saatlik rüzgâr hatası büyük, yalnız açık kayıplar (santralin büyük kısmı durmuş) sayılır;
 * birkaç türbinin arızası görünmez. Türü güneşteki gibi: ilk KGÜP beklenenin %10'unun altındaysa "planlı".
 * Kalite: kayıpsız tam günlerde günlük beklenen ↔ gerçekleşen korelasyonu (`dailyR`); servis eşiğin altını göstermez.
 *
 * Yalnız ETİKETTİR (gerçekleşen bilgi); tahmin girdisi olamaz. SAF: I/O yok.
 */

import type { LossKind } from "./curtailment";

export const WIND_BIN = 0.5;
export const SECTORS = 8;
export const MIN_CELL = 15;
export const MIN_SPEED_CELL = 5;
export const LOSS_EXPECTED_MIN = 0.3;
export const LOSS_SHARE = 0.2;
export const PLANNED_SHARE = 0.1;
/** Gösterim eşiği: kayıpsız günlerde günlük korelasyon */
export const WIND_MIN_DAILY_R = 0.85;

const DAY = 86_400_000;

export interface WindLossInput {
  t: number;
  uevm: number | null;
  kgupFirst: number | null;
  /** Üretim saatinin ortalama 100 m rüzgâr hızı (m/s) ve yönü (derece) */
  ws: number | null;
  dir: number | null;
  ptf?: number | null;
}

export interface WindLossResult {
  lost: Map<number, LossKind>;
  /** Saat → beklenen üretim (MWh; rüzgârı ve eğri hücresi olan saatler) */
  expected: Map<number, number>;
  lostMwh: { planned: number; unplanned: number };
  steadyFrom: number | null;
  /** Kayıpsız tam günlerde günlük beklenen ↔ gerçekleşen korelasyonu; gün sayısı yetersizse null */
  dailyR: number | null;
  days: number;
  trainHours: number;
}

const bin = (ws: number) => Math.min(60, Math.floor(ws / WIND_BIN));
const sector = (dir: number) => Math.floor((((dir % 360) + 360 + 180 / SECTORS) % 360) / (360 / SECTORS));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function correlation(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 30) return null;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : null;
}

type Valid = WindLossInput & { uevm: number; ws: number; dir: number };

/** Güç eğrisi: hız × yön hücresi medyanı, yoksa hız dilimi medyanı (≥ MIN_SPEED_CELL saat), yoksa null */
export function fitPowerCurve(train: Array<{ uevm: number; ws: number; dir: number }>): (ws: number, dir: number) => number | null {
  const cells = new Map<string, number[]>();
  const speeds = new Map<number, number[]>();
  for (const h of train) {
    const b = bin(h.ws);
    const k = `${b}|${sector(h.dir)}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(h.uevm);
    (speeds.get(b) ?? speeds.set(b, []).get(b)!).push(h.uevm);
  }
  const cellMed = new Map(Array.from(cells, ([k, v]) => [k, v.length >= MIN_CELL ? median(v) : null] as const));
  const speedMed = new Map(Array.from(speeds, ([k, v]) => [k, v.length >= MIN_SPEED_CELL ? median(v) : null] as const));
  return (ws, dir) => cellMed.get(`${bin(ws)}|${sector(dir)}`) ?? speedMed.get(bin(ws)) ?? null;
}

/**
 * Rüzgâr kayıp saatleri. `capacityMw`: santralin kurulu gücü (kayıt ya da alt sınır; CLAUDE.md "Kurulu güç"); beklenen
 * üretim bununla sınırlanır ve kayıp eşiği buna göredir. `steadyFrom` verilirse öncesi kayıp sayılmaz (devreye alma).
 */
export function detectWindLoss(hours: WindLossInput[], capacityMw: number, opts: { steadyFrom?: number | null } = {}): WindLossResult {
  const steady = opts.steadyFrom ?? null;
  const valid = hours.filter((h): h is Valid => h.uevm !== null && h.ws !== null && h.dir !== null && (steady === null || h.t >= steady));
  const clean = (h: Valid) => (h.ptf ?? 1) > 0;
  const pass = (curve: (ws: number, dir: number) => number | null) => {
    const expected = new Map<number, number>();
    const lost = new Map<number, LossKind>();
    const lostMwh = { planned: 0, unplanned: 0 };
    for (const h of valid) {
      const e = curve(h.ws, h.dir);
      if (e === null) continue;
      const exp = Math.min(Math.max(0, e), capacityMw);
      expected.set(h.t, exp);
      if (exp < LOSS_EXPECTED_MIN * capacityMw || h.uevm >= LOSS_SHARE * exp) continue;
      const kind: LossKind = h.kgupFirst !== null && h.kgupFirst < PLANNED_SHARE * exp ? "planned" : "unplanned";
      lost.set(h.t, kind);
      lostMwh[kind] += exp - h.uevm;
    }
    return { expected, lost, lostMwh };
  };
  const first = pass(fitPowerCurve(valid.filter(clean)));
  // İkinci geçiş: kayıp saatleri ve ilk KGÜP'te önceden düşürülmüş saatler eğitim dışı
  const train = valid.filter((h) => {
    if (!clean(h) || first.lost.has(h.t)) return false;
    const e = first.expected.get(h.t);
    return !(e !== undefined && e >= LOSS_EXPECTED_MIN * capacityMw && h.kgupFirst !== null && h.kgupFirst < PLANNED_SHARE * e);
  });
  const r = pass(fitPowerCurve(train));

  // Kalite: kayıp saati olmayan tam günler
  const days = new Map<number, { a: number; e: number; n: number; lost: boolean }>();
  for (const h of valid) {
    const e = r.expected.get(h.t);
    if (e === undefined) continue;
    const d = Math.floor(h.t / DAY) * DAY;
    const x = days.get(d) ?? { a: 0, e: 0, n: 0, lost: false };
    x.a += h.uevm;
    x.e += e;
    x.n++;
    if (r.lost.has(h.t)) x.lost = true;
    days.set(d, x);
  }
  const full = Array.from(days.values()).filter((x) => x.n === 24 && !x.lost);
  return {
    ...r,
    steadyFrom: steady,
    dailyR: correlation(
      full.map((x) => x.a),
      full.map((x) => x.e)
    ),
    days: full.length,
    trainHours: train.length,
  };
}

/** Saatlik ortalama rüzgâr: üretim saati [t, t+1) ↔ damga t ve t+1'in ortalaması (yön damga t'den; vektör ortalaması) */
export function hourMeanWind(ws0: number | null, ws1: number | null, dir0: number | null, dir1: number | null): { ws: number | null; dir: number | null } {
  if (ws0 === null || ws1 === null || dir0 === null || dir1 === null) return { ws: null, dir: null };
  const rad = Math.PI / 180;
  const u = ws0 * Math.sin(dir0 * rad) + ws1 * Math.sin(dir1 * rad);
  const v = ws0 * Math.cos(dir0 * rad) + ws1 * Math.cos(dir1 * rad);
  const dir = ((Math.atan2(u, v) / rad) % 360 + 360) % 360;
  return { ws: (ws0 + ws1) / 2, dir };
}
