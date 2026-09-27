/**
 * TR-Energy Analyst - Sektör karnesinin saatlik serisi (PLAN 4.1)
 *
 * Karne yalnızca yıllık özet tutarsa aday santral taraması (portföye eklenince netleşme kazancı) ve arıza saatleri
 * hariç karne (K1) yeniden EPİAŞ'a gitmeden hesaplanamaz. Her santralin dönem boyunca saatlik plan (KGÜP) ve
 * gerçekleşen (UEVM) serisi, dönem başından itibaren saat sırasıyla iki dizi olarak saklanır; verisi olmayan saat null.
 * Değerler 1 kWh hassasiyetine yuvarlanır. Diske gzip ile yazılır (lib/services/sector.ts). SAF: I/O yok.
 */

export interface SectorHourlySeries {
  epiasPlantId: number;
  /** İlk saat (duvar saati UTC alanında, ISO) */
  start: string;
  forecast: Array<number | null>;
  actual: Array<number | null>;
}

const HOUR = 3_600_000;
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Dönemin [periodStart 00:00, periodEnd 23:00] saatlerini dizilere yazar; dönem dışındaki satırlar atlanır */
export function encodeHourly(
  epiasPlantId: number,
  rows: Array<{ timestamp: Date | string; forecastMwh: number; actualMwh: number }>,
  periodStart: string,
  periodEnd: string
): SectorHourlySeries {
  const t0 = Date.parse(`${periodStart}T00:00:00Z`);
  const n = (Date.parse(`${periodEnd}T00:00:00Z`) + 24 * HOUR - t0) / HOUR;
  const forecast: Array<number | null> = Array(n).fill(null);
  const actual: Array<number | null> = Array(n).fill(null);
  for (const r of rows) {
    const i = (new Date(r.timestamp).getTime() - t0) / HOUR;
    if (!Number.isInteger(i) || i < 0 || i >= n) continue;
    forecast[i] = round(r.forecastMwh);
    actual[i] = round(r.actualMwh);
  }
  return { epiasPlantId, start: new Date(t0).toISOString(), forecast, actual };
}

/** Verisi olan saatler (plan ve gerçekleşen ikisi de var) */
export function decodeHourly(s: SectorHourlySeries): Array<{ timestamp: Date; forecastMwh: number; actualMwh: number }> {
  const t0 = Date.parse(s.start);
  const out: Array<{ timestamp: Date; forecastMwh: number; actualMwh: number }> = [];
  for (let i = 0; i < s.forecast.length; i++) {
    const f = s.forecast[i];
    const a = s.actual[i];
    if (f === null || a === null) continue;
    out.push({ timestamp: new Date(t0 + i * HOUR), forecastMwh: f, actualMwh: a });
  }
  return out;
}
