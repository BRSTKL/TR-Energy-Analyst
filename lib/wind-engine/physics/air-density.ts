/**
 * TR-Energy Analyst - Rüzgâr fiziği: hava yoğunluğu ve rüzgâr kesmesi (Aşama 23.2–23.3)
 *
 * - Hava yoğunluğu: ideal gaz, ρ = p / (R_d × T) (kuru hava, R_d = 287,05 J/(kg·K)); nem etkisi < %1, yok sayılır.
 *   Yüzey basıncı yoksa deniz seviyesi basıncı rakıma barometrik formülle indirilir.
 * - Yoğunluk düzeltmesi (IEC 61400-12-1, eşdeğer hız): v_eq = v × (ρ / ρ₀)^(1/3), ρ₀ = 1,225 kg/m³. Güç eğrisi eşdeğer hızla
 *   kurulup kullanılırsa kış (yoğun) ve yaz (seyrek) havası aynı eğriye düşer: güç ∝ ρ v³. Kanat açısı denetimli (pitch)
 *   türbinler için; eski stall türbinlerde standart hız yerine gücü normalize eder. Göbekteki yerine 2 m sıcaklık ve yüzey
 *   basıncı kullanılır (≈ %1 sabit fark); her ay yeniden kurulan medyan eğri bu sabit farkı soğurur.
 * - Rüzgâr kesmesi (üs yasası): v(h) = v(h_ref) × (h / h_ref)^α; α = ln(v₂ / v₁) / ln(h₂ / h₁). Gece kararlı katmanda α büyür
 *   (≈ 0,3–0,5), gündüz karışımlı katmanda küçülür (≈ 0,1).
 *
 * Girdiler hava modelinin kesimden önce elde olan sürümünden gelir (bilgi zamanını çağıran sağlar). SAF: I/O yok.
 */

export const R_DRY = 287.05;
export const RHO_STANDARD = 1.225;
const G = 9.80665;
const KELVIN = 273.15;
/** Standart atmosfer sıcaklık düşüş oranı (K/m) */
const LAPSE = 0.0065;

/** Hava yoğunluğu (kg/m³): sıcaklık (°C) ve basınç (hPa); geçersiz girdide null */
export function airDensity(tempC: number | null, pressureHpa: number | null): number | null {
  if (tempC === null || pressureHpa === null || !Number.isFinite(tempC) || !Number.isFinite(pressureHpa) || pressureHpa <= 0) return null;
  const T = tempC + KELVIN;
  if (T <= 0) return null;
  return (pressureHpa * 100) / (R_DRY * T);
}

/** Deniz seviyesi basıncından rakımdaki basınç (hPa); sıcaklık rakımdaki 2 m sıcaklığı (°C) */
export function stationPressure(mslHpa: number, elevationM: number, tempC: number): number {
  const T = tempC + KELVIN + LAPSE * elevationM; // deniz seviyesine indirgenmiş sıcaklık
  return mslHpa * Math.pow(1 - (LAPSE * elevationM) / T, G / (R_DRY * LAPSE));
}

/** Yoğunluğa göre eşdeğer hız (m/s); yoğunluk yoksa hız değişmez */
export function densityAdjustedSpeed(ws: number, rho: number | null, rho0 = RHO_STANDARD): number {
  if (rho === null || rho <= 0) return ws;
  return ws * Math.cbrt(rho / rho0);
}

/** Kesme üssü α iki yükseklikteki hızdan; hızlardan biri ≤ 0,5 m/s ise null (oran anlamsız) */
export function shearExponent(wsLow: number | null, hLow: number, wsHigh: number | null, hHigh: number): number | null {
  if (wsLow === null || wsHigh === null || wsLow <= 0.5 || wsHigh <= 0.5 || hHigh <= hLow) return null;
  return Math.log(wsHigh / wsLow) / Math.log(hHigh / hLow);
}

/** Üs yasasıyla başka yüksekliğe taşınan hız */
export function extrapolateSpeed(ws: number, fromM: number, toM: number, alpha: number): number {
  return ws * Math.pow(toM / fromM, alpha);
}
