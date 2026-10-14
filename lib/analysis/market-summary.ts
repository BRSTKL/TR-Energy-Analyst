/**
 * TR-Energy Analyst - Piyasa özeti
 *
 * Bir ticaret masasının her sabah baktığı piyasa göstergeleri, saatlik EPİAŞ verisinden: PTF ve SMF dağılımı,
 * SMF–PTF makası (dengesizlik fiyatının gün öncesi fiyattan ne kadar uzaklaştığı), sistem yönü, sıfır ve düşük fiyatlı
 * saatler, GİP fiyatı ve hacmi. Ay ay ve günün saatine göre kırılımlar ile iki dönemin karşılaştırma cümleleri.
 * SAF: I/O yok.
 *
 * Makas: |SMF − PTF|. Üreticinin dengesizlik maliyeti sistemle aynı yöndeki sapmada bu farkla büyür; 2026'da maliyet
 * artışının ana kaynağı budur (tahmin hatası sabitken makas açıldı).
 */

export interface MarketHour {
  /** ms; duvar saati UTC alanında */
  t: number;
  ptf: number;
  smf: number;
  systemDirection: string;
  gipPrice?: number | null;
  gipVolumeMwh?: number | null;
  /** Birim dönüştürülmüş özetlerde saatin nominal PTF'si (sıfır ve düşük fiyat eşikleri her zaman nominal TL'dedir) */
  nominalPtf?: number;
}

/** Sıfır fiyat eşiği (TL/MWh) ve düşük fiyat eşiği */
export const ZERO_PRICE_MAX = 1;
export const LOW_PRICE_MAX = 1000;

export interface Dist {
  mean: number;
  median: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
}

export interface MarketBucket {
  key: string;
  hours: number;
  ptfMean: number;
  smfMean: number;
  spreadMean: number;
  spreadP90: number;
  /** Ortalama makasın ortalama PTF'ye oranı (%); birimden bağımsız */
  spreadPctOfPtf: number | null;
  deficitPct: number;
  surplusPct: number;
  balancedPct: number;
  zeroHours: number;
  lowHours: number;
  /** Hacim ağırlıklı GİP fiyatı; hacim yoksa null */
  gipWeightedPrice: number | null;
  gipVolumeMwh: number;
}

export interface MarketSummary {
  start: string;
  end: string;
  hours: number;
  ptf: Dist;
  smf: Dist;
  /** |SMF − PTF| dağılımı */
  spread: Dist;
  /** Ortalama makasın ortalama PTF'ye oranı (%); birimden bağımsız, enflasyon ve kurdan etkilenmez */
  spreadPctOfPtf: number | null;
  /** Sistem açığında SMF − PTF, fazlasında PTF − SMF ortalaması (yönlü makas; üreticinin aynı yönde sapmadaki ek bedeli) */
  directionalSpread: { deficit: number; surplus: number };
  direction: { deficitPct: number; surplusPct: number; balancedPct: number };
  zeroHours: number;
  lowHours: number;
  gip: { hours: number; weightedPrice: number | null; totalVolumeMwh: number; avgHourlyVolumeMwh: number };
  monthly: MarketBucket[];
  /** 0–23, Türkiye saati */
  hourProfile: MarketBucket[];
}

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

function dist(values: number[]): Dist {
  const s = [...values].sort((a, b) => a - b);
  return {
    mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0,
    median: quantile(s, 0.5),
    p10: quantile(s, 0.1),
    p90: quantile(s, 0.9),
    min: s[0] ?? 0,
    max: s[s.length - 1] ?? 0,
  };
}

function gipOf(hours: MarketHour[]) {
  const withGip = hours.filter((h) => h.gipPrice != null && (h.gipVolumeMwh ?? 0) > 0);
  const volume = withGip.reduce((a, h) => a + (h.gipVolumeMwh ?? 0), 0);
  const weightedPrice = volume > 0 ? withGip.reduce((a, h) => a + (h.gipPrice ?? 0) * (h.gipVolumeMwh ?? 0), 0) / volume : null;
  return { hours: withGip.length, volume, weightedPrice };
}

const nominal = (h: MarketHour) => h.nominalPtf ?? h.ptf;
const pctOfPtf = (spreadMean: number, ptfMean: number) => (ptfMean > 0 ? (spreadMean / ptfMean) * 100 : null);

function bucket(key: string, hours: MarketHour[]): MarketBucket {
  const n = hours.length || 1;
  const deficit = hours.filter((h) => h.systemDirection === "DEFICIT").length;
  const surplus = hours.filter((h) => h.systemDirection === "SURPLUS").length;
  const spreads = hours.map((h) => Math.abs(h.smf - h.ptf)).sort((a, b) => a - b);
  const gip = gipOf(hours);
  const ptfMean = hours.reduce((a, h) => a + h.ptf, 0) / n;
  const spreadMean = spreads.reduce((a, b) => a + b, 0) / n;
  return {
    key,
    hours: hours.length,
    ptfMean,
    smfMean: hours.reduce((a, h) => a + h.smf, 0) / n,
    spreadMean,
    spreadP90: quantile(spreads, 0.9),
    spreadPctOfPtf: pctOfPtf(spreadMean, ptfMean),
    deficitPct: (deficit / n) * 100,
    surplusPct: (surplus / n) * 100,
    balancedPct: hours.length ? ((hours.length - deficit - surplus) / n) * 100 : 0,
    zeroHours: hours.filter((h) => nominal(h) <= ZERO_PRICE_MAX).length,
    lowHours: hours.filter((h) => nominal(h) < LOW_PRICE_MAX).length,
    gipWeightedPrice: gip.weightedPrice,
    gipVolumeMwh: gip.volume,
  };
}

