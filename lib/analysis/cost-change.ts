/**
 * TR-Energy Analyst - "Maliyet neden değişti?" ayrıştırması
 *
 * Aynı santrallerin iki dönemi (ör. 2025 ve 2026'nın aynı ayları) arasındaki MWh başına dengesizlik maliyeti farkını
 * dört kaleme böler. Uzlaştırma, sonuç sayfası ve raporla aynı tabandadır: santraller uzlaştırma birimlerinde
 * (şirket / toplayıcı) saat saat netleşir, maliyet net sapma üzerinden fiyatlanır (settleByCompanyGroups).
 *
 * Birim maliyet iki çarpana ayrılır:
 *   MWh başına maliyet = W × ḡ
 *   W  = Σ|net sapma| / Σ üretim                      → tahmin hatası (netleşmiş, üretime oranlı)
 *   ḡ  = Σ|net sapma| × bedel / Σ|net sapma|          → sapmanın MWh başına ortalama bedeli
 * ḡ üç şeye bağlıdır: sapmaların hangi saatlere ve hangi işaretle düştüğü (hacim ve profil), o saatlerin PTF, SMF ve
 * sistem yönü (fiyat makası) ve katsayı kuralı (2025 %3; 2026 sistemle aynı yönde %6, ters yönde %3).
 * Üretim hacmi tek başına birim maliyeti değiştirmez (sapma ve üretim birlikte ölçeklenir); etkisi profil üzerinden gelir.
 *
 * Yöntem: iki dönemin saatleri takvimde eşlenir (aynı ay, gün ve saat; 29 Şubat dışarıda kalır). Her kalem tek başına
 * diğer dönemin değeriyle değiştirilip yeniden fiyatlanır; etki, A'dan B'ye ve B'den A'ya geçişin ortalamasıdır
 * (sıradan bağımsız). Dört etkinin toplamı ile gerçek fark arasındaki kalan "etkileşim"dir (kalemlerin birlikte
 * değişmesinden doğan kısım). W çarpan olduğu için tahmin hatası etkileşim üretmez.
 * SAF: I/O yok.
 */

import { calculateNegativeImbalancePrice, calculatePositiveImbalancePrice } from "@/lib/calculations/engine";
import { HourlyResult, ImbalancePricingProfile, resolveImbalanceProfile, SystemDirection } from "@/lib/calculations/types";

export interface CostChangePlant {
  /** Dönemler arası eşleştirme anahtarı (EPİAŞ santral kimliği ya da ad) */
  key: string;
  name: string;
  /** Uzlaştırma birimi (aynı birimin santralleri saat saat netleşir) */
  unit: string;
  hourly: HourlyResult[];
}

export interface CostChangePeriodInput {
  label: string;
  profile: ImbalancePricingProfile;
  plants: CostChangePlant[];
}

export type CostFactor = "error" | "market" | "rule" | "profile";

export const COST_FACTORS: Array<{ id: CostFactor; label: string; hint: string }> = [
  { id: "error", label: "Tahmin hatası", hint: "Netleşmiş sapmanın üretime oranı" },
  { id: "market", label: "Fiyat makası", hint: "Aynı saatlerin PTF, SMF ve sistem yönü" },
  { id: "rule", label: "Katsayı kuralı", hint: "2025 %3; 2026 sistemle aynı yönde %6, ters yönde %3" },
  { id: "profile", label: "Hacim ve profil", hint: "Sapmaların hangi saatlere ve sistem yönüne düştüğü" },
];

