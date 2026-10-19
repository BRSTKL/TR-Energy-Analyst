/**
 * TR-Energy Analyst - Güneş konumu ve açık gök ışınımı (PLAN 15.4)
 *
 * Takvim özelliğidir (konum ve saatten hesaplanır, her zaman elde): güneş yüksekliği NOAA / Spencer yaklaşımıyla
 * (± ≈ 0,5°), açık gök yatay ışınımı Haurwitz modeliyle (W/m²; bulutsuz gökte beklenen GHI, atmosfer bulanıklığı yok).
 * Saatlik değer, Open-Meteo ışınımı gibi saat ortalamasıdır: üretim saati [t, t+1) içinde 4 noktanın ortalaması.
 * Zaman duvar saatidir (Türkiye, UTC+3; info-time.ts).
 */

import { TR_UTC_OFFSET_MS } from "../../forecast/info-time";

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

/** Güneş azimutu (derece, kuzeyden saat yönünde; doğu 90, güney 180) */
export function solarAzimuth(latitude: number, longitude: number, utcMs: number): number {
  const cz = Math.max(-1, Math.min(1, cosZenith(latitude, longitude, utcMs)));
  const sz = Math.sqrt(1 - cz * cz);
  if (sz < 1e-6) return 180;
  // Öğleden önce mi: bir dakika sonra güneş daha yüksekse öğleden önce (azimut doğuda, < 180)
  const later = cosZenith(latitude, longitude, utcMs + 60_000);
  const lat = latitude * RAD;
  const decl = declination(utcMs);
  const cosAz = (Math.sin(decl) - cz * Math.sin(lat)) / (sz * Math.cos(lat));
  const az = Math.acos(Math.max(-1, Math.min(1, cosAz))) / RAD;
  return later > cz ? az : 360 - az;
}

function declination(utcMs: number): number {
  const d = new Date(utcMs);
  const dayOfYear = Math.floor((utcMs - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (d.getUTCHours() - 12) / 24);
  return 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
}

/** Panel kurulumu: sabit eğim (güneye bakan) ya da kuzey–güney eksenli tek eksen takip */
export type PanelMount = { kind: "fixed"; tiltDeg: number } | { kind: "tracker" };

/**
 * Panel düzlemi ışınımı (W/m², saat ortalaması; izotropik gök modeli, yer yansıması 0,2): GHI, doğrudan (yatay) ve
 * dağınık ışınımdan. Doğrudan normal = doğrudan yatay ÷ cos(zenit); güneş çok alçakken (cos < 0,05) doğrudan bileşen 0.
 * Saat içinde 4 noktanın ortalaması (açık gök ile aynı düzen).
 */
export function planeOfArray(latitude: number, longitude: number, hourWall: number, ghi: number, directHorizontal: number, diffuse: number, mount: PanelMount): number {
  const utc = hourWall - TR_UTC_OFFSET_MS;
  let sum = 0;
  for (const m of [7.5, 22.5, 37.5, 52.5]) {
    const t = utc + (m / 60) * HOUR;
    const cz = cosZenith(latitude, longitude, t);
    if (cz <= 0) continue;
    const sz = Math.sqrt(1 - cz * cz);
    const az = solarAzimuth(latitude, longitude, t) * RAD;
    let cosAoi: number;
    let tilt: number;
    if (mount.kind === "fixed") {
      tilt = mount.tiltDeg * RAD;
      cosAoi = cz * Math.cos(tilt) + sz * Math.sin(tilt) * Math.cos(az - Math.PI);
    } else {
      // Kuzey–güney ekseni: güneş vektörünün eksen bileşeni sz·cos(az); en iyi dönüşte cos(AOI) = √(1 − bileşen²)
      cosAoi = Math.sqrt(Math.max(0, 1 - (sz * Math.cos(az)) ** 2));
      tilt = Math.abs(Math.atan2(sz * Math.sin(az), cz));
    }
    const dni = cz >= 0.05 ? directHorizontal / cz : 0;
    sum += dni * Math.max(0, cosAoi) + diffuse * ((1 + Math.cos(tilt)) / 2) + ghi * 0.2 * ((1 - Math.cos(tilt)) / 2);
  }
  return sum / 4;
}
