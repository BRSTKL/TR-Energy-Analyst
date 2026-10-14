/**
 * TR-Energy Analyst - Sistem yönü ve makas tahmini: özellik seti (Aşama 14.1)
 *
 * Her saat için yalnız KARAR ANINDA bilinebilecek bilgilerden bir özellik satırı kurulur. İki karar anı:
 * - "D-1": gün öncesi (GÖP/KGÜP) kararı. D günü için D-2 23:00'e kadarki yön ve makas (SMF gecikmeyle yayımlanır; temkinli)
 *   ve D-1'in PTF'si (D-2 öğleden sonra yayımlanır) kullanılır. D gününün PTF'si henüz yoktur.
 * - "H-2": gün içi (GİP) kararı. Saatin 2 saat öncesine kadarki yön ve makas, ayrıca D gününün PTF'si
 *   (D-1 öğleden sonra yayımlanır). Gecikme `MIN_FEASIBLE_LAG_HOURS` ile aynı varsayım.
 *
 * Sızıntı koruması: her satır, dayandığı en geç saati (`latestSourceT`) taşır; testler bunun karar anından önce
 * olduğunu doğrular. Tatil takvimi yok (sınır; metodolojide yazılır).
 *
 * Saatler duvar saatidir (UTC alanlarında saklanır), Türkiye'de yaz saati olmadığından her gün 24 saattir.
 * SAF fonksiyonlar: I/O yok.
 */

import { LOW_PRICE_MAX, ZERO_PRICE_MAX } from "@/lib/analysis/market-summary";

export type InfoTime = "D-1" | "H-2";

export const INFO_TIMES: InfoTime[] = ["D-1", "H-2"];

/** Piyasa saati (doğrulanmış kayıt) */
export interface DirectionHour {
  /** Saat başı, ms (duvar saati UTC alanlarında) */
  t: number;
  ptf: number;
  smf: number;
  /** Sistem açık verdi mi (YAT yönü, SMF ≥ PTF). Dengede saat: null */
  deficit: boolean | null;
}

export interface FeatureRow {
  t: number;
  /** "YYYY-AA" */
  month: string;
  hour: number;
  /** Hedef: 1 = sistem açık (DEFICIT) */
  y: 0 | 1;
  /** Hedef: |SMF − PTF|, TL/MWh */
  spread: number;
  /** Model girdileri (`featureNames(infoTime)` sırasıyla); sabit terim modelde eklenir */
  x: number[];
  /** Kalıcılık rakibinin dayandığı son bilinen yön (D-1: D-2'nin aynı saati; H-2: 2 saat önce) */
  persistDeficit: boolean;
  /** Kalıcılık rakibinin makası: aynı kaynaktaki |SMF − PTF| */
  persistSpread: number;
  /** Satırın dayandığı en geç piyasa saati (sızıntı denetimi) */
  latestSourceT: number;
  /** Karar anı: bu andan sonra yayımlanan veri kullanılamaz */
  decisionT: number;
}

export interface FeatureBuild {
  rows: FeatureRow[];
  /** Dengede (yönsüz) olduğu için dışarıda kalan saat */
  balancedHours: number;
  /** Geçmişi yetersiz olduğu için (ilk günler, veri boşluğu) dışarıda kalan saat */
  insufficientHistory: number;
}

export const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Kullanılan PTF bilgisi: D-1'de önceki günün aynı saati, H-2'de saatin kendisi */
const ptfFeatures = (ptf: number) => [Math.log1p(Math.max(ptf, 0)), ptf <= ZERO_PRICE_MAX ? 1 : 0, ptf <= LOW_PRICE_MAX ? 1 : 0];

const lagBlock = ["rate7", "rate28", "lastSame", "lastSameSpread", "lastDayRate"];

/** Dış girdi: piyasa geneli arızalı kapasite (outage-capacity.ts) */
export interface OutageInput {
  /** Duvar saati t anında süren arızalı kapasite, MW */
  activeMw: (t: number) => number;
  /** Bildirim verisinin başladığı an (duvar saati ms); bundan önce başlayan arızalar bilinmez */
  from: number;
}

/** Arıza girdisinin geriye baktığı süre (7 günlük değişim) ve veri başlangıcından sonra beklenen pay (süren arızalar) */
const OUTAGE_LOOKBACK_MS = 7 * 24 * HOUR_MS;
const OUTAGE_WARMUP_MS = 7 * 24 * HOUR_MS;

export interface FeatureOptions {
  outage?: OutageInput;
}

export function featureNames(infoTime: InfoTime, opts: FeatureOptions = {}): string[] {
  const hours = Array.from({ length: 23 }, (_, i) => `hour${i + 1}`);
  const days = ["mon", "tue", "wed", "thu", "fri", "sat"];
  const ptf = infoTime === "D-1" ? ["ptfPrevDay", "zeroPricePrevDay", "lowPricePrevDay"] : ["ptf", "zeroPrice", "lowPrice"];
  const intraday = infoTime === "H-2" ? ["lag2", "lag2Spread"] : [];
  const outage = opts.outage ? ["outageGw", "outageGwChange7d"] : [];
  return [...hours, ...days, ...lagBlock, ...ptf, ...intraday, ...outage];
}

const sign = (deficit: boolean) => (deficit ? 1 : -1);
const logSpread = (h: DirectionHour) => Math.log1p(Math.abs(h.smf - h.ptf));

/**
 * Saatleri özellik satırlarına çevirir. Satır kurulamayan saatler (dengede, eksik geçmiş) sayılarak atlanır.
 * Aynı saatin birden fazla kaydı varsa sonuncusu kullanılır.
 */
