/**
 * TR-Energy Analyst - Veri havuzu: DSİ baraj doluluğu (yagisbarajdoluluk.dsi.gov.tr, 27.10.2026)
 *
 * Site herkese açık bir JSON API kullanır (https://yagisbarajdolulukapi.dsi.gov.tr; kimlik yok, Türkiye IP'sinden erişilir):
 *   /api/DamMetrics/national/purpose-daily?from&to   amaca göre (Energy, Irrigation, DrinkingWater) ülke ortalaması: doluluk %,
 *                                                    aktif hacim (milyon m³); günlük, yalnız iş günleri, 15.05.2024'ten beri
 *   /api/DamMetrics/province/daily?from&to           İstanbul, Ankara, İzmir, Bursa: içme suyu doluluğu, hacim, günlük verilen su
 *   /api/Dashboard/latest-published-date             en son yayımlanan gün
 * Baraj bazında veri yok (yönetici sitesinde kalıyor). Tek belge: `data/pool/dsi/dam-occupancy.json.gz`; günler tarihe göre
 * üzerine yazılır (DSİ son günleri düzeltebilir). SAF: I/O yok (dosya işleri dsi-dam-store.ts).
 */

export const DSI_FORMAT = 1;
export const DSI_PURPOSES = ["Energy", "Irrigation", "DrinkingWater"] as const;
export type DsiPurpose = (typeof DSI_PURPOSES)[number];

export interface DsiNationalDay {
  /** Ülke ortalaması doluluk (%) */
  occupancyPct: number;
  /** Aktif su hacmi (milyon m³) */
  activeVolumeMm3: number;
}

export interface DsiProvinceDay {
  occupancyPct: number;
  activeVolumeMm3: number;
  /** Günlük verilen içme suyu (milyon m³/gün) */
  suppliedMm3PerDay: number | null;
  /** Mevcut hacimle içme suyunun yeteceği gün aralığı ("278-436") */
  supplyDays: string | null;
}

export interface DsiDamDoc {
  format: number;
  /** DSİ'nin bildirdiği en son yayım günü ve bizim son başarılı çekimimiz (UTC ISO) */
  publishedDate: string | null;
  fetchedAt: string | null;
  national: Record<DsiPurpose, Record<string, DsiNationalDay>>;
  provinces: Record<string, { name: string; days: Record<string, DsiProvinceDay> }>;
}

export const emptyDsiDoc = (): DsiDamDoc => ({
  format: DSI_FORMAT,
  publishedDate: null,
  fetchedAt: null,
  national: { Energy: {}, Irrigation: {}, DrinkingWater: {} },
  provinces: {},
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export interface NationalRow extends DsiNationalDay {
  purpose: DsiPurpose;
  date: string;
}
export interface ProvinceRow extends DsiProvinceDay {
  plate: string;
  name: string;
  date: string;
}

/** Yanıt dizi değilse hata (API biçimi değişti); geçersiz satırlar atlanır ve sayılır */
export function parseNational(items: unknown): { rows: NationalRow[]; skipped: number } {
  if (!Array.isArray(items)) throw new Error("Beklenmeyen yanıt: ülke serisi dizi değil");
  const rows: NationalRow[] = [];
  let skipped = 0;
  for (const it of items as Array<Record<string, unknown>>) {
    const occ = num(it?.averageOccupancyRatePercent);
    const vol = num(it?.activeVolumeMillionM3);
    const purpose = DSI_PURPOSES.find((p) => p === it?.damPurpose);
    const date =
      typeof it?.observationDate === "string" ? it.observationDate.slice(0, 10) : "";
    if (
      !purpose ||
      !DATE.test(date) ||
      occ === null ||
      vol === null ||
      occ < 0 ||
      occ > 100 ||
      vol < 0
    ) {
      skipped++;
      continue;
    }
    rows.push({ purpose, date, occupancyPct: occ, activeVolumeMm3: vol });
  }
  return { rows, skipped };
}

export function parseProvince(items: unknown): { rows: ProvinceRow[]; skipped: number } {
  if (!Array.isArray(items)) throw new Error("Beklenmeyen yanıt: il serisi dizi değil");
  const rows: ProvinceRow[] = [];
  let skipped = 0;
  for (const it of items as Array<Record<string, unknown>>) {
    const occ = num(it?.occupancyRatePercent);
    const vol = num(it?.activeVolumeMillionM3);
    const plate = num(it?.provincePlateCode);
    const date =
      typeof it?.observationDate === "string" ? it.observationDate.slice(0, 10) : "";
    if (
      plate === null ||
      !DATE.test(date) ||
      occ === null ||
      vol === null ||
      occ < 0 ||
      occ > 100 ||
      vol < 0
    ) {
      skipped++;
      continue;
    }
    rows.push({
      plate: String(plate),
      name: typeof it.provinceName === "string" ? it.provinceName : String(plate),
      date,
      occupancyPct: occ,
      activeVolumeMm3: vol,
      suppliedMm3PerDay: num(it.suppliedWaterMillionM3PerDay),
      supplyDays:
        typeof it.drinkingWaterSupplyDaysRange === "string"
          ? it.drinkingWaterSupplyDaysRange
          : null,
    });
  }
  return { rows, skipped };
}

export interface DsiMergeResult {
  added: number;
  changed: number;
}

/** Satırları tarihe göre belgeye işler (yerinde); aynı gün farklı değerle gelirse güncellenir ve sayılır */
export function mergeDsi(
  doc: DsiDamDoc,
  national: NationalRow[],
  provinces: ProvinceRow[]
): DsiMergeResult {
  let added = 0;
  let changed = 0;
  const put = <T extends object>(target: Record<string, T>, key: string, value: T) => {
    const old = target[key];
    if (!old) added++;
    else if (JSON.stringify(old) !== JSON.stringify(value)) changed++;
    target[key] = value;
  };
  for (const r of national)
    put(doc.national[r.purpose], r.date, {
      occupancyPct: r.occupancyPct,
      activeVolumeMm3: r.activeVolumeMm3,
    });
  for (const r of provinces) {
    const p = (doc.provinces[r.plate] ??= { name: r.name, days: {} });
    p.name = r.name;
    put(p.days, r.date, {
      occupancyPct: r.occupancyPct,
      activeVolumeMm3: r.activeVolumeMm3,
      suppliedMm3PerDay: r.suppliedMm3PerDay,
      supplyDays: r.supplyDays,
    });
  }
  return { added, changed };
}

/** Amaç için belgedeki en son gün (YYYY-AA-GG) ya da null */
export function latestNationalDate(
  doc: DsiDamDoc,
  purpose: DsiPurpose = "Energy"
): string | null {
  const days = Object.keys(doc.national[purpose]);
  return days.length ? days.sort().at(-1)! : null;
}
