/** Sunumdaki günlük toplam ve tepe aynı 24 saatten hesaplanır; eksik saat sıfır sayılmaz. */
export function forecastDaySummary(hours: ReadonlyArray<number | null>, day: number) {
  const values = hours.slice(day * 24, day * 24 + 24);
  const availableHours = values.filter(
    (v) => v !== null && Number.isFinite(v) && v >= 0
  ).length;
  if (availableHours !== 24)
    return { totalMwh: null, peakMwh: null, peakHour: null, availableHours };
  let totalMwh = 0,
    peakMwh = -Infinity,
    peakHour = 0;
  values.forEach((v, h) => {
    totalMwh += v!;
    if (v! > peakMwh) {
      peakMwh = v!;
      peakHour = h;
    }
  });
  return { totalMwh, peakMwh, peakHour, availableHours };
}
/** Yalnız bütün kapsanan santrallerin o saati biliniyorsa portföy toplamını gösterir. */
export function portfolioForecastHours(
  series: ReadonlyArray<ReadonlyArray<number | null>>,
  count = 48
): Array<number | null> {
  return Array.from({ length: count }, (_, i) => {
    if (
      !series.length ||
      series.some(
        (hours) => hours[i] == null || !Number.isFinite(hours[i]) || hours[i]! < 0
      )
    )
      return null;
    return series.reduce((total, hours) => total + hours[i]!, 0);
  });
}
