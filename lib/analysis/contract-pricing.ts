/**
 * TR-Energy Analyst - Toplayıcı sözleşme fiyatı (PLAN 16.1)
 *
 * Aday santrale teklif edilecek dengesizlik hizmet bedeli (TL/MWh) üç çizgiden çıkar:
 *   taban = adil prim: (Shapley payı + KÜPST) / üretim. Toplayıcının bu santral için beklenen maliyeti; altında zarar.
 *   tavan = tek başına maliyet: (kendi dengesizliği + KÜPST) / üretim. Santralin bağımsız kalma alternatifi; üstünü
 *           kabul etmez.
 *   öneri = taban + marj payı × (tavan − taban). Tavan − taban pazarlık alanıdır: netleşmenin yarattığı değer.
 * KÜPST toplayıcıda (topluluk KÜPST'ü, md. 4): taban ve tavan KÜPST dahildir (karar 14.10.2026).
 * Öneri sıfırın altına inmez: taban negatifse (aday portföyün maliyetini kendi payından fazla düşürüyorsa) bedel 0 ve
 * bu ayrıca işaretlenir.
 * Kötü senaryo: taban, geçmişle sınamada (12.2) gerçek / tahmin oranının P90'ı ile büyütülür; öneri değişmeden marj
 * yeniden hesaplanır. Oran santral bazındadır; portföyde hatalar kısmen dengelendiği için ihtiyatlıdır.
 * PTF oranı: bedel / adayın üretim ağırlıklı PTF'si (aynı dönem).
 * Sınır: toplayıcının işletme gideri ve GİP işlem kâr/zararı dahil değil (marjın içinde); tavan santralin kendi ticaret
 * ekibinin giderini içermez (gerçek tavan daha yüksek). Ölçümdür, işlem önerisi değil.
 * SAF: I/O yok.
 */

/** Varsayılan marj: pazarlık alanının yarısı (karar 14.10.2026) */
export const DEFAULT_MARGIN_SHARE = 0.5;

export interface ContractPricingInput {
  /** Adil prim, TL/MWh (KÜPST dahil) */
  fairUnitTl: number;
  /** Tek başına maliyet, TL/MWh (KÜPST dahil) */
  standaloneUnitTl: number;
  /** Adayın üretim ağırlıklı PTF'si, TL/MWh; bilinmiyorsa null */
  capturePtfTl: number | null;
  /** Geçmişle sınamada gerçek / tahmin oranının P90'ı (teknolojinin); yoksa null */
  worstRatio: number | null;
  /** Pazarlık alanından toplayıcıya kalan pay, 0–1 */
  marginShare?: number;
}

export interface ContractPrice {
  floorTl: number;
  ceilingTl: number;
  /** Tavan − taban; ≤ 0 ise teklif verilemez */
  roomTl: number;
  marginShare: number;
  /** Önerilen bedel, TL/MWh; teklif verilemiyorsa null */
  offerTl: number | null;
  /** Öneri − taban, TL/MWh */
  marginTl: number | null;
  /** Önerinin PTF'ye oranı (%) */
  offerPctOfPtf: number | null;
  /** Taban negatif olduğu için öneri 0'a çekildi */
  zeroFloored: boolean;
  /** Kötü senaryo: taban × P90 oranı ve o durumda marj */
  worst: { ratio: number; floorTl: number; marginTl: number | null } | null;
  /** Teklif verilemiyorsa nedeni */
  reason: string | null;
}

export function priceContract(input: ContractPricingInput): ContractPrice {
  const share = Math.min(1, Math.max(0, input.marginShare ?? DEFAULT_MARGIN_SHARE));
  const floor = input.fairUnitTl;
  const ceiling = input.standaloneUnitTl;
  const room = ceiling - floor;
  const feasible = room > 0 && ceiling > 0;
  let offer: number | null = null;
  let zeroFloored = false;
  if (feasible) {
    offer = floor + share * room;
    if (offer < 0) {
      offer = 0;
      zeroFloored = true;
    }
  }
  const ptf = input.capturePtfTl;
  const worst =
    input.worstRatio !== null && input.worstRatio > 0 && floor > 0
      ? { ratio: input.worstRatio, floorTl: floor * input.worstRatio, marginTl: offer === null ? null : offer - floor * input.worstRatio }
      : null;
  return {
    floorTl: floor,
    ceilingTl: ceiling,
    roomTl: room,
    marginShare: share,
    offerTl: offer,
    marginTl: offer === null ? null : offer - floor,
    offerPctOfPtf: offer !== null && ptf !== null && ptf > 0 ? (offer / ptf) * 100 : null,
    zeroFloored,
    worst,
    reason: feasible
      ? null
      : ceiling <= 0
        ? "Santralin tek başına dengesizlik maliyeti yok; hizmet bedeli için alan yok."
        : "Adil prim tek başına maliyete eşit ya da üstünde: portföye katılmak santrale kazandırmıyor.",
  };
}

