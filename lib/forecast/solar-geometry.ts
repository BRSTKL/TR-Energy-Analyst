/**
 * TR-Energy Analyst - Güneş konumu ve açık gök ışınımı (PLAN 15.4)
 *
 * Takvim özelliğidir (konum ve saatten hesaplanır, her zaman elde): güneş yüksekliği NOAA / Spencer yaklaşımıyla
 * (± ≈ 0,5°), açık gök yatay ışınımı Haurwitz modeliyle (W/m²; bulutsuz gökte beklenen GHI, atmosfer bulanıklığı yok).
 * Saatlik değer, Open-Meteo ışınımı gibi saat ortalamasıdır: üretim saati [t, t+1) içinde 4 noktanın ortalaması.
 * Zaman duvar saatidir (Türkiye, UTC+3; info-time.ts).
 */

import { TR_UTC_OFFSET_MS } from "./info-time";

const RAD = Math.PI / 180;
const HOUR = 3_600_000;

/** Güneşin zenit açısının kosinüsü (UTC ms) */
export function cosZenith(latitude: number, longitude: number, utcMs: number): number {
  const d = new Date(utcMs);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((utcMs - start) / 86_400_000) + 1;
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hours - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const trueSolarMinutes = hours * 60 + eqTime + 4 * longitude;
  const hourAngle = (trueSolarMinutes / 4 - 180) * RAD;
  const lat = latitude * RAD;
  return Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
}

/** Güneş yüksekliği (derece) */
export const solarElevation = (latitude: number, longitude: number, utcMs: number) => 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith(latitude, longitude, utcMs)))) / RAD;

/** Haurwitz açık gök GHI (W/m²), anlık */
export function clearSkyGhi(latitude: number, longitude: number, utcMs: number): number {
  const cz = cosZenith(latitude, longitude, utcMs);
  return cz > 0 ? 1098 * cz * Math.exp(-0.057 / cz) : 0;
}

/** Üretim saati [t, t+1) için açık gök GHI ortalaması (t duvar saati ms) */
export function clearSkyGhiHour(latitude: number, longitude: number, hourWall: number): number {
  const utc = hourWall - TR_UTC_OFFSET_MS;
  let sum = 0;
  for (const m of [7.5, 22.5, 37.5, 52.5]) sum += clearSkyGhi(latitude, longitude, utc + (m / 60) * HOUR);
  return sum / 4;
}
