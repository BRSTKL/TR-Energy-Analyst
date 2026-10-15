/**
 * TR-Energy Analyst - Hava verisi önizlemesi (PLAN 15.2; projenin "Üretim tahmini" sayfası)
 *
 * Projenin güneş santralleri, konum ve hava verisi durumuyla; hava verisi olan bir santral için bir günün saatlik ışınım
 * tahmini ile gerçek üretim ve ilk KGÜP'ü yan yana, ayrıca o ayın ışınım–üretim korelasyonu. Tahmin modeli değildir
 * (15.4); veri ve hizalamayı göstermek içindir. Saatler duvar saati (havuz kuralı); ışınım üretim saatine hizalı
 * (weather-codec.ts). Konum önce santral kaydından (PowerPlant), yoksa havuz tanımından.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { readWeatherYear, weatherDir } from "@/lib/weather/weather-store";
import { WEATHER_MODEL } from "@/lib/weather/weather-codec";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { formatLocation, isLocationSource, LOCATION_SOURCE_LABEL, type PlantLocation } from "@/lib/epias-plant/location";

const HOUR = 3_600_000;

export interface WeatherPlant {
  epiasPlantId: number;
  name: string;
}

/** Projedeki santral ve durumu */
export interface ProjectWeatherPlant {
  epiasPlantId: number | null;
  name: string;
  organizationName: string | null;
  /** "37,8004° K, 33,5941° D", "konum yok" ya da lisanssız toplam notu */
  locationText: string;
  locationSource: string | null;
  /** Hava verisi çekilmiş yıllar */
  weatherYears: number[];
}

export interface WeatherHour {
  hour: number;
  uevmMwh: number | null;
  kgupFirstMwh: number | null;
  ghiD2: number | null;
  ghiD1: number | null;
  tempD2: number | null;
  cloudD2: number | null;
  /** Gerçekleşen uydu ışınımı (W/m²), uyduya göre beklenen üretim (MWh) ve kayıp durumu: production-loss.ts `withLoss` */
  satGhi?: number | null;
  expectedMwh?: number | null;
  lossState?: "planned" | "unplanned" | "normal" | "none";
}

export interface WeatherDay {
  plant: WeatherPlant;
  location: { text: string; source: string; ref: string; grid: string };
  model: string;
  date: string;
  /** Hem üretimin hem ışınımın olduğu en son gün */
  lastDate: string;
  firstDate: string;
  hours: WeatherHour[];
  /** Gün toplamları: üretim, ilk KGÜP (MWh); ışınım (kWh/m², 2 gün önceki tahmin) */
  totals: { uevmMwh: number; kgupFirstMwh: number; ghiD2KwhM2: number; ghiD1KwhM2: number };
  /** Günün ayında saatlik ışınım (2 gün önce) – üretim korelasyonu; gün sayısı */
  month: { corrD2: number | null; corrD1: number | null; days: number };
}

