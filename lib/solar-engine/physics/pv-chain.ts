/**
 * TR-Energy Analyst - Fiziksel güneş zinciri (Aşama 22.2): ışınım → panel düzlemi → hücre sıcaklığı → DC güç → inverter
 *
 * 1. Panel düzlemi ışınımı (POA): doğrudan bileşen geliş açısıyla; dağınık bileşen PEREZ (1990, "allsites composite")
 *    gökyüzü modeliyle (çevre parlaklığı ve ufuk parlaklaşması; izotropik modelin bulutsuz günlerde düşük kaldığı
 *    bilinir); yerden yansıma albedo 0,2. Saat ortalaması: saat içinde 4 nokta (solar-geometry.ts planeOfArray ile aynı).
 * 2. Hücre sıcaklığı: NOCT yaklaşımı, Tc = Ta + POA × (NOCT − 20) / 800 (NOCT 45 °C; rüzgâr girdisi yok).
 * 3. DC güç (kurulu güce oran): POA / 1000 × (1 + γ (Tc − 25)), γ = −0,37 %/°C (kristal silisyum tipik).
 * 4. İnverter: AC = min(DC × ölçek, AC tavanı). Ölçek ve tavan santrale göre öğrenilir (models/physical.ts).
 * Zaman duvar saatidir (Türkiye, UTC+3). SAF: I/O yok.
 */

import { cosZenith, solarAzimuth, type PanelMount } from "./solar-geometry";
import { TR_UTC_OFFSET_MS } from "@/lib/forecast/info-time";

const RAD = Math.PI / 180;
const HOUR = 3_600_000;
const ALBEDO = 0.2;
export const NOCT_C = 45;
export const GAMMA_PER_C = -0.0037;

// Perez 1990 katsayıları: ε sınırları ve her dilim için f11, f12, f13, f21, f22, f23
const EPS_EDGES = [1.065, 1.23, 1.5, 1.95, 2.8, 4.5, 6.2];
const PEREZ: number[][] = [
  [-0.008, 0.588, -0.062, -0.06, 0.072, -0.022],
  [0.13, 0.683, -0.151, -0.019, 0.066, -0.029],
  [0.33, 0.487, -0.221, 0.055, -0.064, -0.026],
  [0.568, 0.187, -0.295, 0.109, -0.152, -0.014],
  [0.873, -0.392, -0.362, 0.226, -0.462, 0.001],
  [1.132, -1.237, -0.412, 0.288, -0.823, 0.056],
  [1.06, -1.6, -0.359, 0.264, -1.127, 0.131],
  [0.678, -0.327, -0.25, 0.156, -0.377, 0.182],
];

/** Atmosfer dışı normal ışınım (W/m²), yılın gününe göre */
function extraterrestrial(utcMs: number): number {
  const d = new Date(utcMs);
  const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000;
  return 1367 * (1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365));
}

/** Kasten–Young hava kütlesi */
function airMass(zenithRad: number): number {
  const zDeg = zenithRad / RAD;
  return 1 / (Math.cos(zenithRad) + 0.50572 * Math.pow(Math.max(0.1, 96.07995 - zDeg), -1.6364));
}

/** Perez dağınık ışınımın eğik yüzeydeki değeri (W/m²) */
export function perezDiffuse(dhi: number, dni: number, zenithRad: number, cosAoi: number, tiltRad: number, utcMs: number): number {
  if (dhi <= 0) return 0;
  const z3 = 1.041 * zenithRad ** 3;
  const eps = ((dhi + dni) / dhi + z3) / (1 + z3);
  let bin = EPS_EDGES.findIndex((e) => eps < e);
  if (bin < 0) bin = PEREZ.length - 1;
  const [f11, f12, f13, f21, f22, f23] = PEREZ[bin];
  const delta = (dhi * airMass(zenithRad)) / extraterrestrial(utcMs);
  const F1 = Math.max(0, f11 + f12 * delta + f13 * zenithRad);
  const F2 = f21 + f22 * delta + f23 * zenithRad;
  const a = Math.max(0, cosAoi);
  const b = Math.max(Math.cos(85 * RAD), Math.cos(zenithRad));
  return Math.max(0, dhi * ((1 - F1) * ((1 + Math.cos(tiltRad)) / 2) + F1 * (a / b) + F2 * Math.sin(tiltRad)));
}

/** Saat ortalaması panel düzlemi ışınımı (W/m²), Perez dağınık modeliyle. GHI / doğrudan / dağınık saat ortalamaları */
export function poaPerez(latitude: number, longitude: number, hourWall: number, ghi: number, directHorizontal: number, diffuse: number, mount: PanelMount): number {
  const utc = hourWall - TR_UTC_OFFSET_MS;
  let sum = 0;
  for (const m of [7.5, 22.5, 37.5, 52.5]) {
    const t = utc + (m / 60) * HOUR;
    const cz = cosZenith(latitude, longitude, t);
    if (cz <= 0) continue;
    const zen = Math.acos(Math.min(1, cz));
    const sz = Math.sqrt(1 - cz * cz);
    const az = solarAzimuth(latitude, longitude, t) * RAD;
    let cosAoi: number;
    let tilt: number;
    if (mount.kind === "fixed") {
      tilt = mount.tiltDeg * RAD;
      cosAoi = cz * Math.cos(tilt) + sz * Math.sin(tilt) * Math.cos(az - Math.PI);
    } else {
      cosAoi = Math.sqrt(Math.max(0, 1 - (sz * Math.cos(az)) ** 2));
      tilt = Math.abs(Math.atan2(sz * Math.sin(az), cz));
    }
    const dni = cz >= 0.05 ? directHorizontal / cz : 0;
    sum += dni * Math.max(0, cosAoi) + perezDiffuse(diffuse, dni, zen, cosAoi, tilt, t) + ghi * ALBEDO * ((1 - Math.cos(tilt)) / 2);
  }
  return sum / 4;
}

/** Hücre sıcaklığı (°C), NOCT yaklaşımı */
export const cellTemp = (poa: number, ambientC: number) => ambientC + (poa * (NOCT_C - 20)) / 800;

/** Kurulu güce oranla DC güç (1 = standart koşulda tam güç) */
export const dcFraction = (poa: number, ambientC: number) => (poa / 1000) * (1 + GAMMA_PER_C * (cellTemp(poa, ambientC) - 25));
