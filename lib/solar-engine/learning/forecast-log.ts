/**
 * TR-Energy Analyst - Günlük tahmin kaydı (PLAN 21.1; kullanıcı 18.10.2026: "başlayalım")
 *
 * Tahmin motorunun temeli: her gün, D günü için yapılan saatlik tahmin GÖP kesiminden (D-1 12:30, Türkiye) önce bir kez
 * yazılır ve bir daha değişmez. Geriye dönük testten güçlü kanıttır: "o gün bunu tahmin ettik". Karne (21.4) yalnız
 * kesimden önce yazılmış (`onTime`) kayıtları sayar; kesimden sonra yazılan kayıt saklanır ama işaretlidir.
 * Kayıt model sürümünü, eğitim penceresini ve hava girdisinin ne zaman alındığını taşır (sürüm yarışı, 21.5).
 * SAF: I/O yok (dosya lib/solar-engine/learning/forecast-log-store.ts).
 */

import { decisionCutoff, TR_UTC_OFFSET_MS } from "../../forecast/info-time";

/** Kayıt biçimi sürümü (alan eklenirse artar; eski kayıtlar olduğu gibi okunur) */
export const FORECAST_LOG_SCHEMA = 1;

/**
 * Güneş modelinin kayıt adı: donmuş sürüm 3, kalıcılıksız (lib/solar-engine/forecast.ts); "-gzu": eğitim geçici üretimle
 * (EPİAŞ gerçek zamanlı üretimi) son tam güne kadar (18.10.2026)
 */
export const SOLAR_MODEL_ID = "solar-v3-nolag-gzu";

export interface ForecastLogPlant {
  epiasPlantId: number;
  name: string;
  status: "ok" | "no-data" | "error";
  message?: string;
  warning?: string;
  /** D günü 00:00'dan 24 saat, MWh */
  hours?: Array<number | null>;
  train?: { from: string; to: string; hours: number; mount: string; maxMwh: number; provisionalHours?: number; provisionalThrough?: string };
  weatherFetchedAt?: string;
  location?: { latitude: number; longitude: number; locationSource: string };
  /** Bu santralin canlı (şampiyon) sürümü; yoksa kaydın `model.id`'si (kendi kendine öğrenme, lib/solar-engine/learning/self-learning.ts) */
  modelId?: string;
  /** Günlük hata düzeltmesi uygulandıysa saat başı çarpanlar ve kaynağı */
  bias?: { factors: number[]; source: "kayıtlı tahmin" | "eğitimin son günleri"; days: number };
  /** Üç hava modelli birleşimde saat başı modellerin ayrışması (en yüksek − en düşük tahmin, MWh; Aşama 22.3) */
  modelSpread?: Array<number | null>;
}

/** Gölge sürüm: canlı olmayan adayın aynı gün, aynı kurallarla yaptığı tahmin (karne hepsini ölçer) */
export interface ForecastLogShadow {
  modelId: string;
  plants: Array<Pick<ForecastLogPlant, "epiasPlantId" | "status" | "message" | "hours" | "train" | "bias" | "modelSpread">>;
}

export interface ForecastLog {
  schema: number;
  tech: "GES";
  /** Tahmin edilen gün (YYYY-MM-DD, Türkiye) */
  targetDate: string;
  /** Kaydın yazıldığı an (ISO, UTC) */
  issuedAt: string;
  /** GÖP kesimi (ISO, UTC): D-1 12:30 Türkiye */
  cutoff: string;
  /** issuedAt kesimden önce mi (karne yalnız bunları sayar) */
  onTime: boolean;
  model: { id: string; trainingMonths: number };
  /** runInit: tahminlerden önce okunan son çalışma; runInitAfter: sonra okunan, farklıysa (arada yeni çalışma çıktı) */
  weather: {
    source: string;
    model: string;
    runInit: string | null;
    runInitAfter?: string | null;
    /** Ek hava modelleri (birleşim sürümleri; 20.10.2026'dan): tahminlerden önce okunan son çalışma ve yayım anı (ISO) */
    extra?: Array<{ model: string; runInit: string | null; availableAt: string | null }>;
  };
  /** Kodun sürümü (git commit), biliniyorsa */
  code: string | null;
  plants: ForecastLogPlant[];
  /** Gölge sürümler (19.10.2026'dan) */
  shadow?: ForecastLogShadow[];
}

/** D gününün başı, Türkiye duvar saati ms (havuz kuralı: Türkiye saati UTC alanlarında) */
export const targetDayWall = (targetDate: string) => Date.parse(`${targetDate}T00:00:00Z`);

/** D günü (YYYY-MM-DD) için GÖP kesimi, gerçek an (UTC ms): D-1 12:30 Türkiye */
export function forecastCutoff(targetDate: string): number {
  return decisionCutoff(targetDayWall(targetDate)) - TR_UTC_OFFSET_MS;
}

/** Şu andan sonraki ilk tahmin edilecek gün: Türkiye saatiyle yarın (YYYY-MM-DD) */
export function nextTargetDate(now: number): string {
  const wall = new Date(now + TR_UTC_OFFSET_MS);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1)).toISOString().slice(0, 10);
}

export function isOnTime(issuedAt: number, targetDate: string): boolean {
  return issuedAt < forecastCutoff(targetDate);
}