function push<K>(map: Map<K, MarketHour[]>, key: K, h: MarketHour) {
  const list = map.get(key);
  if (list) list.push(h);
  else map.set(key, [h]);
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * @param scale saatin TL fiyatlarını başka birime çeviren çarpan (reel TL, USD; lib/macro/price-units.ts). Fiyat
 *   dağılımları ve ortalamalar dönüştürülür; sıfır / düşük fiyat eşikleri nominal TL'de kalır.
 */
export function summarizeMarket(input: MarketHour[], scale?: (t: number) => number): MarketSummary | null {
  const scaled = scale
    ? input.map((h) => {
        const k = scale(h.t);
        return { ...h, nominalPtf: nominal(h), ptf: h.ptf * k, smf: h.smf * k, gipPrice: h.gipPrice == null ? h.gipPrice : h.gipPrice * k };
      })
    : input;
  const hours = [...scaled].sort((a, b) => a.t - b.t);
  if (!hours.length) return null;
  const n = hours.length;
  const deficit = hours.filter((h) => h.systemDirection === "DEFICIT");
  const surplus = hours.filter((h) => h.systemDirection === "SURPLUS");
  const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  const gip = gipOf(hours);
  const spread = dist(hours.map((h) => Math.abs(h.smf - h.ptf)));
  const ptf = dist(hours.map((h) => h.ptf));

  const byMonth = new Map<string, MarketHour[]>();
  const byHour = new Map<number, MarketHour[]>();
  for (const h of hours) {
    const d = new Date(h.t);
    push(byMonth, d.toISOString().slice(0, 7), h);
    push(byHour, d.getUTCHours(), h);
  }

  return {
    start: day(hours[0].t),
    end: day(hours[n - 1].t),
    hours: n,
    ptf,
    smf: dist(hours.map((h) => h.smf)),
    spread,
    spreadPctOfPtf: pctOfPtf(spread.mean, ptf.mean),
    directionalSpread: {
      deficit: mean(deficit.map((h) => h.smf - h.ptf)),
      surplus: mean(surplus.map((h) => h.ptf - h.smf)),
    },
    direction: {
      deficitPct: (deficit.length / n) * 100,
      surplusPct: (surplus.length / n) * 100,
      balancedPct: ((n - deficit.length - surplus.length) / n) * 100,
    },
    zeroHours: hours.filter((h) => nominal(h) <= ZERO_PRICE_MAX).length,
    lowHours: hours.filter((h) => nominal(h) < LOW_PRICE_MAX).length,
    gip: {
      hours: gip.hours,
      weightedPrice: gip.weightedPrice,
      totalVolumeMwh: gip.volume,
      avgHourlyVolumeMwh: gip.hours ? gip.volume / gip.hours : 0,
    },
    monthly: Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => bucket(k, v)),
    hourProfile: Array.from({ length: 24 }, (_, hr) => bucket(String(hr), byHour.get(hr) ?? [])),
  };
}

const fmt = (v: number) => Math.round(v).toLocaleString("tr-TR");
const change = (a: number, b: number) => (a === 0 ? null : ((b - a) / Math.abs(a)) * 100);

export interface MonthPair {
  /** Güncel dönemin ayı ("2026-03") */
  key: string;
  cur: MarketBucket;
  /** Bir önceki yılın aynı ayı; veri yoksa null */
  prev: MarketBucket | null;
}

/** Güncel dönemin her ayını bir önceki yılın aynı ayıyla eşler (yıllar arası yan yana gösterim) */
export function pairMonths(prev: MarketSummary | null, cur: MarketSummary): MonthPair[] {
  const byKey = new Map((prev?.monthly ?? []).map((m) => [m.key, m]));
  return cur.monthly.map((m) => ({ key: m.key, cur: m, prev: byKey.get(`${Number(m.key.slice(0, 4)) - 1}${m.key.slice(4)}`) ?? null }));
}

/**
 * İki dönemin (ör. 2025 ve 2026'nın aynı ayları) karşılaştırma cümleleri: bir ticaret uzmanının "ne değişti?" sorusuna
 * kısa cevap. Önce makas (dengesizlik maliyetinin sürücüsü) ve ay ay tutarlılığı, sonra fiyat seviyesi, sıfır fiyatlı
 * saatler ve sistem yönü.
 */
/** Aynı iki dönemin başka birimdeki özetleri (reel TL, USD); compareMarkets nominal cümlenin yanına koyar */
export interface MarketUnitViews {
  real?: { prev: MarketSummary; cur: MarketSummary; label: string };
  usd?: { prev: MarketSummary; cur: MarketSummary };
}

