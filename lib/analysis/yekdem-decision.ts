/**
 * TR-Energy Analyst - YEKDEM 2027 kararı: hangi santral YEKDEM'de kalmalı, hangisi piyasaya çıkmalı? (SAF, I/O yok)
 *
 * YEKDEM'e katılım her yıl ayrı başvuruyla olur (5346 md. 6: "bir sonraki takvim yılında tabi olmak isteyenler ... EPDK'nın
 * belirleyeceği tarihe kadar başvurmak zorundadır"). 2027 için son gün 30 Kasım 2026 (EPDK duyurusu, 19.10.2026).
 * YEKDEM'deki santral da üretimini piyasada satar ve dengesizliğini kendisi taşır; bu yüzden karar YEKDEM birim fiyatı ile
 * santralin piyasada eline geçen ortalama fiyat (üretim ağırlıklı PTF, "yakalanan fiyat") arasındadır. Dengesizlik maliyeti
 * iki seçenekte de aynıdır, karşılaştırmaya girmez.
 *
 * YEKDEM fiyatı (yerli katkı ilavesi hariç: YEKDEM tarafı için alt sınır):
 *   - 31.12.2020'ye kadar işletmeye girenler: 5346 I sayılı Cetvel, ABD doları: hidro ve rüzgâr 7,3, güneş 13,3 cent/kWh
 *     (mevzuat.gov.tr metni, 13.11.2026). TL karşılığı son ayın kuruyla.
 *   - 1.7.2021'den sonra işletmeye girenler: TL tarife (Cumhurbaşkanı Kararı 7189), üç ayda bir güncellenir. Kasım 2026:
 *     güneş ve karasal rüzgâr 2.924,90; nehir tipi hidro 3.725,80; rezervuarlı hidro 3.974,20 TL/MWh (EPİAŞ duyurusu).
 *   - İşletmeye giriş tarihi açık veride yok. Vekil: YEKDEM listelerinde ilk görüldüğü yıl (yekdem-exit.ts). İlk yıl ≤ 2021
 *     ise dolar tarifesi; ≥ 2023 ise TL; 2022 ise belirsiz (iki tarife de gösterilir).
 *
 * Kimler karar verebilir (2026 listeleri esas):
 *   - 2026'da YEKDEM'de ve 10 yıllık süresi 2027'ye uzanan santral: kalmak için yeniden başvurmalı.
 *   - Süresi sürerken kendi isteğiyle çıkmış santral: geri dönebilir.
 *   Süresi dolan ya da dolmuş olan santral karar veremez (listeye girmez). Süre ±1 yıl belirsizse ayrıca işaretlenir: 2026'da
 *   çıkıp süresi 2026'da dolmuş olabilecek santral büyük olasılıkla süresi bittiği için çıkmıştır (dönüş belirsiz).
 *   YEKA santralleri yarışma sözleşmesindeki fiyattan ödenir (Cetvel değil): listeye girmez, sayısı ayrıca verilir.
 *
 * Piyasa tarafı: 2026'nın verisi olan ayları (karne dönemi). 2027 fiyatları bilinmez; geçmiş yakalanan fiyat bir referanstır.
 */

import type { PlantYekdemExit } from "@/lib/services/yekdem-exit";

export const DECISION_YEAR = 2027;
/** EPDK, "2027 Yılı YEKDEM Başvurularının Alınması Hakkında" (19.10.2026) */
export const DECISION_DEADLINE = "2026-11-30";

/** 5346 I sayılı Cetvel, ABD doları cent/kWh → $/MWh */
export const USD_TARIFF: Record<"RES" | "GES" | "HES", number> = { HES: 73, RES: 73, GES: 133 };

/** 7189 TL tarifesi (TL/MWh) ve geçerli olduğu dönem */
export const TL_TARIFF = {
  period: "2026-11",
  source: "EPİAŞ, 01.07.2021–31.12.2030 arası işletmeye girecek YEK belgeli tesisler için fiyatlar (Kasım 2026)",
  RES: 2924.9,
  GES: 2924.9,
  HES_RIVER: 3725.8,
  HES_RESERVOIR: 3974.2,
};

