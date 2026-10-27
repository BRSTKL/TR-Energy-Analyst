/**
 * TR-Energy Analyst - Teklif öncesi görünüm için bağlam analizleri (ÖNİZLEME; EPİAŞ'ta bulunan ek veriler, 27.10.2026)
 *
 * Bulunan veriler: doğal gaz günlük referans fiyatı (GRF), gün öncesi arz–talep eğrisi, GÖP toplam alış / satış teklif miktarı,
 * gün içi işlem geçmişi. Fiyat ölçümünde (scripts/analysis, 27.10.2026) gaz fiyatı modele katkı vermedi (Haziran–Ekim 2026'da
 * %15,9 → %14,4) ve eğri kayması doğrudan tahmin olarak kötüydü (hata 527 → 992 TL/MWh), regresyona üçüncü özellik olarak
 * ~1 puan ekledi; bu yüzden burada tahmin değil bağlam olarak gösterilir. SAF: I/O yok.
 */

export type CurvePoint = [price: number, supply: number, demand: number];

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// ---------------------------------------------------------------- doğal gaz

/** Varsayımlar (yaklaşık, yalnız yakıt maliyeti): 1 sm³ ≈ 9,6 kWh (8.250 kcal/sm³, üst ısıl değer); kombine çevrim verimi %45–55 (üst ısıl değere göre) */
export const GAS_KWH_PER_SM3 = 9.6;
export const GAS_EFFICIENCY = { low: 0.45, high: 0.55 } as const;

/** GRF (TL / 1000 sm³) → santral çıkışı yakıt maliyeti (TL/MWh elektrik) verime göre */
export function gasFuelCost(grfTlPer1000Sm3: number, efficiency: number): number {
  return grfTlPer1000Sm3 / ((GAS_KWH_PER_SM3 * 1000) / 1000) / efficiency;
}

export interface GasSummary {
  last: { date: string; tl: number; usdMmbtu: number | null };
  /** Son 28 günün medyanına göre değişim (%) */
  vsMedian28Pct: number | null;
  /** 90 gün önceye göre (%) */
  vs90dPct: number | null;
  /** Yakıt maliyeti aralığı (TL/MWh elektrik): [verim yüksek, verim düşük] */
  fuelCost: [number, number];
}

export function summarizeGas(
  series: Array<{ date: string; tl: number; usdMmbtu?: number | null }>
): GasSummary | null {
  const s = [...series]
    .filter((x) => Number.isFinite(x.tl))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!s.length) return null;
  const last = s[s.length - 1];
  const prev28 = s.slice(-29, -1).map((x) => x.tl);
  const ago = s[s.length - 91];
  return {
    last: { date: last.date, tl: last.tl, usdMmbtu: last.usdMmbtu ?? null },
    vsMedian28Pct: prev28.length >= 20 ? (last.tl / median(prev28) - 1) * 100 : null,
    vs90dPct: ago ? (last.tl / ago.tl - 1) * 100 : null,
    fuelCost: [
      gasFuelCost(last.tl, GAS_EFFICIENCY.high),
      gasFuelCost(last.tl, GAS_EFFICIENCY.low),
    ],
  };
}

// ---------------------------------------------------------------- arz–talep eğrisi

/** Eğri (fiyat artan; arz eksi işaretli kümülatif, talep kümülatif): talep dq MW kayınca denge fiyatı ve miktarı; eğri dengeyi kesmiyorsa uç değer */
export function curveEquilibrium(
  c: CurvePoint[],
  dq = 0
): { price: number; quantity: number } | null {
  if (c.length < 10) return null;
  const f = (p: CurvePoint) => p[2] + dq - Math.abs(p[1]);
  for (let i = 1; i < c.length; i++) {
    const f0 = f(c[i - 1]);
    const f1 = f(c[i]);
    if (f0 > 0 && f1 <= 0) {
      const t = f0 / (f0 - f1 || 1);
      return {
        price: c[i - 1][0] + (c[i][0] - c[i - 1][0]) * t,
        quantity: Math.abs(c[i - 1][1]) + (Math.abs(c[i][1]) - Math.abs(c[i - 1][1])) * t,
      };
    }
  }
  const edge = f(c[0]) <= 0 ? c[0] : c[c.length - 1];
  return { price: edge[0], quantity: Math.abs(edge[1]) };
}

