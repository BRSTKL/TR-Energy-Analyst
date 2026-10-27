/**
 * TR-Energy Analyst - Veri havuzu: ENTSO-E komşu ülke fiyatları ve sınır akışları (27.10.2026)
 *
 * ENTSO-E Transparency Platform REST API (https://web-api.tp.entsoe.eu/api, `ENTSOE_TOKEN`; yanıt XML):
 *   A44 gün öncesi fiyat (EUR/MWh): Bulgaristan (10YCA-BULGARIA-R), Yunanistan (10YGR-HTSO-----Y). Türkiye için yok (kod 999).
 *       Çözünürlük dönemde değişir (2024'te PT60M, 2026'da PT15M); saatliğe aritmetik ortalamayla indirilir.
 *   A11 fiziksel akış (MW, saatlik): Türkiye ↔ Bulgaristan, Türkiye ↔ Yunanistan, iki yön. `out_Domain` → `in_Domain` yönünde.
 * Eğri tipi A03 (değişken bloklu): fiyat ya da miktar değişmediyse nokta yazılmaz, eksik konum bir öncekinin değeridir ve dönemin
 * sonuna kadar sürer. Zamanlar UTC; havuz Türkiye saatiyle (UTC+3, yıl boyu) günlük 24 saatlik dizilerdir.
 * Kur: ECB referans kuru EUR/TRY (iş günleri), PTF'yi EUR'ya çevirmek için.
 * Tek belge: `data/pool/entsoe/neighbors.json.gz`. SAF: I/O yok (dosya işleri entsoe-store.ts).
 */

export const ENTSOE_FORMAT = 1;
export const PRICE_ZONES = ["BG", "GR"] as const;
export type PriceZone = (typeof PRICE_ZONES)[number];
/** "KAYNAK_HEDEF": akışın yönü (TR_BG: Türkiye'den Bulgaristan'a, yani ihracat) */
export const FLOW_KEYS = ["TR_BG", "BG_TR", "TR_GR", "GR_TR"] as const;
export type FlowKey = (typeof FLOW_KEYS)[number];

export const EIC = {
  TR: "10YTR-TEIAS----W",
  BG: "10YCA-BULGARIA-R",
  GR: "10YGR-HTSO-----Y",
} as const;

/** Günlük 24 saatlik dizi (Türkiye saati); verisi olmayan saat null */
export type HourlyDay = Array<number | null>;

export interface EntsoeDoc {
  format: number;
  /** Son başarılı çekim (UTC ISO) */
  fetchedAt: string | null;
  /** Gün (YYYY-AA-GG) → 24 saatlik EUR/MWh */
  prices: Record<PriceZone, Record<string, HourlyDay>>;
  /** Gün → 24 saatlik MW */
  flows: Record<FlowKey, Record<string, HourlyDay>>;
  /** ECB EUR/TRY (TL per EUR), iş günleri */
  fx: Record<string, number>;
}

export const emptyEntsoeDoc = (): EntsoeDoc => ({
  format: ENTSOE_FORMAT,
  fetchedAt: null,
  prices: { BG: {}, GR: {} },
  flows: { TR_BG: {}, BG_TR: {}, TR_GR: {}, GR_TR: {} },
  fx: {},
});

const HOUR_MS = 3_600_000;
const TR_OFFSET_MS = 3 * HOUR_MS;

export type EntsoeParsed =
  | { kind: "data"; hours: Map<string, HourlyDay>; points: number }
  /** ENTSO-E "Acknowledgement" belgesi: 999 = o aralıkta veri yok; diğerleri hata */
  | { kind: "ack"; code: string; text: string };

const tag = (s: string, name: string) =>
  new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(s)?.[1] ?? null;

function resolutionMs(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso);
  if (!m || (!m[1] && !m[2])) throw new Error(`Beklenmeyen çözünürlük: ${iso}`);
  return ((m[1] ? Number(m[1]) : 0) * 60 + (m[2] ? Number(m[2]) : 0)) * 60_000;
}

/** "2026-10-24T22:00Z" → ms (ECMAScript bu biçimi okur) */
function utcMs(s: string | null): number {
  const t = s ? Date.parse(s) : NaN;
  if (!Number.isFinite(t)) throw new Error(`Beklenmeyen zaman: ${s}`);
  return t;
}

/**
 * Yanıt gövdesini saatlik Türkiye günlerine çevirir. `valueTag`: fiyat için "price.amount", akış için "quantity".
 * Dönem uzunluğu ve çözünürlükten beklenen nokta sayısı hesaplanır; eksik konumlar bir öncekinin değeriyle doldurulur
 * (A03), ilk konum eksikse o aralık boş kalır. Bir saate düşen noktaların ortalaması alınır.
 */
