/**
 * TR-Energy Analyst - Yön tahminiyle plan ayarı: karar testi (Aşama 14.4)
 *
 * Mantık (DUY md. 110 fiyatları): sistem açıkken (SMF > PTF) eksik üretim SMF·(1+k) ile pahalıya, fazla üretim
 * PTF·(1−l) ile az kayıpla uzlaşır; sistem fazlayken tersi. Yön önceden bilinirse plan "ucuz tarafa" kaydırılabilir:
 * açık bekleniyorsa plan aşağı (k_düşük ≤ 1), fazla bekleniyorsa yukarı (k_yüksek ≥ 1).
 *
 * İki karar anı (direction-features.ts):
 * - "D-1": KGÜP gün öncesinde k ile çarpılır (GÖP'te satılan miktar değişir).
 * - "H-2": plan gün içinde (GİP'te) k ile değiştirilir; işlem maliyeti Δ × (GİP − PTF), Δ = (1 − k) × plan
 *   (intraday-trade.ts ile aynı tanım). GİP fiyatı olmayan saatte işlem yapılmaz (k = 1). Δ saatlik GİP hacminin %10'uyla
 *   sınırlıdır (capTradeMwh, PLAN 18.2; netleşmiş birim serisinde portföy bazında): sınır bağlarsa k 1'e doğru kısılır.
 *
 * Maliyete KÜPST farkı eklenir: plan kaydırmak sapmayı tolerans dışına itebilir. KÜPST santral bazındadır; netleşmiş
 * birim serisinde bile santrallerin kendi saatlerinden toplanır (`kupstDelta`). Toplayıcı topluluğunun portföy bazında
 * KÜPST'ü bu testte santral bazında (daha yüksek, temkinli) alınır.
 *
 * Eğitim (önceki aylar): eşik θ ve iki çarpan, KÜPST dahil toplam maliyeti en aza indirecek biçimde seçilir. Yön olasılıkları
 * walk-forward tahminlerdir (her biri yalnız kendi ayından önceki verilerle eğitilmiş modelden).
 *
 * Bu bir ÖLÇÜMDÜR ("yön bilgisi bu kadar değer taşıyordu"), işlem önerisi değildir: KGÜP'ün bilerek saptırılması
 * mevzuat açısından hassastır (metodoloji).
 *
 * SAF fonksiyonlar: I/O yok.
 */

import { costWithMultiplier, MIN_FEASIBLE_LAG_HOURS, type PricedHour, type Strategy } from "@/lib/analysis/backtest";
import { capTradeMwh, persistenceTradeGain } from "@/lib/analysis/intraday-arbitrage";
import { kupstForHour } from "@/lib/calculations/kupst";
import type { HourlyResult } from "@/lib/calculations/types";
import type { InfoTime } from "@/lib/analysis/direction-features";

const LOW_K = [0.8, 0.85, 0.9, 0.95, 0.97, 1];
const HIGH_K = [1, 1.03, 1.05, 1.1, 1.15, 1.2];
const THETAS = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7];

/** Bir santral saatinde plan k ile çarpılınca KÜPST farkı (TL); ilk ve son plan birlikte ölçeklenir */
export function plantKupstDelta(h: HourlyResult, plantType: string, k: number): number {
  if (k === 1) return 0;
  const scaled: HourlyResult = {
    ...h,
    forecastMwh: h.forecastMwh * k,
    forecastFinalMwh: h.forecastFinalMwh === null || h.forecastFinalMwh === undefined ? h.forecastFinalMwh : h.forecastFinalMwh * k,
  };
  return kupstForHour(scaled, plantType) - kupstForHour(h, plantType);
}

/** KÜPST farkı sağlayıcı: (saat başı ms, k) → TL. Santralde kendi saati, birimde santrallerin toplamı. */
export type KupstDelta = (t: number, k: number) => number;

export function kupstDeltaFor(plants: Array<{ plantType: string; hourly: HourlyResult[] }>): KupstDelta {
  const byT = new Map<number, Array<{ h: HourlyResult; type: string }>>();
  for (const p of plants)
    for (const h of p.hourly) {
      const t = new Date(h.timestamp).getTime();
      const list = byT.get(t) ?? [];
      list.push({ h, type: p.plantType });
      byT.set(t, list);
    }
  return (t, k) => {
    if (k === 1) return 0;
    let s = 0;
    for (const { h, type } of byT.get(t) ?? []) s += plantKupstDelta(h, type, k);
    return s;
  };
}

/** GİP işlem maliyeti: plan k ile değişince Δ = (1 − k) × plan, maliyet Δ × (GİP − PTF) */
const tradeCost = (h: PricedHour, k: number) => {
  const gip = h.source.gipPrice;
  if (k === 1 || gip === null || gip === undefined) return 0;
  return (1 - k) * h.source.forecastMwh * (gip - h.source.ptf);
};