export interface CostChangePeriod {
  label: string;
  start: string;
  end: string;
  actualMwh: number;
  costTl: number;
  /** Ortak saatlerde, uzlaştırma biriminde netleşmiş MWh başına dengesizlik maliyeti */
  unitCostTl: number;
  /** W: Σ|net sapma| / Σ üretim (%) */
  errorPct: number;
  /** Santraller tek tek: Σ|sapma| / Σ üretim (%) */
  plantErrorPct: number;
  /** Net sapmanın MWh başına ortalama bedeli (ḡ, TL) */
  penaltyTlPerMwh: number;
  /** Net sapma MWh'inin sistemle aynı yönde olan payı (%) */
  sameDirectionPct: number;
  /** Ortak saatlerin düz ortalama |SMF − PTF| değeri (TL/MWh) */
  meanSpreadTl: number;
  /** Maliyetin kaynağı: makas kısmı (|SMF − PTF|) ve katsayı kısmı (fiyat × k); toplamı costTl */
  composition: { spreadTl: number; coefTl: number };
}

export interface CostChangeResult {
  a: CostChangePeriod;
  b: CostChangePeriod;
  coverage: {
    commonHours: number;
    hoursA: number;
    hoursB: number;
    commonPlants: string[];
    onlyA: string[];
    onlyB: string[];
  };
  /** B − A, TL/MWh */
  totalTlPerMwh: number;
  effects: Array<{ factor: CostFactor; label: string; tlPerMwh: number }>;
  interactionTlPerMwh: number;
  /** Dört kalemin açıkladığı pay: 100 − |etkileşim| / |fark| × 100 (fark ~0 ise 100) */
  explainedPct: number;
  sentences: string[];
}

interface Market {
  t: Date | string;
  ptf: number;
  smf: number;
  dir: SystemDirection;
}

interface Prepared {
  input: CostChangePeriodInput;
  market: Map<string, Market>;
  /** Uzlaştırma birimi → takvim anahtarı → net sapma */
  unitDelta: Map<string, Map<string, number>>;
  actual: Map<string, number>;
  /** Santral bazında |sapma| (netleşmemiş) */
  plantAbs: Map<string, number>;
  hours: number;
}

/** Takvim anahtarı: "AA-GGTSS" (duvar saati UTC alanında) */
const calendarKey = (t: Date | string) => new Date(t).toISOString().slice(5, 13);

function prepare(input: CostChangePeriodInput, keys: Set<string>): Prepared {
  const market = new Map<string, Market>();
  const unitDelta = new Map<string, Map<string, number>>();
  const actual = new Map<string, number>();
  const plantAbs = new Map<string, number>();
  for (const p of input.plants) {
    if (!keys.has(p.key)) continue;
    const deltas = unitDelta.get(p.unit) ?? new Map<string, number>();
    unitDelta.set(p.unit, deltas);
    for (const h of p.hourly) {
      const k = calendarKey(h.timestamp);
      if (k.startsWith("02-29")) continue;
      if (!market.has(k)) market.set(k, { t: h.timestamp, ptf: h.ptf, smf: h.smf, dir: h.systemDirection });
      const d = h.actualMwh - h.forecastMwh;
      deltas.set(k, (deltas.get(k) ?? 0) + d);
      actual.set(k, (actual.get(k) ?? 0) + h.actualMwh);
      plantAbs.set(k, (plantAbs.get(k) ?? 0) + Math.abs(d));
    }
  }
  return { input, market, unitDelta, actual, plantAbs, hours: market.size };
}

/** Sapmanın MWh başına bedeli: fazla üretimde PTF − pozitif fiyat, eksik üretimde negatif fiyat − PTF */
function penalty(delta: number, m: Market, c: ImbalancePricingProfile): { spread: number; coef: number } {
  if (delta > 0) {
    const base = Math.min(m.ptf, m.smf);
    return { spread: m.ptf - base, coef: base - calculatePositiveImbalancePrice(m.ptf, m.smf, m.dir, c) };
  }
  if (delta < 0) {
    const base = Math.max(m.ptf, m.smf);
    return { spread: base - m.ptf, coef: calculateNegativeImbalancePrice(m.ptf, m.smf, m.dir, c) - base };
  }
  return { spread: 0, coef: 0 };
}