const fmt1 = (v: number) => v.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signedPct = (v: number) => `%${fmt(Math.abs(v))} ${v >= 0 ? "açıldı" : "daraldı"}`;

/** Makas değişiminin enflasyon ve kurdan arındırılmış okuması (nominal cümlenin hemen ardından) */
function unitSentence(prev: MarketSummary, cur: MarketSummary, units: MarketUnitViews): string | null {
  const parts: string[] = [];
  if (units.real) {
    const r = change(units.real.prev.spread.mean, units.real.cur.spread.mean);
    if (r !== null)
      parts.push(`Fiyatların genel artışı düşülünce (${units.real.label}) makas ${signedPct(r)}: ${fmt(units.real.prev.spread.mean)} → ${fmt(units.real.cur.spread.mean)} TL`);
  }
  if (units.usd) {
    const u = change(units.usd.prev.spread.mean, units.usd.cur.spread.mean);
    if (u !== null) parts.push(`dolar bazında ${fmt1(units.usd.prev.spread.mean)} → ${fmt1(units.usd.cur.spread.mean)} $/MWh (${u >= 0 ? "+" : "−"}%${fmt(Math.abs(u))})`);
  }
  if (prev.spreadPctOfPtf !== null && cur.spreadPctOfPtf !== null)
    parts.push(`PTF'ye oranla %${fmt(prev.spreadPctOfPtf)} → %${fmt(cur.spreadPctOfPtf)}`);
  if (!parts.length) return null;
  const [first, ...rest] = parts;
  return `${first.charAt(0).toLocaleUpperCase("tr-TR")}${first.slice(1)}${rest.length ? `; ${rest.join("; ")}` : ""}.`;
}

export function compareMarkets(prev: MarketSummary, cur: MarketSummary, prevLabel: string, curLabel: string, units: MarketUnitViews = {}): string[] {
  const out: string[] = [];
  const s = change(prev.spread.mean, cur.spread.mean);
  if (s !== null && Math.abs(s) >= 5) {
    out.push(
      `SMF–PTF makası nominal TL'de %${fmt(Math.abs(s))} ${s > 0 ? "açıldı" : "daraldı"}: saat başına ortalama ${fmt(prev.spread.mean)} TL'den ${fmt(cur.spread.mean)} TL'ye (${prevLabel} → ${curLabel}).`
    );
    const unitLine = unitSentence(prev, cur, units);
    if (unitLine) out.push(unitLine);
    const realOrNominal = units.real ? change(units.real.prev.spread.mean, units.real.cur.spread.mean)! : s;
    out.push(
      realOrNominal >= 5
        ? "Aynı tahmin hatası daha pahalıya uzlaşır."
        : realOrNominal <= -5
          ? "Aynı tahmin hatası daha ucuza uzlaşır."
          : "Enflasyon düşülünce makasın yükü belirgin değişmedi; nominal artışın çoğu genel fiyat artışı."
    );
    const pairs = pairMonths(prev, cur).filter((p) => p.prev);
    if (pairs.length >= 2) {
      const same = pairs.filter((p) => (s > 0 ? p.cur.spreadMean > p.prev!.spreadMean : p.cur.spreadMean < p.prev!.spreadMean)).length;
      out.push(
        `Makas, karşılaştırılan ${pairs.length} ${same === pairs.length ? "ayın hepsinde" : `aydan ${same} ayda`} geçen yılın aynı ayından ${s > 0 ? "geniş" : "dar"}.`
      );
    }
  }
  const p = change(prev.ptf.mean, cur.ptf.mean);
  if (p !== null && Math.abs(p) >= 5) {
    const rp = units.real ? change(units.real.prev.ptf.mean, units.real.cur.ptf.mean) : null;
    out.push(
      `Ortalama PTF nominal %${fmt(Math.abs(p))} ${p > 0 ? "yükseldi" : "düştü"}: ${fmt(prev.ptf.mean)} → ${fmt(cur.ptf.mean)} TL/MWh` +
        (rp === null ? "." : `; reel olarak %${fmt(Math.abs(rp))} ${rp >= 0 ? "yükseldi" : "düştü"}.`)
    );
  }
  if (cur.zeroHours !== prev.zeroHours) {
    const ratio = prev.zeroHours > 0 ? cur.zeroHours / prev.zeroHours : null;
    out.push(
      `Sıfır fiyatlı saat ${fmt(prev.zeroHours)} → ${fmt(cur.zeroHours)}` +
        (ratio !== null && ratio >= 2 && cur.zeroHours >= 20 ? `: ${ratio.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kat.` : ".") +
        ` 1.000 TL/MWh altındaki saat ${fmt(prev.lowHours)} → ${fmt(cur.lowHours)}.`
    );
  }
  const d = cur.direction.deficitPct - prev.direction.deficitPct;
  if (Math.abs(d) >= 3)
    out.push(`Sistem açığındaki saatlerin payı %${fmt(prev.direction.deficitPct)} → %${fmt(cur.direction.deficitPct)} (${d > 0 ? "+" : "−"}${fmt(Math.abs(d))} puan).`);
  return out;
}
