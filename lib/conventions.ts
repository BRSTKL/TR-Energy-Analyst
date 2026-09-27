/**
 * TR-Energy Analyst - Ortak işaret kuralları
 *
 * Tüm sayfalar ve rapor aynı kuralı kullanır:
 *   Plan fazlası = (Σ plan − Σ gerçekleşen) / Σ gerçekleşen
 *   + : plan gerçekleşenden fazla (santral planından eksik üretti)
 *   − : plan gerçekleşenden az (santral planından fazla üretti)
 * Rapordaki "Santral bazında sistematik sapma" ve planlama sayfasındaki "tahmin yanlılığı" bu tanımdır.
 */

/** Plan fazlası oranı (0,03 = %3); gerçekleşen yoksa 0 */
export function planExcessRatio(forecastMwh: number, actualMwh: number): number {
  return actualMwh > 0 ? (forecastMwh - actualMwh) / actualMwh : 0;
}

/**
 * (gerçekleşen − tahmin) / tahmin biçimindeki bir orandan plan fazlası. Eski analiz modülleri hatayı bu yönde
 * hesaplar; ekranda gösterirken bu dönüşümle tek kurala çevrilir.
 */
export function planExcessFromActualVsForecast(ratio: number): number {
  return ratio <= -1 ? 0 : -ratio / (1 + ratio);
}

/** Ekranda plan fazlasının kısa açıklaması */
export const PLAN_EXCESS_HINT = "Plan fazlası + ise plan gerçekleşenden fazla (santral eksik üretti), − ise az (santral fazla üretti).";
