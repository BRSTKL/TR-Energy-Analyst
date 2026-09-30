/**
 * TR-Energy Analyst - Veri havuzu: santral-yıl dosyasının biçimi (PLAN 7.1)
 *
 * EPİAŞ santral verisi bir kez çekilir ve havuzda durur; projeler, sektör karnesi ve toplayıcı analizleri aynı veriyi
 * kullanır. Her santralin her yılı tek bir belgedir: yılın ilk saatinden itibaren saat sırasıyla üç dizi (ilk KGÜP,
 * son KGÜP, UEVM; verisi olmayan saat null) ve her seri için ay ay çekim kaydı. Kayıt, "bu ay bu seri çekildi mi,
 * ne zaman" sorusunu cevaplar: bir ay kayıtta yoksa eksiktir; ayın bitişinden PROVISIONAL_DAYS gün geçmeden
 * çekildiyse geçicidir (EPİAŞ UEVM'yi uzlaştırma kesinleşene kadar düzeltebilir) ve yeniden çekilir.
 *
 * Zaman damgaları uygulamanın kuralıyla duvar saatidir (UTC alanlarında). SAF: I/O yok (dosya işleri pool-store.ts).
 */

export type PoolSeries = "kgupFirst" | "kgupFinal" | "uevm";
export const POOL_SERIES: readonly PoolSeries[] = ["kgupFirst", "kgupFinal", "uevm"];

/** Ayın bitişinden bu kadar gün geçmeden yapılan çekim geçicidir */
export const PROVISIONAL_DAYS = 90;

export interface PoolYear {
  epiasPlantId: number;
  year: number;
  /** İlk saat (duvar saati UTC alanında, ISO): yılın 1 Ocak 00:00'ı */
  start: string;
  kgupFirst: Array<number | null>;
  kgupFinal: Array<number | null>;
  uevm: Array<number | null>;
  /** Seri → ay ("01".."12") → çekilme anı (ISO) */
  fetched: Record<PoolSeries, Record<string, string>>;
  /** Ay → UEVM'nin kaynak kırılımı (MWh; santral türünü bulmak için). Sektör önbelleğinden aktarılan aylarda yok */
  uevmFuel?: Record<string, Record<string, number>>;
}

export interface PoolHour {
  timestamp: Date;
  kgupFirst: number | null;
  kgupFinal: number | null;
  uevm: number | null;
}

const HOUR = 3_600_000;
const round = (v: number) => Math.round(v * 1000) / 1000;
const mm = (month: number) => String(month).padStart(2, "0");

export function hoursInYear(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / HOUR;
}

export function emptyYear(epiasPlantId: number, year: number): PoolYear {
  const n = hoursInYear(year);
  return {
    epiasPlantId,
    year,
    start: new Date(Date.UTC(year, 0, 1)).toISOString(),
    kgupFirst: Array(n).fill(null),
    kgupFinal: Array(n).fill(null),
    uevm: Array(n).fill(null),
    fetched: { kgupFirst: {}, kgupFinal: {}, uevm: {} },
  };
}

/**
 * Bir serinin bir ayını yazar: ayın bütün saatleri önce null yapılır (EPİAŞ'ın artık vermediği eski değer kalmaz),
 * sonra satırlar yerleştirilir. Ay dışındaki satırlar atlanır. Belgeyi yerinde değiştirir ve döndürür.
 */
export function writeMonth(
  doc: PoolYear,
  series: PoolSeries,
  month: number,
  rows: Array<{ timestamp: Date | string; value: number }>,
  fetchedAt: Date,
  byFuel?: Record<string, number>
): PoolYear {
  const t0 = Date.parse(doc.start);
  const from = (Date.UTC(doc.year, month - 1, 1) - t0) / HOUR;
  const to = (Date.UTC(doc.year, month, 1) - t0) / HOUR;
  const arr = doc[series];
  for (let i = from; i < to; i++) arr[i] = null;
  for (const r of rows) {
    const i = (new Date(r.timestamp).getTime() - t0) / HOUR;
    if (!Number.isInteger(i) || i < from || i >= to || !Number.isFinite(r.value)) continue;
    arr[i] = round(r.value);
  }
  doc.fetched[series][mm(month)] = fetchedAt.toISOString();
  if (series === "uevm" && byFuel) (doc.uevmFuel ??= {})[mm(month)] = byFuel;
  return doc;
}

