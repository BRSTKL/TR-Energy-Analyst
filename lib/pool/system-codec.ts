/**
 * TR-Energy Analyst - Veri havuzu: sistem geneli saatlik seriler (Türkiye toplamı; "sistem yönünü ne belirledi?")
 *
 * Her yıl tek belge, yılın ilk saatinden saat sırasıyla:
 *   - kgup / uevm: kaynak türüne göre son KGÜP (`/generation/data/dpp`, region TR1) ve UEVM (`/generation/data/injection-quantity`)
 *   - lep: TEİAŞ yük tahmin planı (`/consumption/data/load-estimation-plan`)
 *   - uecm: uzlaştırmaya esas çekiş miktarı, Türkiye toplamı (`/consumption/data/uecm`, alan `swv`, saat `hour`). Saklanır,
 *     sistem yönü hesabında kullanılmaz (saatlik sinyali daha zayıf; gerekçe lib/analysis/system-drivers.ts)
 *   - consumption: gerçek zamanlı tüketim (`/consumption/data/realtime-consumption`); sistem yönü hesabında tüketim budur
 *   - upDelivered / downDelivered / netInstruction: teslim edilen YAL, YAT (eksi) ve net talimat (`/markets/bpm/data/order-summary-up|down`)
 *   - rt / rtImportExport: gerçek zamanlı üretim, kaynağa göre, ve ithalat / ihracat (`/generation/data/realtime-generation`, Türkiye
 *     toplamı; günlük piyasa panosu, Aşama 24). Dünün saatleri ertesi gün yayımlı (UEVM haftalarca sonra); ölçümdür, EPİAŞ düzeltebilir.
 * MWh (saatlik, yani ortalama MW). Verisi olmayan saat null. Ay ay çekim anı santral havuzuyla aynı kuralla geçici / kesin
 * sayılır (pool-codec.ts: PROVISIONAL_DAYS; UEVM uzlaştırma kesinleşene kadar düzeltilebilir).
 *
 * KGÜP ile UEVM aynı santralleri kapsar (lisanssız güneş dahil; Eylül 2026 aylık ortalamaları %3 içinde). Gerçek zamanlı
 * üretim (`rt`) sistem yönü hesabında kullanılmaz: güneşte KGÜP'ten saatte ortalama yaklaşık 4.400 MW düşük (Eylül 2026), lisanssız
 * güneşi kapsamıyor. Günlük panoda rüzgâr ve lisanslı kaynaklar için kullanılır; güneşin lisanssız payı KGÜP'ten alınır
 * (gerçek zamanlı tüketim lisanssız güneşi içerir, gerçek zamanlı üretim içermez: 26.10.2026 ölçümü). Kaynak adları UEVM'ninkiler;
 * KGÜP'ün Türkçe alanları eşlenir, KGÜP'te ayrı olmayan asfaltit "other"a, LNG "naturalGas"a eklenir.
 *
 * Zaman damgaları uygulamanın kuralıyla duvar saatidir (UTC alanlarında). SAF: I/O yok (dosya işleri system-store.ts).
 */

import { isFinalFetch, REFRESH_DAYS_PROVISIONAL, hoursInYear, type MonthStatus } from "./pool-codec";

export const SYSTEM_SOURCES = [
  "wind",
  "sun",
  "river",
  "dam",
  "naturalGas",
  "lignite",
  "importedCoal",
  "stoneCoal",
  "fueloil",
  "geothermal",
  "biomass",
  "naphtha",
  "other",
] as const;
export type SystemSource = (typeof SYSTEM_SOURCES)[number];

export type SystemScalar = "lep" | "uecm" | "consumption" | "upDelivered" | "downDelivered" | "netInstruction" | "rtImportExport";
export const SYSTEM_SCALARS: readonly SystemScalar[] = ["lep", "uecm", "consumption", "upDelivered", "downDelivered", "netInstruction", "rtImportExport"];

/** Belge biçimi: 2 = UEÇM eklendi (20.10.2026), 3 = gerçek zamanlı üretim eklendi. Eski biçimdeki belgenin bütün ayları yeniden çekilir */
export const SYSTEM_FORMAT = 3;

type Series = Array<number | null>;

export interface SystemYear {
  /** Biçim (SYSTEM_FORMAT); eski belgelerde yok */
  format?: number;
  year: number;
  /** İlk saat (duvar saati UTC alanında, ISO): yılın 1 Ocak 00:00'ı */
  start: string;
  kgup: Record<SystemSource, Series>;
  uevm: Record<SystemSource, Series>;
  lep: Series;
  uecm: Series;
  consumption: Series;
  upDelivered: Series;
  downDelivered: Series;
  netInstruction: Series;
  /** Gerçek zamanlı üretim (kaynağa göre; lisanssız güneşi içermez) */
  rt: Record<SystemSource, Series>;
  /** Gerçek zamanlı ithalat / ihracat (EPİAŞ `importExport`; işareti EPİAŞ'ınkidir) */
  rtImportExport: Series;
  /** Ay ("01".."12") → çekilme anı (ISO) */
  fetched: Record<string, string>;
}