export interface CurveHour {
  hour: number;
  price: number;
  /** Dengedeki işlem hacmi (MW) */
  quantity: number;
  /** Talep +/- dq MW kayınca denge fiyatı */
  shifts: Array<{ dq: number; price: number }>;
}
export const CURVE_SHIFTS = [-2000, -1000, 1000, 2000];

export function curveHour(hour: number, c: CurvePoint[]): CurveHour | null {
  const base = curveEquilibrium(c, 0);
  if (!base) return null;
  const shifts = CURVE_SHIFTS.map((dq) => ({
    dq,
    price: curveEquilibrium(c, dq)?.price ?? base.price,
  }));
  return { hour, price: base.price, quantity: base.quantity, shifts };
}

/** Grafik için en çok `n` noktaya seyrelt (fiyat 0'dan `maxPrice`'a; ilk ve son nokta korunur) */
export function downsampleCurve(
  c: CurvePoint[],
  n: number,
  maxPrice: number
): CurvePoint[] {
  const pts = c.filter((p) => p[0] <= maxPrice);
  if (pts.length <= n) return pts;
  const out: CurvePoint[] = [];
  for (let i = 0; i < n; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (n - 1))]);
  return out;
}

// ---------------------------------------------------------------- teklif hacimleri

export interface BidOfferHour {
  hour: number;
  /** Toplam satış teklifi / alış teklifi miktarı oranı */
  ratio: number | null;
  ref: number | null;
}

/** Saat bazında satış / alış oranı ve önceki günlerin ortancası; oran < ref: satış teklifi görece az (sıkı) */
export function bidOfferRatios(
  day: { bid: Array<number | null>; offer: Array<number | null> },
  history: Array<{ bid: Array<number | null>; offer: Array<number | null> }>
): BidOfferHour[] {
  const ratio = (
    d: { bid: Array<number | null>; offer: Array<number | null> },
    h: number
  ) => (d.bid[h] && d.offer[h] ? d.offer[h]! / d.bid[h]! : null);
  return Array.from({ length: 24 }, (_, h) => {
    const past = history.map((x) => ratio(x, h)).filter((v): v is number => v !== null);
    return { hour: h, ratio: ratio(day, h), ref: past.length >= 6 ? median(past) : null };
  });
}

// ---------------------------------------------------------------- gün içi işlemler

export interface GipHour {
  hour: number;
  /** Eşleşen miktar toplamı (MWh; kayıtlar lot, 1 lot = 0,1 MWh; yalnız saatlik kontratlar, blok kontratlar hariç) */
  volume: number;
  /** Miktar ağırlıklı ortalama fiyat */
  vwap: number | null;
  trades: number;
}

