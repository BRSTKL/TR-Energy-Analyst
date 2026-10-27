/**
 * TR-Energy Analyst - Komşu ülke fiyatları ve sınır akışları görünümü (havuz: lib/pool/entsoe-codec.ts; SAF, I/O yok)
 *
 * Bulgaristan ve Yunanistan gün öncesi fiyatı (EUR/MWh) ile PTF'nin (TL/MWh → EUR, ECB kuruyla) saatlik karşılaştırması ve Türkiye
 * sınır akışları (net ihracat = Türkiye'den çıkan − Türkiye'ye giren, MW). Bulgaristan ve Yunanistan SDAC'ta bağlı, çoğu saatte aynı
 * fiyatı görürler. Zamanlama: bir günün komşu fiyatı o günden önceki gün öğleden sonra (SDAC sonucu) yayımlanır; Türkiye 12:30
 * kapanışından sonradır. Yani teklif saatinde bilinen, hedef günden bir önceki günün fiyatı ve akışıdır; hedef günün kendi fiyatı
 * (yayımlandıysa) yalnız bilgi olarak verilir.
 */

import {
  fxFor,
  isFullDay,
  latestFullDay,
  type EntsoeDoc,
  type HourlyDay,
} from "@/lib/pool/entsoe-codec";

const DAY_MS = 86_400_000;
const shift = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const mean = (v: Array<number | null>) => {
  const x = v.filter((n): n is number => n !== null);
  return x.length ? x.reduce((s, n) => s + n, 0) / x.length : null;
};

const net = (
  a: HourlyDay | undefined,
  b: HourlyDay | undefined,
  h: number
): number | null => {
  const out = a?.[h];
  const inn = b?.[h];
  return out === null || out === undefined || inn === null || inn === undefined
    ? null
    : out - inn;
};

export interface NeighborHour {
  hour: number;
  bg: number | null;
  gr: number | null;
  /** PTF'nin EUR karşılığı (EUR/MWh) */
  ptfEur: number | null;
  /** PTF (EUR) − Bulgaristan fiyatı */
  spreadBg: number | null;
  /** Net ihracat (MW): + Türkiye'den çıkıyor */
  netBg: number | null;
  netGr: number | null;
}

export interface NeighborOutlook {
  /** Karşılaştırılan gün: hedef günden önceki, fiyatı ve kuru tam olan en son gün */
  day: string;
  /** Hedef günden kaç gün önce (1 = beklenen) */
  daysBefore: number;
  fx: number | null;
  hours: NeighborHour[];
  mean: {
    bg: number | null;
    gr: number | null;
    ptfEur: number | null;
    spreadBg: number | null;
    netBg: number | null;
    netGr: number | null;
  };
  /** Bulgaristan ve Yunanistan fiyatının 0,01 EUR içinde aynı olduğu saat oranı (%) */
  coupledPct: number | null;
  /** Hedef günün komşu fiyatı yayımlandıysa (teklif saatinden sonra) ortalamaları */
  targetDay: { bg: number | null; gr: number | null } | null;
  fetchedAt: string | null;
}

/** `ptf`: gün → 24 saatlik PTF (TL/MWh). `date`: hedef gün. */
export function neighborOutlook(
  doc: EntsoeDoc | null,
  ptf: Map<string, number[]>,
  date: string
): NeighborOutlook | null {
  if (!doc) return null;
  let day: string | null = null;
  for (let i = 1; i <= 7 && !day; i++) {
    const d = shift(date, -i);
    if (isFullDay(doc.prices.BG[d])) day = d;
  }
  if (!day) return null;
  const fx = fxFor(doc.fx, day);
  const p = ptf.get(day);
  const hours: NeighborHour[] = Array.from({ length: 24 }, (_, hour) => {
    const bg = doc.prices.BG[day!]?.[hour] ?? null;
    const gr = doc.prices.GR[day!]?.[hour] ?? null;
    const ptfEur = p && fx ? p[hour] / fx : null;
    return {
      hour,
      bg,
      gr,
      ptfEur,
      spreadBg: ptfEur !== null && bg !== null ? ptfEur - bg : null,
      netBg: net(doc.flows.TR_BG[day!], doc.flows.BG_TR[day!], hour),
      netGr: net(doc.flows.TR_GR[day!], doc.flows.GR_TR[day!], hour),
    };
  });
  const same = hours.filter((h) => h.bg !== null && h.gr !== null);
  const t = doc.prices.BG[date];
  return {
    day,
    daysBefore: Math.round(
      (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS
    ),
    fx,
    hours,
    mean: {
      bg: mean(hours.map((h) => h.bg)),
      gr: mean(hours.map((h) => h.gr)),
      ptfEur: mean(hours.map((h) => h.ptfEur)),
      spreadBg: mean(hours.map((h) => h.spreadBg)),
      netBg: mean(hours.map((h) => h.netBg)),
      netGr: mean(hours.map((h) => h.netGr)),
    },
    coupledPct: same.length
      ? (same.filter((h) => Math.abs((h.bg as number) - (h.gr as number)) < 0.01).length /
          same.length) *
        100
      : null,
    targetDay: isFullDay(t) ? { bg: mean(t), gr: mean(doc.prices.GR[date] ?? []) } : null,
    fetchedAt: doc.fetchedAt,
  };
}

export interface NeighborFeatures {
  /** Gün → 24 saatlik PTF − Bulgaristan fiyatı (TL/MWh, kurla); gün: fiyatın günü */
  spread: Map<string, number[]>;
  /** Gün → 24 saatlik toplam net ihracat (MW, Bulgaristan + Yunanistan) */
  netExport: Map<string, number[]>;
}

/** Etki ölçümü için gün bazında özellikler. Modelde hedef gün d için d−1'in değeri kullanılır (teklif saatinde bilinir). */
export function neighborFeatures(
  doc: EntsoeDoc | null,
  ptf: Map<string, number[]>
): NeighborFeatures {
  const spread = new Map<string, number[]>();
  const netExport = new Map<string, number[]>();
  if (!doc) return { spread, netExport };
  for (const [day, bg] of Object.entries(doc.prices.BG)) {
    const fx = fxFor(doc.fx, day);
    const p = ptf.get(day);
    if (isFullDay(bg) && fx && p)
      spread.set(
        day,
        p.map((v, h) => v - (bg[h] as number) * fx)
      );
  }
  for (const day of Object.keys(doc.flows.TR_BG)) {
    const hours = Array.from({ length: 24 }, (_, h) => {
      const a = net(doc.flows.TR_BG[day], doc.flows.BG_TR[day], h);
      const b = net(doc.flows.TR_GR[day], doc.flows.GR_TR[day], h);
      return a === null || b === null ? null : a + b;
    });
    if (hours.every((v) => v !== null)) netExport.set(day, hours as number[]);
  }
  return { spread, netExport };
}