export function buildFeatureRows(hours: DirectionHour[], infoTime: InfoTime, opts: FeatureOptions = {}): FeatureBuild {
  const outage = opts.outage;
  const byT = new Map<number, DirectionHour>();
  for (const h of hours) byT.set(h.t, h);
  const sorted = [...byT.values()].sort((a, b) => a.t - b.t);

  const rows: FeatureRow[] = [];
  let balancedHours = 0;
  let insufficientHistory = 0;

  for (const h of sorted) {
    if (h.deficit === null) {
      balancedHours++;
      continue;
    }
    const date = new Date(h.t);
    const hour = date.getUTCHours();
    const dayStart = h.t - hour * HOUR_MS;
    // Karar anı: D-1 için D-1 gününün başı (D-2 23:00 dahil bilinir), H-2 için saatin 2 saat öncesi (dahil)
    const decisionT = infoTime === "D-1" ? dayStart - DAY_MS : h.t - 2 * HOUR_MS;
    // Aynı saatin bilinen en yakın günü: D-1 için D-2, H-2 için D-1
    const firstLagDay = infoTime === "D-1" ? 2 : 1;

    const sameHour = (lagDays: number) => byT.get(h.t - lagDays * DAY_MS);
    const known = (k: DirectionHour | undefined): k is DirectionHour & { deficit: boolean } => k !== undefined && k.deficit !== null;

    const lastSame = sameHour(firstLagDay);
    const rate = (days: number) => {
      let n = 0;
      let d = 0;
      for (let i = firstLagDay; i < firstLagDay + days; i++) {
        const k = sameHour(i);
        if (known(k)) {
          n++;
          if (k.deficit) d++;
        }
      }
      return n >= Math.ceil(days / 2) ? d / n : null;
    };
    // Bilinen son gün: D-1 için D-2, H-2 için D-1 (H-2'de gece yarısına yakın saatlerde günün son saatleri henüz
    // bilinmez; yalnız karar anına kadarki saatler sayılır)
    const lastDayStart = dayStart - firstLagDay * DAY_MS;
    let dayN = 0;
    let dayD = 0;
    let dayLatestT = -Infinity;
    for (let i = 0; i < 24; i++) {
      const ts = lastDayStart + i * HOUR_MS;
      if (ts > decisionT) break;
      const k = byT.get(ts);
      if (known(k)) {
        dayN++;
        if (k.deficit) dayD++;
        dayLatestT = ts;
      }
    }
    const ptfSource = infoTime === "D-1" ? byT.get(h.t - DAY_MS) : h;
    const lag2 = infoTime === "H-2" ? byT.get(h.t - 2 * HOUR_MS) : undefined;
    const rate7 = rate(7);
    const rate28 = rate(28);

    // Arıza girdisi: karar anında ve 7 gün önce süren kapasite; ikisi de bildirim verisinin ısınma süresinden sonra olmalı
    const outageReady = !outage || decisionT - OUTAGE_LOOKBACK_MS >= outage.from + OUTAGE_WARMUP_MS;
    if (
      !known(lastSame) ||
      rate7 === null ||
      rate28 === null ||
      dayN < 12 ||
      !ptfSource ||
      (infoTime === "H-2" && !known(lag2)) ||
      !outageReady
    ) {
      insufficientHistory++;
      continue;
    }

    const hourDummies = Array.from({ length: 23 }, (_, i) => (hour === i + 1 ? 1 : 0));
    const weekday = date.getUTCDay(); // 0 = pazar
    const dayDummies = Array.from({ length: 6 }, (_, i) => (weekday === i + 1 ? 1 : 0));
    const x = [
      ...hourDummies,
      ...dayDummies,
      rate7,
      rate28,
      sign(lastSame.deficit),
      logSpread(lastSame),
      dayD / dayN,
      ...ptfFeatures(ptfSource.ptf),
    ];
    // PTF kaynağının yayım zamanı: D-1'de önceki günün PTF'si D-2'de, H-2'de günün PTF'si D-1'de yayımlanır
    let latestSourceT = Math.max(lastSame.t, dayLatestT);
    if (infoTime === "H-2" && lag2 && known(lag2)) {
      x.push(sign(lag2.deficit), logSpread(lag2));
      latestSourceT = Math.max(latestSourceT, lag2.t);
    }

    if (outage) {
      // Karar anında süren arızalar (o anda bilinir); bitişi karar anından sonra olanlar
      const now = outage.activeMw(decisionT);
      x.push(now / 1000, (now - outage.activeMw(decisionT - OUTAGE_LOOKBACK_MS)) / 1000);
    }

    const persist = infoTime === "H-2" && known(lag2) ? lag2 : lastSame;
    rows.push({
      t: h.t,
      month: date.toISOString().slice(0, 7),
      hour,
      y: h.deficit ? 1 : 0,
      spread: Math.abs(h.smf - h.ptf),
      x,
      persistDeficit: persist.deficit,
      persistSpread: Math.abs(persist.smf - persist.ptf),
      latestSourceT,
      decisionT,
    });
  }
  return { rows, balancedHours, insufficientHistory };
}

/** MarketData satırından yön saati; "BALANCED" ve bilinmeyen yön null */
export function toDirectionHour(r: { timestamp: Date | number; ptf: number; smf: number; systemDirection: string }): DirectionHour {
  const deficit = r.systemDirection === "DEFICIT" ? true : r.systemDirection === "SURPLUS" ? false : null;
  return { t: typeof r.timestamp === "number" ? r.timestamp : r.timestamp.getTime(), ptf: r.ptf, smf: r.smf, deficit };
}