/** Karar eşiği: iki fiyat birbirine bu orandan yakınsa "yakın" */
export const CLOSE_BAND = 0.05;

export type Eligibility =
  /** 2026'da YEKDEM'de, süresi 2027'ye uzanıyor */
  | "STAY"
  /** 2026'da YEKDEM'de; süresi 2026 sonunda da dolmuş olabilir (±1 yıl) */
  | "STAY_UNCERTAIN"
  /** Süresi sürerken çıktı: geri dönebilir */
  | "RETURN"
  /** Çıktı; sürenin dolup dolmadığı ayrılamıyor */
  | "RETURN_UNCERTAIN";

export const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  STAY: "YEKDEM'de, kalabilir",
  STAY_UNCERTAIN: "YEKDEM'de, süresi bitmiş olabilir",
  RETURN: "Çıkmış, geri dönebilir",
  RETURN_UNCERTAIN: "Çıkmış, dönüş hakkı belirsiz",
};

export type Regime = "USD" | "TL" | "UNSURE";
export type Verdict = "YEKDEM" | "MARKET" | "CLOSE";

export const VERDICT_LABEL: Record<Verdict, string> = {
  YEKDEM: "YEKDEM daha yüksek",
  MARKET: "Piyasa daha yüksek",
  CLOSE: "Yakın",
};

export interface DecisionInput {
  id: number;
  name: string;
  type: "RES" | "GES" | "HES";
  owner: string | null;
  hydroKind: "RESERVOIR" | "RUN_OF_RIVER" | null;
  exit: Pick<PlantYekdemExit, "status" | "firstYear" | "censored" | "termEnds" | "exitReason" | "licensedMw">;
  /** Piyasa dönemi: üretim (MWh) ve üretim × PTF (TL); veri yoksa null */
  market: { mwh: number; revenueTl: number; hours: number } | null;
}

export interface DecisionRow {
  id: number;
  name: string;
  type: "RES" | "GES" | "HES";
  owner: string | null;
  mw: number | null;
  eligibility: Eligibility;
  regime: Regime;
  /** YEKDEM birim fiyatı aralığı (TL/MWh); tarife ya da hidro alt tipi belirsizse low < high */
  tariff: { low: number; high: number };
  /** Üretim ağırlıklı PTF (TL/MWh) */
  capturePriceTl: number | null;
  mwh: number;
  /** Dönemde YEKDEM'in sağlayacağı fark: (tarife − yakalanan fiyat) × üretim, TL; aralık */
  differenceTl: { low: number; high: number } | null;
  verdict: Verdict | null;
  /** Sürenin dolduğu yıl aralığı (tahmini) */
  termEnds: { earliest: number; latest: number } | null;
}

export function eligibilityOf(exit: DecisionInput["exit"], currentYear: number): Eligibility | null {
  const ends = exit.termEnds;
  if (!ends) return null;
  if (exit.status === "ENDS_SOON" || exit.status === "LATER") return ends.earliest <= currentYear ? "STAY_UNCERTAIN" : "STAY";
  // Çıkmış santral: süresi 2026'da dolmuş olabiliyorsa büyük olasılıkla bu yüzden çıktı; geri dönüş belirsiz
  if (exit.status === "EXITED")
    return exit.exitReason === "voluntary" && ends.earliest > currentYear ? "RETURN" : exit.exitReason === "term" ? null : "RETURN_UNCERTAIN";
  return null;
}

export function regimeOf(firstYear: number | null, censored: boolean): Regime {
  if (firstYear === null || censored || firstYear <= 2021) return "USD";
  return firstYear >= 2023 ? "TL" : "UNSURE";
}

export function tariffRange(type: DecisionInput["type"], hydroKind: DecisionInput["hydroKind"], regime: Regime, usdTry: number) {
  const usd = USD_TARIFF[type] * usdTry;
  const tl =
    type === "HES"
      ? hydroKind === "RESERVOIR"
        ? [TL_TARIFF.HES_RESERVOIR, TL_TARIFF.HES_RESERVOIR]
        : hydroKind === "RUN_OF_RIVER"
          ? [TL_TARIFF.HES_RIVER, TL_TARIFF.HES_RIVER]
          : [TL_TARIFF.HES_RIVER, TL_TARIFF.HES_RESERVOIR]
      : [TL_TARIFF[type], TL_TARIFF[type]];
  if (regime === "USD") return { low: usd, high: usd };
  if (regime === "TL") return { low: tl[0], high: tl[1] };
  return { low: Math.min(usd, tl[0]), high: Math.max(usd, tl[1]) };
}