async function weatherYears(epiasPlantId: number): Promise<number[]> {
  try {
    const names = await fs.readdir(path.join(weatherDir(), String(epiasPlantId)));
    return names.map((n) => /^(\d{4})\.json\.gz$/.exec(n)?.[1]).filter((y): y is string => !!y).map(Number).sort();
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
}

/** Santral kaydındaki konum (geçerliyse), yoksa havuz tanımındaki */
async function plantLocation(row: { epiasPlantId: number | null; latitude: number | null; longitude: number | null; locationSource: string | null; locationRef: string | null }): Promise<PlantLocation | null> {
  if (row.latitude !== null && row.longitude !== null && isLocationSource(row.locationSource))
    return { latitude: row.latitude, longitude: row.longitude, locationSource: row.locationSource, locationRef: row.locationRef ?? "" };
  return row.epiasPlantId !== null ? (await readPoolPlantInfo(row.epiasPlantId))?.location ?? null : null;
}

/** Projenin güneş santralleri (ada göre), konum ve hava verisi durumuyla */
export async function projectWeatherPlants(projectId: string): Promise<{ project: { id: string; name: string }; plants: ProjectWeatherPlant[] } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      plants: {
        where: { type: "GES" },
        select: { epiasPlantId: true, name: true, organizationName: true, latitude: true, longitude: true, locationSource: true, locationRef: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!project) return null;
  const plants: ProjectWeatherPlant[] = [];
  for (const p of project.plants) {
    const loc = await plantLocation(p);
    plants.push({
      epiasPlantId: p.epiasPlantId,
      name: p.name,
      organizationName: p.organizationName,
      locationText: loc ? formatLocation(loc) : isUnlicensedName(p.name) ? "lisanssız toplam: tek konumla gösterilmez" : "konum yok",
      locationSource: loc?.locationSource ?? null,
      weatherYears: loc && p.epiasPlantId !== null ? await weatherYears(p.epiasPlantId) : [],
    });
  }
  return { project: { id: project.id, name: project.name }, plants };
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function corr(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 48) return null;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : null;
}

export async function weatherDay(epiasPlantId: number, date?: string | null): Promise<WeatherDay | { error: string }> {
  const info = await readPoolPlantInfo(epiasPlantId);
  if (!info?.location) return { error: "Bu santralin konumu yok." };

  // Üretimi ve ışınımı olan gün aralığı (son yıldan geriye)
  const thisYear = new Date().getUTCFullYear();
  let lastDate: string | null = null;
  let firstDate: string | null = null;
  for (let y = thisYear; y >= 2024; y--) {
    const [w, p] = await Promise.all([readWeatherYear(epiasPlantId, y), readPoolYear(epiasPlantId, y)]);
    if (!w || !p) continue;
    const start = Date.parse(w.start);
    for (let i = 0; i < Math.min(w.series.d2.shortwave_radiation.length, p.uevm.length); i++) {
      if (w.series.d2.shortwave_radiation[i] === null || p.uevm[i] === null) continue;
      const k = dayKey(start + i * HOUR);
      if (!lastDate || k > lastDate) lastDate = k;
      if (!firstDate || k < firstDate) firstDate = k;
    }
  }
  if (!lastDate || !firstDate) return { error: "Bu santral için hem üretim hem hava verisi olan gün yok." };
  const day = date && date >= firstDate && date <= lastDate ? date : lastDate;
  const year = Number(day.slice(0, 4));
  const [w, p] = await Promise.all([readWeatherYear(epiasPlantId, year), readPoolYear(epiasPlantId, year)]);
  if (!w || !p) return { error: "Gün verisi okunamadı." };

  const start = Date.parse(w.start);
  const i0 = (Date.parse(`${day}T00:00:00Z`) - start) / HOUR;
  const hours: WeatherHour[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    uevmMwh: p.uevm[i0 + h] ?? null,
    kgupFirstMwh: p.kgupFirst[i0 + h] ?? null,
    ghiD2: w.series.d2.shortwave_radiation[i0 + h] ?? null,
    ghiD1: w.series.d1.shortwave_radiation[i0 + h] ?? null,
    tempD2: w.series.d2.temperature_2m[i0 + h] ?? null,
    cloudD2: w.series.d2.cloud_cover[i0 + h] ?? null,
  }));
  const sum = (f: (h: WeatherHour) => number | null) => hours.reduce((a, h) => a + (f(h) ?? 0), 0);

  // Ayın korelasyonu (üretim ve ışınımı olan saatler)
  const month = day.slice(0, 7);
  const u: number[] = [];
  const g2: number[] = [];
  const g1: number[] = [];
  const days = new Set<string>();
  const mStart = (Date.parse(`${month}-01T00:00:00Z`) - start) / HOUR;
  for (let i = mStart; i < p.uevm.length && dayKey(start + i * HOUR).startsWith(month); i++) {
    const uv = p.uevm[i];
    const a = w.series.d2.shortwave_radiation[i];
    const b = w.series.d1.shortwave_radiation[i];
    if (uv === null || a === null || b === null) continue;
    u.push(uv);
    g2.push(a);
    g1.push(b);
    days.add(dayKey(start + i * HOUR));
  }

  const loc = info.location;
  return {
    plant: { epiasPlantId, name: info.name ?? String(epiasPlantId) },
    location: {
      text: formatLocation(loc),
      source: LOCATION_SOURCE_LABEL[loc.locationSource],
      ref: loc.locationRef,
      grid: w.gridLatitude !== null && w.gridLongitude !== null ? `${w.gridLatitude}° K, ${w.gridLongitude}° D` : "–",
    },
    model: WEATHER_MODEL,
    date: day,
    lastDate,
    firstDate,
    hours,
    totals: {
      uevmMwh: sum((h) => h.uevmMwh),
      kgupFirstMwh: sum((h) => h.kgupFirstMwh),
      ghiD2KwhM2: sum((h) => h.ghiD2) / 1000,
      ghiD1KwhM2: sum((h) => h.ghiD1) / 1000,
    },
    month: { corrD2: corr(u, g2), corrD1: corr(u, g1), days: days.size },
  };
}
