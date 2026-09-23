/**
 * TR-Energy Analyst - Fiyattan Bağımsız Tahmin Doğruluğu Analizi
 *
 * Yalnızca gün öncesi tahmin (KGÖP) ve gerçekleşen üretimi (MWh) kullanır; piyasa fiyatı gerektirmez.
 * Bu yüzden EPİAŞ fiyatları eksik veya doğrulanmamış olsa bile sonuçları güvenilirdir.
 *
 * Hata işareti: hata = gerçekleşen − tahmin. Pozitif hata = eksik tahmin (santral fazla üretmiş).
 *
 * - Bias oranı: Σ hata / Σ tahmin
 * - WAPE: Σ |hata| / Σ gerçekleşen (ağırlıklı mutlak yüzde hata)
 * - Sistematik hata payı: |Σ hata| / Σ |hata|. 1'e yakınsa hatanın tamamı tek yönlüdür; 0'a yakınsa
 *   hatalar rastgeledir ve model iyileştirmesi gerekir.
 * - Ölçekleme sonrası WAPE: tahmin Σ gerçekleşen / Σ tahmin oranıyla çarpılsaydı WAPE ne olurdu.
 *   Sistematik pay yüksek olsa da ölçekleme mutlak hatayı aynı oranda azaltmaz; gerçek etkiyi bu metrik verir.
 *   Oran aynı dönemin verisinden hesaplandığı için (in-sample) iyimser bir üst sınırdır.
 */

export interface AccuracyInputRecord {
  timestamp: Date;
  forecastMwh: number;
  actualMwh: number;
}

export interface AccuracyStats {
  hours: number;
  totalForecastMwh: number;
  totalActualMwh: number;
  netErrorMwh: number;
  absErrorMwh: number;
  biasRatio: number;
  wape: number;
  maeMwh: number;
  systematicShare: number;
  /** Tahmin tek bir katsayıyla (Σ gerçekleşen / Σ tahmin) ölçeklenseydi oluşacak WAPE */
  wapeAfterScaling: number;
  /** Gerçekleşenin tahminden büyük olduğu saatlerin oranı */
  underForecastHourShare: number;
  /** Gerçekleşenin tahminden küçük olduğu saatlerin oranı */
  overForecastHourShare: number;
}

export interface PeriodAccuracy extends AccuracyStats {
  key: string;
}

export interface WorstHour {
  timestamp: Date;
  forecastMwh: number;
  actualMwh: number;
  errorMwh: number;
}

export interface PlantAccuracy {
  plantId: string;
  plantName: string;
  plantType: string;
  overall: AccuracyStats;
  monthly: PeriodAccuracy[];
  hourOfDay: PeriodAccuracy[];
  worstHours: WorstHour[];
}

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

export function computeAccuracyStats(records: AccuracyInputRecord[]): AccuracyStats {
  let forecast = 0;
  let actual = 0;
  let net = 0;
  let abs = 0;
  let under = 0;
  let over = 0;

  for (const r of records) {
    const err = r.actualMwh - r.forecastMwh;
    forecast += r.forecastMwh;
    actual += r.actualMwh;
    net += err;
    abs += Math.abs(err);
    if (err > 0) under++;
    else if (err < 0) over++;
  }

  const scale = safeDiv(actual, forecast);
  let scaledAbs = 0;
  for (const r of records) {
    scaledAbs += Math.abs(r.actualMwh - r.forecastMwh * scale);
  }

  return {
    hours: records.length,
    totalForecastMwh: forecast,
    totalActualMwh: actual,
    netErrorMwh: net,
    absErrorMwh: abs,
    biasRatio: safeDiv(net, forecast),
    wape: safeDiv(abs, actual),
    maeMwh: safeDiv(abs, records.length),
    systematicShare: safeDiv(Math.abs(net), abs),
    wapeAfterScaling: forecast === 0 ? safeDiv(abs, actual) : safeDiv(scaledAbs, actual),
    underForecastHourShare: safeDiv(under, records.length),
    overForecastHourShare: safeDiv(over, records.length),
  };
}

function groupStats(
  records: AccuracyInputRecord[],
  keyOf: (r: AccuracyInputRecord) => string
): PeriodAccuracy[] {
  const groups = new Map<string, AccuracyInputRecord[]>();
  for (const r of records) {
    const key = keyOf(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({ key, ...computeAccuracyStats(group) }));
}

/**
 * Bir santralin genel, aylık ve günün saatine göre tahmin doğruluğunu ve en büyük sapmalı saatlerini hesaplar.
 * Zaman damgaları Türkiye duvar saatini UTC alanlarında taşır (uygulama konvansiyonu).
 */
export function analyzePlantAccuracy(
  plant: { plantId: string; plantName: string; plantType: string },
  records: AccuracyInputRecord[],
  worstHourCount = 10
): PlantAccuracy {
  const worstHours = records
    .map((r) => ({
      timestamp: r.timestamp,
      forecastMwh: r.forecastMwh,
      actualMwh: r.actualMwh,
      errorMwh: r.actualMwh - r.forecastMwh,
    }))
    .sort((a, b) => Math.abs(b.errorMwh) - Math.abs(a.errorMwh))
    .slice(0, worstHourCount);

  return {
    ...plant,
    overall: computeAccuracyStats(records),
    monthly: groupStats(records, (r) => r.timestamp.toISOString().slice(0, 7)),
    hourOfDay: groupStats(records, (r) => String(r.timestamp.getUTCHours()).padStart(2, "0")),
    worstHours,
  };
}

const pctTr = (v: number, digits = 1) =>
  `%${(v * 100).toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/**
 * Tahmin doğruluğu metriklerinden kısa, eyleme dönük bir yorum üretir (dashboard ve sunumda ortak kullanılır).
 */
export function diagnoseAccuracy(stats: AccuracyStats): string {
  const direction = stats.biasRatio > 0 ? "eksik tahmin (fazla üretim)" : "aşırı tahmin (eksik üretim)";
  // 1 puandan küçük iyileşme fayda olarak sunulmaz
  const scalingHelps = stats.wape - stats.wapeAfterScaling >= 0.01;
  const scaling =
    `Tahmini ${pctTr(Math.abs(stats.biasRatio))} ${stats.biasRatio > 0 ? "yukarı" : "aşağı"} ölçeklemek net sapmayı giderir` +
    (scalingHelps
      ? ` ve WAPE'yi ${pctTr(stats.wape)} → ${pctTr(stats.wapeAfterScaling)} düzeyine indirir.`
      : `, ancak WAPE'yi belirgin şekilde düşürmez (${pctTr(stats.wape)} → ${pctTr(stats.wapeAfterScaling)}).`);

  if (stats.systematicShare >= 0.5) {
    return `Hatanın tek yönlü payı ${pctTr(stats.systematicShare, 0)}: ${direction}. ${scaling}`;
  }
  if (stats.systematicShare >= 0.2) {
    return `Belirgin ${direction} eğilimi var, ancak hataların çoğu rastgele. ${scaling} Kalan hata için tahmin modeli iyileştirilmeli.`;
  }
  return `Hatalar çoğunlukla rastgele (tek yönlü pay ${pctTr(stats.systematicShare, 0)}); ölçekleme etkisiz kalır, daha yüksek çözünürlüklü tahmin modeli gerekir.`;
}
