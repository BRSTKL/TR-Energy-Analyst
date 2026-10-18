/**
 * TR-Energy Analyst - Geçici üretim: EPİAŞ gerçek zamanlı üretimi (GZÜ) (kullanıcı 18.10.2026: "geçici üretim olarak ayrı
 * sakla, UEVM gelince kesinleşsin; eğitim ve karne bunu kullansın")
 *
 * UEVM (uzlaştırmaya esas üretim) aylık uzlaştırmadan sonra yayımlanır (Eylül'ünki 17 Ekim'de); GZÜ her gün, iki gün
 * gecikmeyle gelir (18.10.2026 ölçüm: gece 23:10'da 16 Ekim 23:00'e kadar açık; EPİAŞ: "en son bir gün öncesine ait").
 * Eylül 2026'da 8 proje güneş santralinde aylık toplam farkı %0,5 içinde, saatlik ortalama mutlak fark ≤ 0,6 MWh.
 * GZÜ havuzdaki UEVM'ye karışmaz: ayrı dosyada (`data/pool/<id>/rt-<yıl>.json.gz`) tutulur; okurken bir saatin UEVM'si
 * varsa o, yoksa GZÜ kullanılır (`mergeProduction`). UEVM gelince değer kendiliğinden kesinleşir.
 * SAF: I/O yok (dosya lib/pool/pool-store.ts, çekim lib/services/realtime-generation.ts).
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface ProvisionalYear {
  epiasPlantId: number;
  year: number;
  /** Yılın ilk saati (duvar saati, ISO; havuzla aynı kural) */
  start: string;
  /** Saat başına MWh (yılın saat sayısı kadar); çekilmemiş saat null */
  values: Array<number | null>;
  /** Çekilen son tam gün (YYYY-MM-DD) */
  fetchedThrough: string | null;
  /** EPİAŞ gerçek zamanlı listesindeki santral kimliği ve EIC (UEVM listesindekinden farklı kimlik) */
  rtPlantId: number;
  eic: string;
  fetchedAt: string;
}

export function emptyProvisionalYear(epiasPlantId: number, year: number, rtPlantId: number, eic: string): ProvisionalYear {
  const start = Date.UTC(year, 0, 1);
  const n = (Date.UTC(year + 1, 0, 1) - start) / HOUR;
  return { epiasPlantId, year, start: new Date(start).toISOString(), values: Array(n).fill(null), fetchedThrough: null, rtPlantId, eic, fetchedAt: new Date(0).toISOString() };
}

/**
 * Çekilen saatleri belgeye yazar (yıl dışındakiler atlanır). `fetchedThrough` yalnız EPİAŞ'ın değer döndürdüğü son güne
 * kadar ilerler (`through`'u geçmez): bir gün hiç gelmediyse (henüz yayımlanmamış) sonraki çekimde yeniden istenir
 * (sızıntı denetimi 18.10.2026: iki santralde 16 Ekim boş kalmıştı). Ölçüt "en az bir saat", "24 saat" değil: bazı
 * santrallerde EPİAŞ gece saatlerini hiç döndürmüyor (Serra GES her gün 5–6 saat).
 */
export function mergeProvisional(doc: ProvisionalYear, values: Map<number, number>, through: string, fetchedAt: string): ProvisionalYear {
  const s0 = Date.parse(doc.start);
  const out = { ...doc, values: [...doc.values], fetchedAt };
  for (const [t, v] of values) {
    const i = Math.round((t - s0) / HOUR);
    if (i >= 0 && i < out.values.length) out.values[i] = v;
  }
  // Son çekilmiş gün: through'dan (yıl içinde) geriye, değeri olan ilk gün
  const lastDay = Math.min(Date.parse(`${through}T00:00:00Z`), Date.UTC(doc.year, 11, 31));
  let complete: string | null = null;
  for (let d = lastDay; d >= s0; d -= DAY) {
    const i = (d - s0) / HOUR;
    if (out.values.slice(i, i + 24).some((v) => v !== null)) {
      complete = new Date(d).toISOString().slice(0, 10);
      break;
    }
    if (out.fetchedThrough && new Date(d).toISOString().slice(0, 10) <= out.fetchedThrough) break;
  }
  if (complete && (!out.fetchedThrough || complete > out.fetchedThrough)) out.fetchedThrough = complete;
  return out;
}

export type ProductionSource = "UEVM" | "GZÜ";

/** Saat → üretim: UEVM varsa o (kesin), yoksa GZÜ (geçici) */
export function mergeProduction(uevm: Map<number, number | null>, provisional: Map<number, number | null>): Map<number, { mwh: number; source: ProductionSource }> {
  const out = new Map<number, { mwh: number; source: ProductionSource }>();
  for (const [t, v] of provisional) if (v !== null) out.set(t, { mwh: v, source: "GZÜ" });
  for (const [t, v] of uevm) if (v !== null) out.set(t, { mwh: v, source: "UEVM" });
  return out;
}

/**
 * Çekilecek gün aralığı: UEVM'nin bittiği ya da GZÜ'nün en son tam çekildiği günden sonrası, EPİAŞ'ın izin verdiği son
 * güne (bugün − 2, Türkiye) kadar; en çok `maxDays` geriye. Çekilecek gün yoksa null. Günler YYYY-MM-DD. Eksik günler
 * `fetchedThrough` ilerlemediği için kendiliğinden yeniden istenir.
 */
export function provisionalRange(opts: { today: string; lastUevmDay: string | null; fetchedThrough: string | null; maxDays?: number }): { from: string; to: string } | null {
  const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const to = day(opts.today) - 2 * DAY;
  const after = [opts.lastUevmDay, opts.fetchedThrough].filter((x): x is string => !!x).map((x) => day(x) + DAY);
  const floor = day(opts.today) - (opts.maxDays ?? 120) * DAY;
  const from = Math.max(floor, ...after);
  return from > to ? null : { from: iso(from), to: iso(to) };
}