/** Bir ayın EPİAŞ cevapları (her uç noktanın `items` dizisi) */
export interface SystemMonthRaw {
  dpp: unknown[];
  uevm: unknown[];
  lep: unknown[];
  uecm: unknown[];
  consumption: unknown[];
  up: unknown[];
  down: unknown[];
  rt: unknown[];
}

const HOUR = 3_600_000;
const mm = (month: number) => String(month).padStart(2, "0");
const round = (v: number) => Math.round(v * 100) / 100;

/** KGÜP (dpp) alanı → kaynak */
export const DPP_FIELDS: Record<string, SystemSource> = {
  ruzgar: "wind",
  gunes: "sun",
  akarsu: "river",
  barajli: "dam",
  dogalgaz: "naturalGas",
  linyit: "lignite",
  ithalKomur: "importedCoal",
  tasKomur: "stoneCoal",
  fuelOil: "fueloil",
  jeotermal: "geothermal",
  biokutle: "biomass",
  nafta: "naphtha",
  diger: "other",
};

/** UEVM alanı → kaynak (aynı adlar; KGÜP'te ayrı olmayanlar eşlenir) */
const UEVM_FIELDS: Record<string, SystemSource> = {
  ...Object.fromEntries(SYSTEM_SOURCES.map((s) => [s, s])),
  asphaltite: "other",
  lng: "naturalGas",
};

/** Gerçek zamanlı üretim alanı → kaynak (`total` ve `importExport` kaynak değildir) */
const RT_FIELDS: Record<string, SystemSource> = {
  wind: "wind",
  sun: "sun",
  river: "river",
  dammedHydro: "dam",
  naturalGas: "naturalGas",
  lng: "naturalGas",
  lignite: "lignite",
  importCoal: "importedCoal",
  blackCoal: "stoneCoal",
  fueloil: "fueloil",
  geothermal: "geothermal",
  biomass: "biomass",
  naphta: "naphtha",
  asphaltiteCoal: "other",
  wasteheat: "other",
};

const bySource = (n: number): Record<SystemSource, Series> =>
  Object.fromEntries(SYSTEM_SOURCES.map((s) => [s, Array(n).fill(null)])) as Record<SystemSource, Series>;

export function emptySystemYear(year: number): SystemYear {
  const n = hoursInYear(year);
  return {
    format: SYSTEM_FORMAT,
    year,
    start: new Date(Date.UTC(year, 0, 1)).toISOString(),
    kgup: bySource(n),
    uevm: bySource(n),
    lep: Array(n).fill(null),
    uecm: Array(n).fill(null),
    consumption: Array(n).fill(null),
    upDelivered: Array(n).fill(null),
    downDelivered: Array(n).fill(null),
    netInstruction: Array(n).fill(null),
    rt: bySource(n),
    rtImportExport: Array(n).fill(null),
    fetched: {},
  };
}

/** "2026-09-01T05:00:00+03:00" → yıl içindeki saat sırası (duvar saati); başka yıl ya da biçim dışı ise null */
export function hourIndex(year: number, date: unknown): number | null {
  const m = typeof date === "string" ? date.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/) : null;
  if (!m || Number(m[1]) !== year) return null;
  return (Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4])) - Date.UTC(year, 0, 1)) / HOUR;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Bir ayın cevaplarını yıl belgesine yazar. Yalnız o aya düşen saatler yazılır (yük tahmini istenen günün ötesini de
 * döndürür). Ayın eski değerleri önce silinir: geç düzeltilen ya da kaybolan saat eski hâliyle kalmaz.
 */