/** Ay kesinleşmiş sayılır mı: ayın bitişinden PROVISIONAL_DAYS gün sonra (veya daha geç) çekildiyse */
export function isFinalFetch(year: number, month: number, fetchedAt: string): boolean {
  return Date.parse(fetchedAt) >= Date.UTC(year, month, 1) + PROVISIONAL_DAYS * 24 * HOUR;
}

export type MonthStatus = "missing" | "provisional" | "final";

export function monthStatus(doc: PoolYear | null, series: PoolSeries, month: number): MonthStatus {
  const at = doc?.fetched[series][mm(month)];
  if (!at) return "missing";
  return isFinalFetch(doc!.year, month, at) ? "final" : "provisional";
}

/** Ay henüz bitmeden çekilen veri (eksik günler var) bu kadar gün sonra, biten ama kesinleşmemiş ay bu kadar gün sonra yenilenir */
export const REFRESH_DAYS_PARTIAL = 1;
export const REFRESH_DAYS_PROVISIONAL = 7;

/**
 * Yeniden çekilmesi gereken ay mı: eksikse evet; kesinse hayır. Geçici ay: ay bitmeden çekildiyse (yeni günler
 * eklenecek) REFRESH_DAYS_PARTIAL, bittikten sonra çekildiyse (EPİAŞ düzeltmesi beklenir) REFRESH_DAYS_PROVISIONAL
 * gün geçince evet. Böylece aynı hafta açılan projeler EPİAŞ'a tekrar gitmez.
 */
export function needsFetch(doc: PoolYear | null, series: PoolSeries, month: number, now: Date): boolean {
  const status = monthStatus(doc, series, month);
  if (status === "missing") return true;
  if (status === "final") return false;
  const at = Date.parse(doc!.fetched[series][mm(month)]);
  // Duvar saatiyle ayın bitişi (UTC alanında) → gerçek an: 3 saat önce
  const partial = at < Date.UTC(doc!.year, month, 1) - 3 * HOUR;
  const days = partial ? REFRESH_DAYS_PARTIAL : REFRESH_DAYS_PROVISIONAL;
  return now.getTime() - at >= days * 24 * HOUR;
}

/** [startDay, endDay] (gün dahil, "YYYY-MM-DD") aralığının dokunduğu yıl-aylar */
export function monthsInRange(startDay: string, endDay: string): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let y = Number(startDay.slice(0, 4));
  let m = Number(startDay.slice(5, 7));
  const ey = Number(endDay.slice(0, 4));
  const em = Number(endDay.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Belgelerden [startDay, endDay] aralığının saatlerini okur; hiçbir serisinde değer olmayan saatler atlanır */
export function readRange(docs: PoolYear[], startDay: string, endDay: string): PoolHour[] {
  const from = Date.parse(`${startDay}T00:00:00Z`);
  const to = Date.parse(`${endDay}T00:00:00Z`) + 24 * HOUR;
  const out: PoolHour[] = [];
  for (const doc of [...docs].sort((a, b) => a.year - b.year)) {
    const t0 = Date.parse(doc.start);
    const n = doc.uevm.length;
    const i0 = Math.max(0, (from - t0) / HOUR);
    const i1 = Math.min(n, (to - t0) / HOUR);
    for (let i = i0; i < i1; i++) {
      const kgupFirst = doc.kgupFirst[i];
      const kgupFinal = doc.kgupFinal[i];
      const uevm = doc.uevm[i];
      if (kgupFirst === null && kgupFinal === null && uevm === null) continue;
      out.push({ timestamp: new Date(t0 + i * HOUR), kgupFirst, kgupFinal, uevm });
    }
  }
  return out;
}

/** Aralığın dokunduğu ayların UEVM kaynak kırılımı toplamı (hiçbir ayda yoksa boş nesne) */
export function fuelInRange(docs: PoolYear[], startDay: string, endDay: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { year, month } of monthsInRange(startDay, endDay)) {
    const f = docs.find((d) => d.year === year)?.uevmFuel?.[mm(month)];
    if (!f) continue;
    for (const [k, v] of Object.entries(f)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
