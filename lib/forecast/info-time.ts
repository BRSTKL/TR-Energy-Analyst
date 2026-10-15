/**
 * TR-Energy Analyst - Bilgi zamanı: tahmin özelliklerinin ne zaman elde olduğu (PLAN 15.3)
 *
 * Kural: D günü için yapılan üretim tahmini, karar kesiminden (D-1 12:30, Türkiye; GÖP teklif kapanışı) önce elde olan
 * bilgiyle yapılır. Her özellik `availableAt` taşır; kesimden sonra elde olan bir özellik `assertAvailable` ile hata
 * verir (LeakageError). Kesim GÖP kapanışıdır, ilk KGÜP bildiriminden (DGP başlangıcı, tarihsel 16:00) erkendir:
 * şirketin ilk KGÜP'üyle kıyasta bize avantaj vermez (kötümser).
 *
 * Zaman: bütün değerler duvar saati ms'idir (Türkiye saati UTC alanlarında; havuz kuralı). Türkiye 2016-09'dan beri
 * sabit UTC+3; hava verisi arşivi 2024'ten.
 *
 * Hava verisi (PLAN 15.2–15.3, tek çalışma API'siyle teyitli, 22 gözlemin 22'si): UTC geçerlilik saati H için
 * `previous_dayN` değeri N gün önceki, H+1'i 6 saate aşağı yuvarlayan ECMWF çalışmasından gelir (ilerleme N × 24 − 1 …
 * N × 24 + 4 saat; ör. 05 UTC → 06Z). Çalışmanın yayımı başlangıçtan ≈ 7–8 saat sonra; burada kötümser 9 saat.
 * Işınım değeri damgadan önceki saatin ortalamasıdır: üretim saati i'nin ışınımı i+1 damgasıdır (weather-codec.ts).
 * `d0` (en yeni tahmin) geçerlilik saatine en yakın çalışmadır: hiçbir saat için kesimden önce değildir.
 *
 * Üretim (UEVM) gecikmesi: tahminde kullanılabilecek en yeni üretim D-2'dir (PLAN). Bir günün üretimi ertesi gün
 * 12:00'da elde sayılır: D-2 → D-1 12:00 ≤ kesim; D-1 sabahı → D 12:00 > kesim (yakalanır).
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const TR_UTC_OFFSET_MS = 3 * HOUR;
/** Karar kesimi: D-1, Türkiye saatiyle 12:30 (GÖP teklif kapanışı) */
export const DECISION_CUTOFF_MINUTES = 12 * 60 + 30;
/** ECMWF çalışmasının başlangıcından yayımına kadar varsayılan süre (kötümser) */
export const ECMWF_PUBLISH_DELAY_MS = 9 * HOUR;
/** Bir günün üretimi ertesi gün bu saatte elde sayılır (dakika, Türkiye saati) */
export const PRODUCTION_KNOWN_NEXT_DAY_MINUTES = 12 * 60;

export type WeatherLeadDays = 0 | 1 | 2;
export type FeatureSource = "weather" | "production" | "calendar";

export interface FeatureInfo {
  name: string;
  source: FeatureSource;
  /** Özelliğin elde olduğu an (duvar saati ms) */
  availableAt: number;
}

export class LeakageError extends Error {
  constructor(
    message: string,
    readonly features: FeatureInfo[]
  ) {
    super(message);
    this.name = "LeakageError";
  }
}

const startOfDay = (wall: number) => Math.floor(wall / DAY) * DAY;

/** Hedef üretim saati (duvar saati) için karar kesimi: hedef günün bir önceki günü 12:30 */
export function decisionCutoff(targetHourWall: number): number {
  return startOfDay(targetHourWall) - DAY + DECISION_CUTOFF_MINUTES * 60_000;
}

/** Üretim saati i için hava değişkeninin Open-Meteo damgası: ortalama değişkende i+1, anlıkta i */
export function weatherStampForHour(productionHourWall: number, kind: "mean" | "instant"): number {
  return productionHourWall + (kind === "mean" ? HOUR : 0);
}

/** Bu damganın `lead` gün önceki tahmininin geldiği ECMWF çalışmasının başlangıcı (duvar saati ms) */
export function weatherRunInit(stampWall: number, lead: WeatherLeadDays): number {
  const utc = stampWall - TR_UTC_OFFSET_MS;
  const init = Math.floor((utc + HOUR) / (6 * HOUR)) * 6 * HOUR - lead * DAY;
  return init + TR_UTC_OFFSET_MS;
}

/** Hava değeri ne zaman elde: çalışma başlangıcı + yayım gecikmesi */
export function weatherAvailableAt(stampWall: number, lead: WeatherLeadDays): number {
  return weatherRunInit(stampWall, lead) + ECMWF_PUBLISH_DELAY_MS;
}

/** Bir üretim saatinin değeri ne zaman elde: ertesi gün 12:00 */
export function productionAvailableAt(sourceHourWall: number): number {
  return startOfDay(sourceHourWall) + DAY + PRODUCTION_KNOWN_NEXT_DAY_MINUTES * 60_000;
}

/** Hava özelliği tanımı (üretim saatine göre) */
export function weatherFeature(name: string, productionHourWall: number, kind: "mean" | "instant", lead: WeatherLeadDays): FeatureInfo {
  return { name, source: "weather", availableAt: weatherAvailableAt(weatherStampForHour(productionHourWall, kind), lead) };
}

/** Geçmiş üretim özelliği (ör. D-2 kapasite faktörü): kaynak saat */
export function productionFeature(name: string, sourceHourWall: number): FeatureInfo {
  return { name, source: "production", availableAt: productionAvailableAt(sourceHourWall) };
}

/** Takvim özelliği (saat, ay, açık gök ışınımı): baştan bilinir */
export function calendarFeature(name: string): FeatureInfo {
  return { name, source: "calendar", availableAt: Number.NEGATIVE_INFINITY };
}

/** Kesimden sonra elde olan özellikler */
export function leakingFeatures(features: FeatureInfo[], targetHourWall: number): FeatureInfo[] {
  const cutoff = decisionCutoff(targetHourWall);
  return features.filter((f) => f.availableAt > cutoff);
}

/** Kesimden sonra elde olan özellik varsa hata */
export function assertAvailable(features: FeatureInfo[], targetHourWall: number): void {
  const leaks = leakingFeatures(features, targetHourWall);
  if (!leaks.length) return;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  throw new LeakageError(
    `Bilgi sızıntısı: ${iso(targetHourWall)} tahmini için kesim ${iso(decisionCutoff(targetHourWall))}; sonra elde olan: ${leaks
      .map((f) => `${f.name} (${iso(f.availableAt)})`)
      .join(", ")}`,
    leaks
  );
}

/** Bir hava sürümü bu hedef saat için kesimden önce mi (ortalama ve anlık değişkenlerin ikisi de) */
export function weatherLeadClean(targetHourWall: number, lead: WeatherLeadDays): boolean {
  const cutoff = decisionCutoff(targetHourWall);
  return (["mean", "instant"] as const).every((k) => weatherAvailableAt(weatherStampForHour(targetHourWall, k), lead) <= cutoff);
}