/** PH<yyaagg><ss> saatlik kontratlarından saat bazında hacim, ağırlıklı fiyat ve işlem sayısı */
export function gipHours(
  trades: Array<{ contractName: string; price: number; quantity: number }>,
  date: string
): GipHour[] {
  const yymmdd = `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;
  const acc = Array.from({ length: 24 }, () => ({ q: 0, pq: 0, n: 0 }));
  for (const t of trades) {
    const m = /^PH(\d{6})(\d{2})$/.exec(t.contractName);
    if (!m || m[1] !== yymmdd) continue;
    const h = Number(m[2]);
    if (h < 0 || h > 23 || !(t.quantity > 0) || !Number.isFinite(t.price)) continue;
    acc[h].q += t.quantity;
    acc[h].pq += t.price * t.quantity;
    acc[h].n++;
  }
  return acc.map((a, hour) => ({
    hour,
    volume: a.q / 10,
    vwap: a.q > 0 ? a.pq / a.q : null,
    trades: a.n,
  }));
}

// ---------------------------------------------------------------- arıza ve bakım bildirimleri

export interface OutageMessageLike {
  id: number;
  powerPlantName?: string | null;
  uevcbName?: string | null;
  orgName?: string | null;
  caseStartDate?: string | null;
  caseEndDate?: string | null;
  operatorPower?: number | null;
  capacityAtCaseTime?: number | null;
  reason?: string | null;
}

export interface OutageTop {
  name: string;
  org: string | null;
  lostMw: number;
  since: string;
  until: string | null;
  reason: string | null;
}

export interface OutageOutlook {
  /** Bildirimlerin alındığı an (UTC ISO) */
  asOf: string;
  /** Şu an süren bildirim sayısı ve kaybı (MW) */
  ongoingCount: number;
  ongoingMw: number;
  /** Hedef günün başında hâlâ sürmesi beklenenler (bitişi hedef günden sonra ya da bildirilmemiş) */
  carryCount: number;
  carryMw: number;
  /** Hedef günün saatlerinde, o saatte hâlâ sürmesi beklenen bildirimlerin kaybı (MW) */
  hours: Array<{ hour: number; mw: number }>;
  /** Son 14 günün her günü 12:00'deki süren kayıp (MW) ortancası ve çeyrekleri */
  typical: { median: number; q25: number; q75: number; days: number } | null;
  top: OutageTop[];
}

const lostMw = (m: OutageMessageLike) => {
  const power = Number(m.operatorPower);
  const cap = Number(m.capacityAtCaseTime);
  return Number.isFinite(power) && Number.isFinite(cap) ? Math.max(0, power - cap) : 0;
};
const quant = (v: number[], q: number) => {
  const a = [...v].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  return a[lo] + (a[Math.ceil(pos)] - a[lo]) * (pos - lo);
};

/**
 * Hedef gün için bildirim görünümü. EPİAŞ yalnız başlamış bildirimleri verir (ileri tarihli planlı bakım gelmez), bu yüzden
 * "yarın" için bilinen tek şey bugün süren ve yarına sarkacak olanlardır; yayım zamanı bildirimlerde yoktur. Bitişi boş ya da
 * geçersiz bildirim sonsuza dek sürüyor sayılmaz: bilinmeyen bitiş hedef günü kapsıyor varsayılır ve ayrıca sayılır.
 * `date` Türkiye günü; `nowMs` gerçek an.
 */
export function outageOutlook(
  messages: OutageMessageLike[],
  date: string,
  nowMs: number
): OutageOutlook {
  const seen = new Set<number>();
  const list: Array<{ m: OutageMessageLike; start: number; end: number; lost: number }> =
    [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const start = Date.parse(m.caseStartDate ?? "");
    const endRaw = Date.parse(m.caseEndDate ?? "");
    if (!Number.isFinite(start) || start > nowMs) continue;
    const lost = lostMw(m);
    if (lost <= 0) continue;
    list.push({ m, start, end: Number.isFinite(endRaw) ? endRaw : Infinity, lost });
  }
  const at = (t: number) => list.filter((x) => x.start <= t && x.end > t);
  const sum = (xs: typeof list) => xs.reduce((s, x) => s + x.lost, 0);
  const dayStart = Date.parse(`${date}T00:00:00+03:00`);
  const ongoing = at(nowMs);
  const carry = ongoing.filter((x) => x.end > dayStart);
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const t = dayStart + hour * 3_600_000;
    return { hour, mw: sum(ongoing.filter((x) => x.end > t)) };
  });
  // Aynı bakış süresi için: sorgu 45 gün geriye gider; 14 gün öncesine kadar bakılır (30 günden uzun süren bildirimler iki tarafta da eksik)
  const noons = Array.from({ length: 14 }, (_, i) =>
    sum(at(Date.parse(`${date}T12:00:00+03:00`) - (i + 2) * 86_400_000))
  );
  const fmtTr = (ms: number) =>
    new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
  return {
    asOf: new Date(nowMs).toISOString(),
    ongoingCount: ongoing.length,
    ongoingMw: sum(ongoing),
    carryCount: carry.length,
    carryMw: sum(carry),
    hours,
    typical:
      list.length >= 20
        ? {
            median: quant(noons, 0.5),
            q25: quant(noons, 0.25),
            q75: quant(noons, 0.75),
            days: noons.length,
          }
        : null,
    top: [...carry]
      .sort((a, b) => b.lost - a.lost)
      .slice(0, 8)
      .map((x) => ({
        name: x.m.uevcbName ?? x.m.powerPlantName ?? `#${x.m.id}`,
        org: x.m.orgName ?? null,
        lostMw: x.lost,
        since: fmtTr(x.start),
        until: Number.isFinite(x.end) ? fmtTr(x.end) : null,
        reason: x.m.reason?.trim() || null,
      })),
  };
}
