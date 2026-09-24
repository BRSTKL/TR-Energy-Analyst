/**
 * TR-Energy Analyst - EPİAŞ santral verisinden analiz verisi üretme (saf fonksiyonlar)
 *
 * Kullanıcı santral adını yazar; uygulama EPİAŞ Şeffaflık Platformu'ndan:
 *   - KGÜP (Kesinleşmiş Gün Öncesi Üretim Programı) → "gün öncesi tahmin" yerine
 *   - UEVM (Uzlaştırmaya Esas Veriş Miktarı)        → "gerçekleşen üretim"
 * çeker. Bu modül servis cevaplarını saatlik seriye çevirir, birleştirir, santral türünü bulur ve
 * kullanıcıya gösterilecek kontrolleri (kapsam, tutarlılık) üretir. I/O yoktur.
 *
 * Alan adları EPİAŞ Şeffaflık 2.0 servis belgesindeki KgupDataDto / InjectionQuantityDto tanımlarından alınmıştır.
 * Beklenmeyen bir cevap biçimi sessizce sıfır üretmez: tanınan değer bulunamazsa satır atlanır ve sayılır.
 */

import type { ParsedGenerationRow } from "@/lib/parsers/generation-parser";

/**
 * EPİAŞ tarihini ("2025-01-01T13:00:00+03:00") Türkiye duvar saatine çevirir (UTC alanlarında taşınır).
 * epias-service'teki epiasDateToWallClock ile aynı kural; bu modül tarayıcıda da kullanıldığı için
 * sunucu modülünü içe aktarmaz.
 */
function epiasDateToWallClock(dateStr: string): Date {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const [, y, m, d, h, min] = match.map(Number);
    return new Date(Date.UTC(y, m - 1, d, h, min));
  }
  return new Date(new Date(dateStr).getTime() + 3 * 3600 * 1000);
}

export interface EpiasPowerPlant {
  id: number;
  name: string;
  eic?: string | null;
  shortName?: string | null;
}

/** KGÜP kaynak alanları (KgupDataDto) */
const KGUP_FUELS = [
  "akarsu", "barajli", "biokutle", "diger", "dogalgaz", "fuelOil", "gunes", "ithalKomur",
  "jeotermal", "linyit", "nafta", "ruzgar", "tasKomur",
] as const;

/** UEVM kaynak alanları (InjectionQuantityDto); uluslararası ithalat/ihracat üretim değildir */
const UEVM_FUELS = [
  "asphaltite", "biomass", "dam", "fueloil", "geothermal", "importedCoal", "lignite", "lng",
  "naphtha", "naturalGas", "other", "river", "stoneCoal", "sun", "wind",
] as const;

export type PlantTechnology = "RES" | "HES" | "GES";

const HOUR = 3_600_000;

// ------------------------------------------------------------------------------------------------
// Arama
// ------------------------------------------------------------------------------------------------