/** Sapma profili X'in, Y'nin piyasasıyla ve Z'nin katsayı kuralıyla bedeli (ortak saatlerde) */
function price(x: Prepared, y: Prepared, z: Prepared, common: string[]) {
  let abs = 0;
  let spread = 0;
  let coef = 0;
  for (const deltas of Array.from(x.unitDelta.values())) {
    for (const k of common) {
      const d = deltas.get(k);
      if (!d) continue;
      const rule = resolveImbalanceProfile(z.input.profile, z.market.get(k)!.t);
      const g = penalty(d, y.market.get(k)!, rule);
      abs += Math.abs(d);
      spread += Math.abs(d) * g.spread;
      coef += Math.abs(d) * g.coef;
    }
  }
  return { abs, spread, coef, perMwh: abs > 0 ? (spread + coef) / abs : 0 };
}

const sum = (m: Map<string, number>, keys: string[]) => keys.reduce((a, k) => a + (m.get(k) ?? 0), 0);
const iso = (t: Date | string) => new Date(t).toISOString().slice(0, 10);
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const signedTl = (v: number) => (Math.abs(v) < 0.05 ? "≈0 TL" : `${v > 0 ? "+" : "−"}${nf(Math.abs(v), 1)} TL`);

function summarize(p: Prepared, common: string[]): CostChangePeriod {
  const own = price(p, p, p, common);
  const actualMwh = sum(p.actual, common);
  const times = common.map((k) => new Date(p.market.get(k)!.t).getTime());
  let same = 0;
  for (const deltas of Array.from(p.unitDelta.values()))
    for (const k of common) {
      const d = deltas.get(k) ?? 0;
      const dir = p.market.get(k)!.dir;
      if ((d > 0 && dir === "SURPLUS") || (d < 0 && dir === "DEFICIT")) same += Math.abs(d);
    }
  const costTl = own.spread + own.coef;
  return {
    label: p.input.label,
    start: times.length ? iso(new Date(Math.min(...times))) : "",
    end: times.length ? iso(new Date(Math.max(...times))) : "",
    actualMwh,
    costTl,
    unitCostTl: actualMwh > 0 ? costTl / actualMwh : 0,
    errorPct: actualMwh > 0 ? (own.abs / actualMwh) * 100 : 0,
    plantErrorPct: actualMwh > 0 ? (sum(p.plantAbs, common) / actualMwh) * 100 : 0,
    penaltyTlPerMwh: own.perMwh,
    sameDirectionPct: own.abs > 0 ? (same / own.abs) * 100 : 0,
    meanSpreadTl: common.length ? common.reduce((a, k) => a + Math.abs(p.market.get(k)!.smf - p.market.get(k)!.ptf), 0) / common.length : 0,
    composition: { spreadTl: own.spread, coefTl: own.coef },
  };
}

/**
 * İki dönemin MWh başına dengesizlik maliyeti farkını dört kaleme ayırır. Yalnızca iki dönemde de bulunan santraller
 * (anahtarla) ve takvimde iki dönemde de verisi olan saatler kullanılır. Ortak saat yoksa null.
 */