export function parseEntsoe(
  xml: string,
  valueTag: "price.amount" | "quantity"
): EntsoeParsed {
  if (/<Acknowledgement_MarketDocument/.test(xml)) {
    const reason = /<Reason>([\s\S]*?)<\/Reason>/.exec(xml)?.[1] ?? "";
    return {
      kind: "ack",
      code: tag(reason, "code") ?? "?",
      text: (tag(reason, "text") ?? "").slice(0, 300),
    };
  }
  if (!/<Publication_MarketDocument/.test(xml))
    throw new Error("Beklenmeyen yanıt: ENTSO-E belgesi değil");

  const acc = new Map<string, { sum: number[]; n: number[] }>();
  let points = 0;
  for (const ts of xml.split("<TimeSeries>").slice(1)) {
    for (const period of ts.split("<Period>").slice(1)) {
      const start = utcMs(tag(period, "start"));
      const end = utcMs(tag(period, "end"));
      const res = resolutionMs(tag(period, "resolution") ?? "");
      const slots = Math.round((end - start) / res);
      const values = new Map<number, number>();
      for (const p of period.split("<Point>").slice(1)) {
        const pos = Number(tag(p, "position"));
        const v = Number(tag(p, valueTag));
        if (Number.isInteger(pos) && pos >= 1 && Number.isFinite(v)) values.set(pos, v);
      }
      let last: number | null = null;
      for (let pos = 1; pos <= slots; pos++) {
        const v = values.get(pos);
        if (v !== undefined) {
          last = v;
          points++;
        }
        if (last === null) continue;
        const wall = new Date(start + (pos - 1) * res + TR_OFFSET_MS);
        const day = wall.toISOString().slice(0, 10);
        const hour = wall.getUTCHours();
        const a = acc.get(day) ?? { sum: Array(24).fill(0), n: Array(24).fill(0) };
        a.sum[hour] += last;
        a.n[hour]++;
        acc.set(day, a);
      }
    }
  }
  const hours = new Map<string, HourlyDay>();
  for (const [day, a] of acc)
    hours.set(
      day,
      a.sum.map((s, h) => (a.n[h] ? s / a.n[h] : null))
    );
  return { kind: "data", hours, points };
}

export interface EntsoeMergeResult {
  added: number;
  changed: number;
}

/** Saatleri belgeye işler (yerinde); yalnız dolu saatler yazılır, aynı değer sayılmaz */
export function mergeHours(
  target: Record<string, HourlyDay>,
  hours: Map<string, HourlyDay>
): EntsoeMergeResult {
  let added = 0;
  let changed = 0;
  for (const [day, arr] of hours) {
    const cur = (target[day] ??= Array(24).fill(null));
    for (let h = 0; h < 24; h++) {
      const v = arr[h];
      if (v === null || v === undefined) continue;
      if (cur[h] === null) added++;
      else if (Math.abs((cur[h] as number) - v) > 1e-9) changed++;
      cur[h] = Math.round(v * 1e6) / 1e6;
    }
  }
  return { added, changed };
}

/** ECB hist / hist-90d XML: `<Cube time="2026-10-27"> … <Cube currency="TRY" rate="55.513"/>`; yalnız `from`'dan sonrası */
export function parseEcbTry(xml: string, from = "2024-01-01"): Record<string, number> {
  if (!/<gesmes:Envelope/.test(xml))
    throw new Error("Beklenmeyen yanıt: ECB belgesi değil");
  const out: Record<string, number> = {};
  for (const m of xml.matchAll(/<Cube time="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Cube>/g)) {
    if (m[1] < from) continue;
    const rate = /currency="TRY"\s+rate="([\d.]+)"/.exec(m[2])?.[1];
    if (rate && Number(rate) > 0) out[m[1]] = Number(rate);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Türkiye gününün UTC sınırı, ENTSO-E `periodStart/periodEnd` biçiminde (yyyyMMddHHmm) */
export function entsoePeriod(dayTr: string): string {
  const d = new Date(Date.parse(`${dayTr}T00:00:00Z`) - TR_OFFSET_MS);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

/** Günün (Türkiye) 24 saati tam dolu mu */
export const isFullDay = (a: HourlyDay | undefined): a is number[] =>
  !!a && a.length === 24 && a.every((v) => v !== null);

/** Belgedeki bir serinin en son tam günü ya da null */
export function latestFullDay(series: Record<string, HourlyDay>): string | null {
  const days = Object.keys(series)
    .filter((d) => isFullDay(series[d]))
    .sort();
  return days.length ? days[days.length - 1] : null;
}

/** EUR/TRY: gün için son bilinen kur (en çok 7 gün geriye) */
export function fxFor(fx: Record<string, number>, day: string): number | null {
  for (let i = 0; i <= 7; i++) {
    const d = new Date(Date.parse(`${day}T00:00:00Z`) - i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (fx[d]) return fx[d];
  }
  return null;
}
