/** Şirket ve santral listeleri için referans dönem: içinde bulunulan yıldan önceki tam takvim yılı */
export function lastFullYear(now = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear() - 1;
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/**
 * Şirket ve santral aramasında bakılan dönemler: son tam yıl ve içinde bulunulan yılın dünkü güne kadarki kısmı.
 * Yıl içinde başlayan portföyler (ör. 2026'da kurulan bir toplayıcı) de böylece bulunur. Ocak'ın ilk günü yalnız son tam yıl.
 */
export function searchPeriods(now = new Date()): Array<{ start: string; end: string }> {
  const periods = [lastFullYear(now)];
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  if (yesterday.getUTCFullYear() === now.getUTCFullYear()) {
    periods.push({ start: `${now.getUTCFullYear()}-01-01`, end: yesterday.toISOString().slice(0, 10) });
  }
  return periods;
}

/**
 * Şirketin santral listesi için dönemler: arama dönemlerine ek olarak dünün ayı. EPİAŞ şirket santral listesini
 * dönemin başındaki duruma göre döndürür; yıl içinde portföye katılan santraller ancak son ay sorulunca görünür.
 */
export function plantPeriods(now = new Date()): Array<{ start: string; end: string }> {
  const periods = searchPeriods(now);
  const last = periods[periods.length - 1];
  const monthStart = `${last.end.slice(0, 7)}-01`;
  if (monthStart !== last.start) periods.push({ start: monthStart, end: last.end });
  return periods;
}