export function decomposeCostChange(inputA: CostChangePeriodInput, inputB: CostChangePeriodInput): CostChangeResult | null {
  const keysA = new Map(inputA.plants.filter((p) => p.hourly.length).map((p) => [p.key, p.name]));
  const keysB = new Map(inputB.plants.filter((p) => p.hourly.length).map((p) => [p.key, p.name]));
  const shared = new Set(Array.from(keysA.keys()).filter((k) => keysB.has(k)));
  if (shared.size === 0) return null;

  const A = prepare(inputA, shared);
  const B = prepare(inputB, shared);
  const common = Array.from(A.market.keys()).filter((k) => B.market.has(k)).sort();
  if (common.length === 0) return null;

  const a = summarize(A, common);
  const b = summarize(B, common);
  const W = { a: a.errorPct / 100, b: b.errorPct / 100 };

  // ḡ(profil, piyasa, kural) için 8 bileşim; W çarpandır
  const P = { a: A, b: B };
  const g = new Map<string, number>();
  const gOf = (s: "a" | "b", m: "a" | "b", r: "a" | "b") => {
    const key = s + m + r;
    if (!g.has(key)) g.set(key, price(P[s], P[m], P[r], common).perMwh);
    return g.get(key)!;
  };
  type Pick = Record<CostFactor, "a" | "b">;
  const v = (x: Pick) => W[x.error] * gOf(x.profile, x.market, x.rule);
  const all = (side: "a" | "b"): Pick => ({ error: side, market: side, rule: side, profile: side });
  const vA = v(all("a"));
  const vB = v(all("b"));
  const total = vB - vA;

  const effects = COST_FACTORS.map(({ id, label }) => {
    const forward = v({ ...all("a"), [id]: "b" }) - vA;
    const backward = vB - v({ ...all("b"), [id]: "a" });
    return { factor: id, label, tlPerMwh: (forward + backward) / 2 };
  });
  const interaction = total - effects.reduce((acc, e) => acc + e.tlPerMwh, 0);
  const explainedPct = Math.abs(total) < 1e-9 ? 100 : Math.max(0, 100 - (Math.abs(interaction) / Math.abs(total)) * 100);

  return {
    a,
    b,
    coverage: {
      commonHours: common.length,
      hoursA: A.hours,
      hoursB: B.hours,
      commonPlants: Array.from(shared).map((k) => keysB.get(k)!),
      onlyA: Array.from(keysA.entries()).filter(([k]) => !shared.has(k)).map(([, n]) => n),
      onlyB: Array.from(keysB.entries()).filter(([k]) => !shared.has(k)).map(([, n]) => n),
    },
    totalTlPerMwh: total,
    effects,
    interactionTlPerMwh: interaction,
    explainedPct,
    sentences: explain(a, b, total, effects),
  };
}

function explain(a: CostChangePeriod, b: CostChangePeriod, total: number, effects: CostChangeResult["effects"]): string[] {
  const ch = a.unitCostTl > 0 ? (total / a.unitCostTl) * 100 : null;
  const out = [
    `MWh başına dengesizlik maliyeti ${a.label} → ${b.label}: ${nf(a.unitCostTl, 1)} → ${nf(b.unitCostTl, 1)} TL` +
      (ch === null ? "." : ` (${ch >= 0 ? "+" : "−"}%${nf(Math.abs(ch))}).`),
  ];
  const ranked = [...effects].sort((x, y) => Math.abs(y.tlPerMwh) - Math.abs(x.tlPerMwh));
  const lead = ranked[0];
  if (Math.abs(total) > 1e-9 && Math.abs(lead.tlPerMwh) > 0.05) {
    const share = (lead.tlPerMwh / total) * 100;
    out.push(
      `En büyük kalem ${lead.label.toLocaleLowerCase("tr-TR")}: ${signedTl(lead.tlPerMwh)}` +
        (share > 0 && share <= 200 ? ` (farkın %${nf(share)} kadarı).` : ".") +
        ` Diğerleri: ${ranked
          .slice(1)
          .map((e) => `${e.label.toLocaleLowerCase("tr-TR")} ${signedTl(e.tlPerMwh)}`)
          .join(", ")}.`
    );
  }
  const errDiff = b.errorPct - a.errorPct;
  out.push(
    `Tahmin hatası (netleşmiş sapma / üretim) %${nf(a.errorPct, 1)} → %${nf(b.errorPct, 1)}` +
      (Math.abs(errDiff) < 1 ? ": neredeyse değişmedi." : errDiff > 0 ? ": arttı." : ": azaldı.") +
      ` Ortalama SMF–PTF makası ${nf(a.meanSpreadTl)} → ${nf(b.meanSpreadTl)} TL/MWh.`
  );
  return out;
}