/** Türkçe karakterleri sadeleştirip küçük harfe çevirir: "Bahçe RES-2" → "bahce res 2" */
export function normalizePlantName(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Santral listesinde arama. Sorgunun tüm kelimeleri adda (veya kısa adda) geçmelidir.
 * Sıralama: tam eşleşme → baştan eşleşme → diğerleri; eşitlikte kısa ad önce.
 */
export function searchPowerPlants(plants: EpiasPowerPlant[], query: string, limit = 20): EpiasPowerPlant[] {
  const q = normalizePlantName(query);
  if (q.length < 2) return [];
  const words = q.split(" ");
  const scored = plants
    .map((p) => {
      const name = normalizePlantName(`${p.name} ${p.shortName ?? ""}`);
      if (!words.every((w) => name.includes(w))) return null;
      const main = normalizePlantName(p.name);
      const score = main === q ? 0 : main.startsWith(q) ? 1 : 2;
      return { p, score, len: main.length };
    })
    .filter((x): x is { p: EpiasPowerPlant; score: number; len: number } => x !== null)
    .sort((a, b) => a.score - b.score || a.len - b.len);
  return scored.slice(0, limit).map((x) => x.p);
}

// ------------------------------------------------------------------------------------------------
// Servis cevaplarını saatlik seriye çevirme
// ------------------------------------------------------------------------------------------------

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** "2025-01-01T00:00:00+03:00" + saat (0-23 veya "13:00") → duvar saati zaman damgası */
function toWallClock(date: unknown, hour?: unknown): number | null {
  if (typeof date !== "string") return null;
  const base = epiasDateToWallClock(date);
  if (Number.isNaN(base.getTime())) return null;
  const day = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  let h: number | null = null;
  if (typeof hour === "number") h = hour;
  else if (typeof hour === "string" && /^\d{1,2}/.test(hour)) h = Number(hour.slice(0, 2).replace(":", ""));
  if (h === null) return base.getTime(); // saat tarihin içindeyse
  if (h < 0 || h > 23) return null;
  return day + h * HOUR;
}

function sumFields(item: Record<string, unknown>, fields: readonly string[]): number | null {
  let total = 0;
  let any = false;
  for (const f of fields) {
    const v = num(item[f]);
    if (v !== null) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

export interface HourlySeries {
  values: Map<number, number>;
  /** Kaynak bazında toplam MWh (santral türünü bulmak için) */
  byFuel: Record<string, number>;
  /** Tarihi veya değeri okunamayan kayıt sayısı */
  skipped: number;
}

/** KGÜP (dpp) kayıtları → saatlik seri. Değer: `toplam`, yoksa kaynak alanlarının toplamı. */
export function parseKgupItems(items: Array<Record<string, unknown>>): HourlySeries {
  const values = new Map<number, number>();
  const byFuel: Record<string, number> = {};
  let skipped = 0;
  for (const it of items) {
    const t = toWallClock(it.date, it.time);
    const v = num(it.toplam) ?? sumFields(it, KGUP_FUELS);
    if (t === null || v === null) {
      skipped++;
      continue;
    }
    values.set(t, (values.get(t) ?? 0) + v);
    for (const f of KGUP_FUELS) byFuel[f] = (byFuel[f] ?? 0) + (num(it[f]) ?? 0);
  }
  return { values, byFuel, skipped };
}

/** UEVM (injection-quantity) kayıtları → saatlik seri. Değer: `total`, yoksa üretim kaynaklarının toplamı. */
export function parseUevmItems(items: Array<Record<string, unknown>>): HourlySeries {
  const values = new Map<number, number>();
  const byFuel: Record<string, number> = {};
  let skipped = 0;
  for (const it of items) {
    const t = toWallClock(it.date, it.hour);
    const v = num(it.total) ?? sumFields(it, UEVM_FUELS);
    if (t === null || v === null) {
      skipped++;
      continue;
    }
    values.set(t, v);
    for (const f of UEVM_FUELS) byFuel[f] = (byFuel[f] ?? 0) + (num(it[f]) ?? 0);
  }
  return { values, byFuel, skipped };
}

/** Birden fazla UEVÇB'nin KGÜP serilerini saat saat toplar (santral birden fazla birimle bildiriliyorsa) */
export function sumSeries(series: HourlySeries[]): HourlySeries {
  const values = new Map<number, number>();
  const byFuel: Record<string, number> = {};
  let skipped = 0;
  for (const s of series) {
    for (const [t, v] of s.values) values.set(t, (values.get(t) ?? 0) + v);
    for (const [f, v] of Object.entries(s.byFuel)) byFuel[f] = (byFuel[f] ?? 0) + v;
    skipped += s.skipped;
  }
  return { values, byFuel, skipped };
}

// ------------------------------------------------------------------------------------------------
// Santral türü ve kurulu güç
// ------------------------------------------------------------------------------------------------

/**
 * UEVM kaynak dağılımından santral türü: rüzgâr → RES, güneş → GES, barajlı + akarsu → HES.
 * Baskın kaynağın payı %80'in altındaysa veya desteklenmeyen bir kaynaksa null (kullanıcı seçer).
 */
export function detectTechnology(byFuel: Record<string, number>): { type: PlantTechnology | null; dominant: string | null; share: number } {
  const groups: Record<string, number> = {
    RES: byFuel.wind ?? byFuel.ruzgar ?? 0,
    GES: byFuel.sun ?? byFuel.gunes ?? 0,
    HES: (byFuel.dam ?? byFuel.barajli ?? 0) + (byFuel.river ?? byFuel.akarsu ?? 0),
  };
  const total = Object.values(byFuel).reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return { type: null, dominant: null, share: 0 };
  const [best, value] = Object.entries(groups).sort((a, b) => b[1] - a[1])[0];
  const share = value / total;
  return { type: share >= 0.8 ? (best as PlantTechnology) : null, dominant: best, share };
}

/** Kurulu güç önerisi: gerçekleşen en yüksek saatlik üretimin yukarı yuvarlanmışı (MW) */
export function suggestCapacityMw(actual: Iterable<number>): number {
  let max = 0;
  for (const v of actual) if (v > max) max = v;
  return max > 0 ? Math.ceil(max) : 0;
}

// ------------------------------------------------------------------------------------------------
// Birleştirme ve kontroller
// ------------------------------------------------------------------------------------------------

export interface MonthCoverage {
  month: string;
  hours: number;
  kgupHours: number;
  uevmHours: number;
  bothHours: number;
}

export interface PlantSeriesCheck {
  level: "error" | "warning" | "ok";
  message: string;
}

export interface MergedPlantSeries {
  rows: ParsedGenerationRow[];
  coverage: MonthCoverage[];
  kgupTotalMwh: number;
  uevmTotalMwh: number;
  /** Ortak saatlerde saatlik plan ile gerçekleşenin korelasyonu */
  correlation: number | null;
  checks: PlantSeriesCheck[];
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 3) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const monthLabel = (m: string) => `${MONTHS_TR[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/**
 * KGÜP ve UEVM serilerini [start, end] (duvar saati, gün dahil) aralığında saat saat birleştirir.
 * Yalnızca iki değerin de bulunduğu saatler satır olur. Kapsam ve tutarlılık kontrolleri üretir.
 */
export function mergePlantSeries(kgup: HourlySeries, uevm: HourlySeries, startDay: string, endDay: string): MergedPlantSeries {
  const start = Date.parse(`${startDay}T00:00:00Z`);
  const end = Date.parse(`${endDay}T23:00:00Z`);
  const rows: ParsedGenerationRow[] = [];
  const months = new Map<string, MonthCoverage>();
  const xs: number[] = [];
  const ys: number[] = [];
  let kTotal = 0;
  let uTotal = 0;

  for (let t = start; t <= end; t += HOUR) {
    const month = new Date(t).toISOString().slice(0, 7);
    const c = months.get(month) ?? { month, hours: 0, kgupHours: 0, uevmHours: 0, bothHours: 0 };
    c.hours++;
    const k = kgup.values.get(t);
    const u = uevm.values.get(t);
    if (k !== undefined) c.kgupHours++;
    if (u !== undefined) c.uevmHours++;
    if (k !== undefined && u !== undefined) {
      c.bothHours++;
      rows.push({ timestamp: new Date(t), forecastMwh: k, actualMwh: u, imbalanceMwh: u - k });
      xs.push(k);
      ys.push(u);
      kTotal += k;
      uTotal += u;
    }
    months.set(month, c);
  }

  const coverage = Array.from(months.values());
  const correlation = pearson(xs, ys);
  const checks: PlantSeriesCheck[] = [];
  const totalHours = coverage.reduce((s, c) => s + c.hours, 0);

  if (rows.length === 0) {
    checks.push({ level: "error", message: "Seçilen aralıkta KGÜP ve UEVM'nin birlikte bulunduğu saat yok." });
  } else {
    const missingK = coverage.filter((c) => c.kgupHours < c.hours * 0.95).map((c) => monthLabel(c.month));
    const missingU = coverage.filter((c) => c.uevmHours < c.hours * 0.95).map((c) => monthLabel(c.month));
    if (missingK.length) checks.push({ level: "warning", message: `KGÜP eksik aylar: ${missingK.join(", ")}.` });
    if (missingU.length) checks.push({ level: "warning", message: `UEVM eksik aylar: ${missingU.join(", ")}.` });
    const ratio = kTotal > 0 ? uTotal / kTotal : 0;
    if (ratio < 0.75 || ratio > 1.33) {
      checks.push({
        level: "warning",
        message: `Gerçekleşen toplam, planın %${Math.round(ratio * 100)} kadarı. KGÜP ile UEVM aynı santrale ait olmayabilir.`,
      });
    }
    if (correlation !== null && correlation < 0.5) {
      checks.push({
        level: "warning",
        message: `Saatlik plan ile gerçekleşen zayıf ilişkili (korelasyon ${correlation.toFixed(2)}). Farklı birimler eşleşmiş olabilir.`,
      });
    }
    if (checks.length === 0) {
      checks.push({
        level: "ok",
        message: `${rows.length.toLocaleString("tr-TR")} / ${totalHours.toLocaleString("tr-TR")} saat eşleşti; plan ile gerçekleşen tutarlı (toplam farkı %${Math.abs(Math.round((ratio - 1) * 1000) / 10)}${correlation !== null ? `, korelasyon ${correlation.toFixed(2)}` : ""}).`,
      });
    }
  }

  return { rows, coverage, kgupTotalMwh: kTotal, uevmTotalMwh: uTotal, correlation, checks };
}

// ------------------------------------------------------------------------------------------------
// API üzerinden taşıma
// ------------------------------------------------------------------------------------------------

export interface SerializedSeries {
  /** [zaman damgası (ms, duvar saati), değer] */
  points: Array<[number, number]>;
  byFuel: Record<string, number>;
  skipped: number;
}

export const serializeSeries = (s: HourlySeries): SerializedSeries => ({
  points: Array.from(s.values.entries()),
  byFuel: s.byFuel,
  skipped: s.skipped,
});

export const deserializeSeries = (s: SerializedSeries): HourlySeries => ({
  values: new Map(s.points),
  byFuel: s.byFuel,
  skipped: s.skipped,
});