/**
 * Sözleşme biçimi sınaması (PLAN 16.2): bedel geçmiş yılın verisiyle belirlenip hedef yılda uygulansaydı maliyeti ne
 * kadar karşılardı? Bedel tahmini maliyetin (1 + kâr payı) katı:
 *   sabit TL:    bedel = tahmin × (1 + m)                                  (TL/MWh, hedef yılda aynı)
 *   PTF yüzdesi: bedel = tahmin / PTF_geçmiş × PTF_hedef × (1 + m)         (PTF'nin sabit yüzdesi)
 * Karşılama oranı = bedel / gerçekleşen maliyet (m = 0'da); < 1 / (1 + m) ise o kâr payıyla zarar.
 * PTF santralin üretim ağırlıklı PTF'sidir (iki yılda ayrı). Santral bazındadır: portföyde sapmalar kısmen
 * dengelendiği için toplayıcının gerçek maliyeti daha düşüktür; biçimlerin göreli dayanıklılığını ölçer.
 */
export interface ContractFormPlant {
  type: string;
  predictedTlPerMwh: number;
  actualTlPerMwh: number;
  capturePtfFrom: number | null;
  capturePtfTo: number | null;
}

export interface ContractFormStats {
  n: number;
  /** Hedef yıl / geçmiş yıl üretim ağırlıklı PTF oranının medyanı */
  ptfChangeMedian: number;
  forms: Record<"fixed" | "ptfShare", {
    /** Karşılama oranı (bedel / gerçek, kâr payı 0) dağılımı */
    cover: { p10: number; p25: number; p50: number; p75: number; p90: number };
    /** Kâr payına göre zarar eden santral payı (%) */
    lossSharePct: Record<string, number>;
  }>;
}

export const CONTRACT_MARKUPS = [0, 0.5, 1];

const q = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export function contractFormBacktest(plants: ContractFormPlant[], markups = CONTRACT_MARKUPS): Record<string, ContractFormStats> {
  const groups = new Map<string, Array<{ fixed: number; ptfShare: number; ptfChange: number }>>();
  for (const p of plants) {
    if (!(p.predictedTlPerMwh > 0) || !(p.actualTlPerMwh > 0) || !(p.capturePtfFrom! > 0) || !(p.capturePtfTo! > 0)) continue;
    const ptfChange = p.capturePtfTo! / p.capturePtfFrom!;
    const fixed = p.predictedTlPerMwh / p.actualTlPerMwh;
    const row = { fixed, ptfShare: fixed * ptfChange, ptfChange };
    for (const key of [p.type, "ALL"]) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
  }
  const out: Record<string, ContractFormStats> = {};
  for (const [key, rows] of Array.from(groups.entries())) {
    const form = (vals: number[]) => {
      const s = [...vals].sort((a, b) => a - b);
      return {
        cover: { p10: q(s, 0.1), p25: q(s, 0.25), p50: q(s, 0.5), p75: q(s, 0.75), p90: q(s, 0.9) },
        lossSharePct: Object.fromEntries(markups.map((m) => [String(m), (s.filter((v) => v * (1 + m) < 1).length / s.length) * 100])),
      };
    };
    out[key] = {
      n: rows.length,
      ptfChangeMedian: q(rows.map((r) => r.ptfChange).sort((a, b) => a - b), 0.5),
      forms: { fixed: form(rows.map((r) => r.fixed)), ptfShare: form(rows.map((r) => r.ptfShare)) },
    };
  }
  return out;
}