export function writeSystemMonth(doc: SystemYear, month: number, raw: SystemMonthRaw, fetchedAt: Date): { hours: Record<string, number> } {
  const from = (Date.UTC(doc.year, month - 1, 1) - Date.UTC(doc.year, 0, 1)) / HOUR;
  const to = (Date.UTC(doc.year, month, 1) - Date.UTC(doc.year, 0, 1)) / HOUR;
  const inMonth = (i: number | null): i is number => i !== null && i >= from && i < to;
  const clear = (s: Series) => s.fill(null, from, to);
  for (const s of SYSTEM_SOURCES) {
    clear(doc.kgup[s]);
    clear(doc.uevm[s]);
    clear(doc.rt[s]);
  }
  for (const k of SYSTEM_SCALARS) clear(doc[k]);

  // "_": sayılmayan seriler (YAT ve net talimat YAL ile aynı saatlerde gelir)
  const count: Record<string, number> = { dpp: 0, uevm: 0, lep: 0, uecm: 0, consumption: 0, instructions: 0, rt: 0, _: 0 };
  const addSources = (target: Record<SystemSource, Series>, fields: Record<string, SystemSource>, item: Record<string, unknown>, i: number) => {
    for (const s of SYSTEM_SOURCES) target[s][i] = 0;
    for (const [field, s] of Object.entries(fields)) {
      const v = num(item[field]);
      if (v !== null) target[s][i] = round(target[s][i]! + v);
    }
  };
  for (const it of raw.dpp as Array<Record<string, unknown>>) {
    const i = hourIndex(doc.year, it.date);
    if (!inMonth(i)) continue;
    addSources(doc.kgup, DPP_FIELDS, it, i);
    count.dpp++;
  }
  for (const it of raw.uevm as Array<Record<string, unknown>>) {
    const i = hourIndex(doc.year, it.date);
    if (!inMonth(i)) continue;
    addSources(doc.uevm, UEVM_FIELDS, it, i);
    count.uevm++;
  }
  for (const it of raw.rt as Array<Record<string, unknown>>) {
    const i = hourIndex(doc.year, it.date);
    if (!inMonth(i)) continue;
    addSources(doc.rt, RT_FIELDS, it, i);
    count.rt++;
  }
  const scalar = (items: unknown[], field: string, target: Series, key: string, dateField = "date") => {
    for (const it of items as Array<Record<string, unknown>>) {
      const i = hourIndex(doc.year, it[dateField]);
      const v = num(it[field]);
      // Yük tahmini aynı saati iki kez verebilir: ilki tutulur
      if (!inMonth(i) || v === null || target[i] !== null) continue;
      target[i] = v;
      count[key]++;
    }
  };
  scalar(raw.lep, "lep", doc.lep, "lep");
  scalar(raw.uecm, "swv", doc.uecm, "uecm", "hour");
  scalar(raw.consumption, "consumption", doc.consumption, "consumption");
  scalar(raw.up, "upRegulationDelivered", doc.upDelivered, "instructions");
  scalar(raw.down, "downRegulationDelivered", doc.downDelivered, "_");
  scalar(raw.up, "net", doc.netInstruction, "_");
  scalar(raw.rt, "importExport", doc.rtImportExport, "_");
  delete count._;
  doc.fetched[mm(month)] = fetchedAt.toISOString();
  return { hours: count };
}

/** Eski biçimdeki belgeyi yeni biçime taşır: eksik seriler boş eklenir, bütün aylar yeniden çekilecek sayılır */
export function upgradeSystemYear(doc: SystemYear): SystemYear {
  if (doc.format === SYSTEM_FORMAT) return doc;
  const n = hoursInYear(doc.year);
  for (const k of SYSTEM_SCALARS) if (!Array.isArray(doc[k])) doc[k] = Array(n).fill(null);
  if (!doc.rt) doc.rt = bySource(n);
  doc.fetched = {};
  doc.format = SYSTEM_FORMAT;
  return doc;
}

export function systemMonthStatus(doc: SystemYear | null, month: number): MonthStatus {
  const at = doc?.fetched[mm(month)];
  if (!at) return "missing";
  return isFinalFetch(doc!.year, month, at) ? "final" : "provisional";
}

/** Türkiye saatiyle gün ("YYYY-AA-GG") */
const trDay = (ms: number) => new Date(ms + 3 * HOUR).toISOString().slice(0, 10);

/** Dünün son saatinde (23:00) gerçek zamanlı tüketim yok mu? Dün bu belgenin yılına düşmüyorsa false */
function yesterdayMissing(doc: SystemYear, now: Date): boolean {
  const i = hourIndex(doc.year, `${trDay(now.getTime() - 24 * HOUR)}T23:00:00`);
  return i !== null && doc.consumption[i] === null;
}

/**
 * Santral havuzundaki needsFetch ile aynı kural (eksik → evet, kesin → hayır, geçici → bekleme süresi dolunca). Fark: ay
 * bitmeden çekilmiş ay (içinde bulunulan ay, ya da bittikten sonra ilk kez) her Türkiye günü bir kez yenilenir, böylece günlük
 * pano dünün verisini görür (24 saatlik bekleme, saatlik işte her gün bir saat kayardı). Dünün son saati hâlâ boşsa
 * (EPİAŞ henüz yayımlamamış) en az bir saat sonra yeniden denenir.
 */
export function systemNeedsFetch(doc: SystemYear | null, month: number, now: Date): boolean {
  const status = systemMonthStatus(doc, month);
  if (status === "missing") return true;
  if (status === "final") return false;
  const at = Date.parse(doc!.fetched[mm(month)]);
  const partial = at < Date.UTC(doc!.year, month, 1) - 3 * HOUR;
  if (partial) return trDay(at) < trDay(now.getTime()) || (now.getTime() - at >= HOUR && yesterdayMissing(doc!, now));
  return now.getTime() - at >= REFRESH_DAYS_PROVISIONAL * 24 * HOUR;
}

/**
 * Ayın EPİAŞ sorgu aralığı (Türkiye saati, "+03:00"). İçinde bulunulan ayda bitiş dündür (EPİAŞ bitişin geçmişte olmasını
 * ister). Ay henüz başlamadıysa ya da dünden sonra başlıyorsa null.
 */
export function systemMonthQuery(year: number, month: number, now: Date): { startDate: string; endDate: string } | null {
  const yesterday = new Date(now.getTime() + 3 * HOUR - 24 * HOUR).toISOString().slice(0, 10);
  const first = `${year}-${mm(month)}-01`;
  if (first > yesterday) return null;
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const end = last < yesterday ? last : yesterday;
  return { startDate: `${first}T00:00:00+03:00`, endDate: `${end}T23:00:00+03:00` };
}