/** Saatin k ile maliyeti: dengesizlik + KÜPST farkı (+ H-2'de GİP işlem maliyeti) */
export function directionHourCost(h: PricedHour, k: number, infoTime: InfoTime, kupstDelta: KupstDelta): number {
  if (infoTime === "H-2" && (h.source.gipPrice === null || h.source.gipPrice === undefined)) k = 1;
  // GİP hacim sınırı (18.2): Δ = (1 − k) × plan saatlik hacmin %10'unu aşamaz
  if (infoTime === "H-2" && k !== 1 && h.source.forecastMwh > 0) {
    const delta = capTradeMwh((1 - k) * h.source.forecastMwh, h.source.gipVolumeMwh);
    k = 1 - delta / h.source.forecastMwh;
  }
  const t = new Date(h.source.timestamp).getTime();
  return costWithMultiplier(h, k) + kupstDelta(t, k) + (infoTime === "H-2" ? tradeCost(h, k) : 0);
}

const fmt = (v: number) => v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Yön tahminiyle plan ayarı stratejisi. `probabilities`: saat başı (ms) → P(açık), walk-forward tahmin.
 * Olasılığı olmayan saatte plan değişmez.
 */
export function directionBiasStrategy(probabilities: Map<number, number>, infoTime: InfoTime, kupstDelta: KupstDelta): Strategy {
  const when = infoTime === "D-1" ? "gün öncesi" : "gün içi (GİP)";
  return {
    id: `direction-bias-${infoTime}`,
    label: `Yön tahminiyle plan ayarı · ${when}`,
    description:
      infoTime === "D-1"
        ? "Ertesi günün her saati için sistemin açık verme olasılığı tahmin edilir (yalnız D-2 sonuna kadarki veriyle). Açık bekleniyorsa KGÜP aşağı, fazla bekleniyorsa yukarı çarpılır; eşik ve çarpanlar önceki aylardan, KÜPST dahil maliyetle öğrenilir. Ölçümdür, işlem önerisi değildir."
        : "Her saat için sistem yönü 2 saat önceki bilgiyle tahmin edilir ve plan GİP'te ayarlanır (işlem maliyeti GİP ağırlıklı ortalama fiyatıyla, saatlik GİP hacminin en fazla %10 payı). Eşik ve çarpanlar önceki aylardan, KÜPST dahil maliyetle öğrenilir. Ölçümdür, işlem önerisi değildir.",
    fit: (train) => {
      const pOf = (h: PricedHour) => probabilities.get(new Date(h.source.timestamp).getTime());
      const rows = train.filter((h) => pOf(h) !== undefined);
      const lowCost = rows.map((h) => LOW_K.map((k) => directionHourCost(h, k, infoTime, kupstDelta)));
      const highCost = rows.map((h) => HIGH_K.map((k) => directionHourCost(h, k, infoTime, kupstDelta)));
      const base = rows.reduce((s, h) => s + h.baselineCost, 0);

      let best = { theta: 0.5, kLow: 1, kHigh: 1, cost: base };
      for (const theta of THETAS) {
        const lowSum = LOW_K.map(() => 0);
        const highSum = HIGH_K.map(() => 0);
        rows.forEach((h, i) => {
          if (pOf(h)! >= theta) lowCost[i].forEach((c, j) => (lowSum[j] += c));
          else highCost[i].forEach((c, j) => (highSum[j] += c));
        });
        const jl = lowSum.indexOf(Math.min(...lowSum));
        const jh = highSum.indexOf(Math.min(...highSum));
        const cost = lowSum[jl] + highSum[jh];
        if (cost < best.cost - 1e-6) best = { theta, kLow: LOW_K[jl], kHigh: HIGH_K[jh], cost };
      }
      const { theta, kLow, kHigh } = best;
      return {
        cost: (h) => {
          const p = pOf(h);
          if (p === undefined) return h.baselineCost;
          return directionHourCost(h, p >= theta ? kLow : kHigh, infoTime, kupstDelta);
        },
        summary:
          kLow === 1 && kHigh === 1
            ? "ayar yok"
            : `P(açık) ≥ ${fmt(theta)}: k = ${fmt(kLow)}; altında k = ${fmt(kHigh)}`,
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Yön tahmini + gün içi kalıcılık
// ---------------------------------------------------------------------------------------------

const ALPHA_GRID = [0, 0.25, 0.5, 0.75, 1];

/** Kalıcılık işlemi yön tahminine göre hangi sınıfta: pahalı tarafı kapatıyor mu? */
export type PersistenceClass = "aligned" | "opposed" | "unknown";

/**
 * Kalıcılık işleminin sınıfı. s = son görülen hata (gerçekleşen − plan): s > 0 ise GİP'te satılır (fazla kapatılır),
 * s < 0 ise alınır (eksik kapatılır). Açık beklenen saatte eksik pahalıdır (SMF·(1+k)), fazla ucuzdur; fazla beklenen
 * saatte tersi. İşlem pahalı tarafı kapatıyorsa "aligned".
 */
export function persistenceClass(lastError: number, p: number | undefined, theta: number): PersistenceClass {
  if (p === undefined || lastError === 0) return "unknown";
  const deficitExpected = p >= theta;
  return (lastError < 0) === deficitExpected ? "aligned" : "opposed";
}

/**
 * Gün içi kalıcılık (persistenceStrategy) ile yön tahmininin birleşimi: `lagHours` saat önce görülen hatanın α kadarı
 * GİP'te kapatılır, ama α işlemin sınıfına göre ayrı öğrenilir (yönle uyumlu / uyumsuz / olasılık yok). Eşik θ da önceki
 * aylardan seçilir. Bütün α'lar eşit seçilirse kural düz kalıcılıkla aynıdır; eğitimde ondan kötü olamaz.
 * İşlem fiyatı, hacim sınırı ve kayma persistenceTradeGain ile aynıdır; KÜPST, karşılaştırılan kalıcılık kuralındaki
 * gibi hesaba katılmaz. Yön olasılıkları gün içi (H-2) tahminidir: kalıcılıkla aynı bilgi anı.
 */
export function directionPersistenceStrategy(probabilities: Map<number, number>, lagHours = MIN_FEASIBLE_LAG_HOURS): Strategy {
  return {
    id: `direction-persistence-${lagHours}h`,
    label: `Gün içi kalıcılık + yön tahmini (${lagHours} saat önce)`,
    description:
      `Gün içi kalıcılık kuralındaki gibi ${lagHours} saat önce görülen hatanın bir kısmı GİP'te kapatılır; kapatma payı, ` +
      "işlemin yön tahminine göre pahalı tarafı kapatıp kapatmadığına göre ayrı öğrenilir (açık bekleniyorsa eksik, fazla " +
      "bekleniyorsa fazla pahalıdır). Eşik ve paylar önceki aylardan. KÜPST, kalıcılık kuralındaki gibi dahil değil.",
    fit: (train, profile) => {
      const pOf = (h: PricedHour) => probabilities.get(new Date(h.source.timestamp).getTime());
      const lastError = (h: PricedHour) => {
        const prev = h.prev(lagHours);
        return prev ? prev.actualMwh - prev.forecastMwh : 0;
      };
      const gains = train.map((h) => ALPHA_GRID.map((a) => persistenceTradeGain(h.source, h.prev(lagHours), a, profile).gainTl));
      const bestAlpha = (sums: number[]) => {
        let j = 0;
        for (let i = 1; i < sums.length; i++) if (sums[i] > sums[j] + 1e-6) j = i;
        return { alpha: ALPHA_GRID[j], gain: sums[j] };
      };

      let best = { theta: 0.5, aligned: 0, opposed: 0, unknown: 0, gain: -Infinity };
      for (const theta of THETAS) {
        const sums: Record<PersistenceClass, number[]> = { aligned: ALPHA_GRID.map(() => 0), opposed: ALPHA_GRID.map(() => 0), unknown: ALPHA_GRID.map(() => 0) };
        train.forEach((h, i) => {
          const c = persistenceClass(lastError(h), pOf(h), theta);
          gains[i].forEach((g, j) => (sums[c][j] += g));
        });
        const a = bestAlpha(sums.aligned);
        const o = bestAlpha(sums.opposed);
        const u = bestAlpha(sums.unknown);
        const gain = a.gain + o.gain + u.gain;
        if (gain > best.gain + 1e-6) best = { theta, aligned: a.alpha, opposed: o.alpha, unknown: u.alpha, gain };
      }
      const alphaFor: Record<PersistenceClass, number> = { aligned: best.aligned, opposed: best.opposed, unknown: best.unknown };
      const pctA = (a: number) => `%${a * 100}`;
      return {
        cost: (h) => {
          const alpha = alphaFor[persistenceClass(lastError(h), pOf(h), best.theta)];
          return h.baselineCost - persistenceTradeGain(h.source, h.prev(lagHours), alpha, profile).gainTl;
        },
        summary:
          best.aligned === 0 && best.opposed === 0
            ? "işlem yok"
            : `P(açık) eşiği ${fmt(best.theta)}: pahalı tarafı ${pctA(best.aligned)}, ucuz tarafı ${pctA(best.opposed)} kapat`,
      };
    },
  };
}
