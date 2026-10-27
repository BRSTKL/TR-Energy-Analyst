/**
 * TR-Energy Analyst - Teklif öncesi görünüm: yeni bulunan verilerin etkisi (ÖNİZLEME; saf, I/O yok)
 *
 * Aynı yürüyen geriye test (her gün yalnız o günden önceki verilerle, lib/analysis/pre-bid.ts içindeki Model) birkaç değişkenle
 * tekrarlanır ve saatlik ortalama mutlak hata (TL/MWh) mevcut modelle günlük eşleştirilerek karşılaştırılır:
 *   gas      : doğal gaz GRF'nin bir önceki günkü değeri, ek değişken (günlük değer, referans günlerin ortancasından sapma)
 *   sunReal  : net yükteki KGÜP güneş vekili yerine GERÇEKLEŞEN güneş (gerçek zamanlı + lisanssız). Teklif saatinde bilinmez: ÜST SINIR.
 *   both     : ikisi birlikte
 *   neighbor : bir önceki günün PTF − Bulgaristan fiyatı farkı (ENTSO-E, TL/MWh, saatlik), ek değişken (teklif saatinde bilinir)
 *   flows    : bir önceki günün toplam net ihracatı (Bulgaristan + Yunanistan, MW, saatlik), ek değişken (teklif saatinde bilinir)
 *   hydro    : DSİ enerji amaçlı baraj doluluğu (%), hedef günden iki gün önceki son yayım, ek değişken (teklif saatinde bilinir)
 * Fark, günlük hata farklarının ortalaması ± standart hatası ile yargılanır; ±2 standart hata içindeki fark "gürültü" sayılır.
 */

import { dayClass } from "./daily-market";
import { Model, shiftDay, PREBID_FORECAST_FROM, type DayData } from "./pre-bid";

const H = 24;
const full = (a: number[] | null | undefined): a is number[] =>
  !!a && a.length === H && a.every((v) => Number.isFinite(v));

export type EffectId = "gas" | "sunReal" | "both" | "hydro" | "neighbor" | "flows";

export interface EffectInput {
  days: Map<string, DayData>;
  /** Doğal gaz GRF (TL / 1000 Sm³), gün → değer */
  gas: Map<string, number>;
  /** Enerji amaçlı baraj doluluğu (%), gün → son bilinen değer; boş olabilir */
  hydro?: Map<string, number>;
  /** Gün → 24 saatlik PTF − Bulgaristan fiyatı (TL/MWh); gün: fiyatın günü */
  neighbor?: Map<string, number[]>;
  /** Gün → 24 saatlik toplam net ihracat (MW) */
  flows?: Map<string, number[]>;
  /** Gerçekleşen güneş (MW, saatlik), gün → 24 değer; lisanssız dahil */
  sunReal: Map<string, number[]>;
  /** Değerlendirilecek son gün (dahil) */
  last: string;
}

export interface EffectRow {
  id: EffectId;
  days: number;
  /** Mevcut modelin ve değişkenli modelin saatlik ortalama mutlak hatası (TL/MWh), aynı günlerde */
  currentMae: number;
  variantMae: number;
  /** Pozitif = hata azaldı (%) */
  improvementPct: number;
  /** Değişkenli modelin mevcuttan iyi olduğu günlerin oranı (%) */
  betterDaysPct: number;
  /** Günlük hata farkı (mevcut − değişkenli) ortalaması ve standart hatası (TL/MWh) */
  diffMean: number;
  diffSe: number;
  verdict: "better" | "worse" | "noise";
  /** Aynı günlerde referansın (son 28 gün ortancası) hatası */
  baselineMae: number;
  firstDay: string;
  lastDay: string;
}

const mae = (a: number[], b: number[]) =>
  a.reduce((s, v, h) => s + Math.abs(v - b[h]), 0) / H;
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

export function measureEffects(input: EffectInput): EffectRow[] {
  const { days, gas, sunReal, last } = input;
  const hydro = input.hydro ?? new Map<string, number>();
  const dayBefore = (m: Map<string, number[]> | undefined) => (d: string) =>
    m?.get(shiftDay(d, -1)) ?? null;
  const gasFeature = (d: string) => {
    const g = gas.get(shiftDay(d, -1));
    return g === undefined ? null : Array<number>(H).fill(g);
  };
  const hydroFeature = (d: string) => {
    const h = hydro.get(shiftDay(d, -2));
    return h === undefined ? null : Array<number>(H).fill(h);
  };
  const prevPtf = () => null;
  const variants: Array<{ id: EffectId; model: Model }> = [
    { id: "gas", model: new Model(days, prevPtf, { extras: [gasFeature] }) },
    {
      id: "sunReal",
      model: new Model(days, prevPtf, { sun: (d) => sunReal.get(d) ?? null }),
    },
    {
      id: "both",
      model: new Model(days, prevPtf, {
        sun: (d) => sunReal.get(d) ?? null,
        extras: [gasFeature],
      }),
    },
    { id: "hydro", model: new Model(days, prevPtf, { extras: [hydroFeature] }) },
    {
      id: "neighbor",
      model: new Model(days, prevPtf, { extras: [dayBefore(input.neighbor)] }),
    },
    {
      id: "flows",
      model: new Model(days, prevPtf, { extras: [dayBefore(input.flows)] }),
    },
  ];
  const current = new Model(days, prevPtf);

  const acc = new Map<
    EffectId,
    { cur: number[]; var: number[]; base: number[]; days: string[] }
  >();
  for (const v of variants) acc.set(v.id, { cur: [], var: [], base: [], days: [] });

  for (let d = shiftDay(PREBID_FORECAST_FROM, 14); d <= last; d = shiftDay(d, 1)) {
    const x = days.get(d);
    const y = days.get(shiftDay(d, -1));
    if (!x || !full(x.ptf) || !full(x.lep) || !full(x.windF) || !y || !full(y.ptf))
      continue;
    const r1 = current.resid(shiftDay(d, -1));
    const c = r1 && current.predict(d, x.lep, x.windF, r1);
    if (!c || dayClass(d) === "half") continue;
    for (const v of variants) {
      const r = v.model.resid(shiftDay(d, -1));
      const p = r && v.model.predict(d, x.lep, x.windF, r);
      if (!p) continue;
      const a = acc.get(v.id)!;
      a.cur.push(mae(x.ptf, c.expected));
      a.var.push(mae(x.ptf, p.expected));
      a.base.push(mae(x.ptf, c.base.mP));
      a.days.push(d);
    }
  }

  return variants.flatMap(({ id }) => {
    const a = acc.get(id)!;
    const n = a.days.length;
    if (n < 10) return [];
    const diff = a.cur.map((v, i) => v - a.var[i]);
    const m = mean(diff);
    const sd = Math.sqrt(diff.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
    const se = sd / Math.sqrt(n);
    return [
      {
        id,
        days: n,
        currentMae: mean(a.cur),
        variantMae: mean(a.var),
        improvementPct: (m / mean(a.cur)) * 100,
        betterDaysPct: (diff.filter((v) => v > 0).length / n) * 100,
        diffMean: m,
        diffSe: se,
        verdict: m > 2 * se ? "better" : m < -2 * se ? "worse" : "noise",
        baselineMae: mean(a.base),
        firstDay: a.days[0],
        lastDay: a.days[n - 1],
      } satisfies EffectRow,
    ];
  });
}