export function verdictOf(tariff: { low: number; high: number }, capture: number | null): Verdict | null {
  if (capture === null || capture <= 0) return null;
  if (tariff.low > capture * (1 + CLOSE_BAND)) return "YEKDEM";
  if (tariff.high < capture * (1 - CLOSE_BAND)) return "MARKET";
  return "CLOSE";
}

/** YEKA yarışmasıyla kurulan santral: fiyatı sözleşmeden (adında "YEKA") */
export const isYeka = (name: string) => /\bYEKA\b/i.test(name);

export function buildDecisionRows(plants: DecisionInput[], currentYear: number, usdTry: number): DecisionRow[] {
  const rows: DecisionRow[] = [];
  for (const p of plants) {
    if (isYeka(p.name)) continue;
    const eligibility = eligibilityOf(p.exit, currentYear);
    if (!eligibility) continue;
    const regime = regimeOf(p.exit.firstYear, p.exit.censored);
    const tariff = tariffRange(p.type, p.hydroKind, regime, usdTry);
    const mwh = p.market?.mwh ?? 0;
    const capture = p.market && p.market.mwh > 0 ? p.market.revenueTl / p.market.mwh : null;
    rows.push({
      id: p.id,
      name: p.name,
      type: p.type,
      owner: p.owner,
      mw: p.exit.licensedMw,
      eligibility,
      regime,
      tariff,
      capturePriceTl: capture,
      mwh,
      differenceTl: capture === null ? null : { low: (tariff.low - capture) * mwh, high: (tariff.high - capture) * mwh },
      verdict: verdictOf(tariff, capture),
      termEnds: p.exit.termEnds,
    });
  }
  // Önce kararı en çok parayı etkileyenler: farkın büyüklüğü
  const size = (r: DecisionRow) => (r.differenceTl ? Math.max(Math.abs(r.differenceTl.low), Math.abs(r.differenceTl.high)) : -1);
  return rows.sort((a, b) => size(b) - size(a));
}

export interface DecisionSummary {
  plants: number;
  mw: number;
  byVerdict: Record<Verdict | "NO_DATA", { plants: number; mw: number }>;
  /** YEKDEM'de olup piyasanın daha yüksek ödediği santraller: 2027'de çıkması beklenir (toplayıcı adayı) */
  likelyExit: number;
  /** Süresi kesin sürerken çıkmış ve YEKDEM'in daha yüksek ödediği santraller: geri dönmesi beklenir */
  likelyReturn: number;
  /** Aynısı, ama süresi 2026'da dolmuş olabilir (dönüş hakkı belirsiz) */
  uncertainReturn: number;
}

export function summarizeDecisions(rows: DecisionRow[]): DecisionSummary {
  const byVerdict: DecisionSummary["byVerdict"] = {
    YEKDEM: { plants: 0, mw: 0 },
    MARKET: { plants: 0, mw: 0 },
    CLOSE: { plants: 0, mw: 0 },
    NO_DATA: { plants: 0, mw: 0 },
  };
  let mw = 0;
  for (const r of rows) {
    const b = byVerdict[r.verdict ?? "NO_DATA"];
    b.plants++;
    b.mw += r.mw ?? 0;
    mw += r.mw ?? 0;
  }
  const staying = (e: Eligibility) => e === "STAY" || e === "STAY_UNCERTAIN";
  return {
    plants: rows.length,
    mw,
    byVerdict,
    likelyExit: rows.filter((r) => staying(r.eligibility) && r.verdict === "MARKET").length,
    likelyReturn: rows.filter((r) => r.eligibility === "RETURN" && r.verdict === "YEKDEM").length,
    uncertainReturn: rows.filter((r) => r.eligibility === "RETURN_UNCERTAIN" && r.verdict === "YEKDEM").length,
  };
}
