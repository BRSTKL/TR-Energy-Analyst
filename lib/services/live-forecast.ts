/**
 * TR-Energy Analyst - İleriye dönük güneş üretim tahmini (Üretim tahmini sayfası; kullanıcı kararı 16.10.2026)
 *
 * Projenin konumu olan güneş santralleri için yarın ve öbür gün saatlik beklenen üretim. Model: donmuş sürüm 3
 * (production-model-v2.ts: panel düzlemi ışınımı, çarpımsal biçim, uydu etiketli eğitim temizliği), KALICILIKSIZ
 * (`noLag`): kamu üretim verisi (EPİAŞ UEVM) aylık uzlaştırmadan sonra yayımlandığı için 48 saat önceki üretim canlıda
 * yoktur. Eğitim: havuzdaki son tam üretim ayından önceki 4 ay (geriye dönük testle aynı pencere), 2 gün önceki hava
 * tahminiyle (`d2`). Tahmin girdisi: isteğin yapıldığı andaki en yeni ECMWF IFS 0,25° tahmini (lib/weather/live-forecast.ts);
 * koordinat başına 3 saat önbellek (.cache/forecast/live). Kurulu güç sınırı: eğitimdeki en yüksek üretim.
 * Bu bir açık referanstır: geçmiş başarısı geriye dönük testte (scripts/forecast-backtest.mts, "sürüm 3 kalıcılıksız").
 */

import fs from "node:fs";
import path from "node:path";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/forecast/production-model-v2";
import { trainingLossFilter } from "@/lib/forecast/curtailment";
import { liveForecastUrl, liveWeatherHours } from "@/lib/weather/live-forecast";
import type { OpenMeteoHourly } from "@/lib/weather/weather-codec";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import { readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { loadSolarHours } from "./production-data";
import { projectWeatherPlants } from "./weather-preview";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TR_OFFSET = 3 * HOUR;
const CACHE_DIR = path.join(process.cwd(), ".cache", "forecast", "live");
const CACHE_TTL_MS = 3 * HOUR;
/** Tahmin edilen gün sayısı (yarından itibaren) */
export const LIVE_DAYS = 2;
/** Bunun altında eğitim saati olan santralde uyarı (≈ 2 ayın gündüz saatleri) */
const MIN_TRAIN_HOURS = 500;

export interface LivePlantForecast {
  epiasPlantId: number | null;
  name: string;
  organizationName: string | null;
  locationText: string;
  locationSource: string | null;
  status: "ok" | "no-location" | "unlicensed" | "no-data" | "error";
  message?: string;
  /** Eğitim saati azsa (yeni santral) uyarı */
  warning?: string;
  /** Saat başına MWh, yarın 00:00'dan (LIVE_DAYS × 24) */
  hours?: Array<number | null>;
  daily?: number[];
  peakMwh?: number;
  train?: { from: string; to: string; hours: number; mount: string; maxMwh: number };
}

export interface ProjectLiveForecast {
  project: { id: string; name: string };
  generatedAt: string;
  /** Tahmin edilen günler (YYYY-MM-DD, Türkiye saati) */
  days: string[];
  weatherFetchedAt: string | null;
  plants: LivePlantForecast[];
  /** Portföy toplamı (tahmini olan santraller), saat başına MWh */
  total: Array<number | null>;
}

/** `fresh`: önbelleğe bakmadan çek (günlük tahmin kaydı: hava girdisinin ne zaman alındığı kesin yazılır) */
async function cachedLiveWeather(lat: number, lon: number, fresh = false): Promise<{ res: OpenMeteoHourly; fetchedAt: string }> {
  const file = path.join(CACHE_DIR, `${lat.toFixed(4)}_${lon.toFixed(4)}.json`);
  if (!fresh)
    try {
      const c = JSON.parse(fs.readFileSync(file, "utf8")) as { res: OpenMeteoHourly; fetchedAt: string };
      if (Date.now() - Date.parse(c.fetchedAt) < CACHE_TTL_MS) return c;
    } catch {
      /* önbellek yok */
    }
  const r = await fetch(liveForecastUrl(lat, lon, LIVE_DAYS + 1), { headers: { "User-Agent": "TR-Energy-Analyst/1.0 (non-commercial research)" } });
  const body = await r.json();
  if (!r.ok || !body?.hourly?.time) throw new Error(`Open-Meteo: ${r.status} ${body?.reason ?? ""}`);
  const c = { res: body as OpenMeteoHourly, fetchedAt: new Date().toISOString() };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(c));
  return c;
}

/** Havuzdaki son üretim (UEVM) saatinden: eğitimin bittiği ay başı (son TAM ay sonrası) */
async function trainingEnd(epiasPlantId: number, now: number): Promise<number | null> {
  const y = new Date(now).getUTCFullYear();
  for (const year of [y, y - 1]) {
    const doc = await readPoolYear(epiasPlantId, year);
    if (!doc) continue;
    let last = -1;
    doc.uevm.forEach((v, i) => {
      if (v !== null) last = i;
    });
    if (last < 0) continue;
    const t = Date.parse(doc.start) + last * HOUR;
    const d = new Date(t);
    // Ayın son saati de doluysa o ay tam: eğitim ertesi ay başında biter; değilse ay başında
    const nextMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    return t + HOUR >= nextMonth ? nextMonth : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  return null;
}

/** Tek santralin tahmini (sayfa ve günlük tahmin kaydı aynı yolu kullanır) */
export interface SolarPlantForecast {
  status: "ok" | "no-data" | "error";
  message?: string;
  warning?: string;
  /** Saat başına MWh, `from`'dan itibaren `hours` saat */
  hours?: Array<number | null>;
  train?: { from: string; to: string; hours: number; mount: string; maxMwh: number };
  /** Hava tahmininin alındığı an (ISO) */
  weatherFetchedAt?: string;
  location?: { latitude: number; longitude: number; locationSource: string };
}

/**
 * Konumu havuzda olan güneş santrali için `from` (Türkiye duvar saati ms, gün başı) itibaren `count` saatlik tahmin.
 * Eğitim: havuzdaki son tam üretim ayından önceki 4 ay; girdi: o andaki en yeni hava tahmini.
 */
export async function forecastSolarPlant(epiasPlantId: number, from: number, count: number, opts: { now?: number; fresh?: boolean } = {}): Promise<SolarPlantForecast> {
  const now = opts.now ?? Date.now();
  try {
    const info = await readPoolPlantInfo(epiasPlantId);
    const loc = info?.location;
    if (!loc) throw new Error("Havuzda konum yok");
    const end = await trainingEnd(epiasPlantId, now);
    if (end === null) return { status: "no-data", message: "Havuzda üretim verisi yok" };
    const start = Date.UTC(new Date(end).getUTCFullYear(), new Date(end).getUTCMonth() - 4, 1);
    const data = await loadSolarHours(epiasPlantId, start, end);
    if (!data) throw new Error("Eğitim verisi okunamadı");
    const clean = trainingLossFilter(
      data.hours.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
      data.site,
      end,
      SATELLITE_DELAY_DAYS
    );
    let model;
    try {
      model = fitSolarModelV2(data.hours, data.site, { exclude: clean.exclude, noLag: true });
    } catch {
      return { status: "no-data", message: "Son 4 ayda eğitim için yeterli üretim saati yok (yeni santral?)" };
    }
    const w = await cachedLiveWeather(loc.latitude, loc.longitude, opts.fresh);
    const hours = liveWeatherHours(w.res, from, from + count * HOUR).map((wh) => {
      const h: SolarHourV2 = { ...wh, uevm: null, kgupFirst: null, kgupFinal: null, ptf: null, lag48: null, ghiLag48: null, directLag48: null, diffuseLag48: null, live: true };
      const v = model.predict(h);
      return v === null ? null : Math.round(v * 1000) / 1000;
    });
    return {
      status: "ok",
      ...(model.trainHours < MIN_TRAIN_HOURS ? { warning: `Eğitimde yalnız ${model.trainHours} saat (yeni santral ya da veri eksik): tahmin kaba` } : {}),
      hours,
      train: { from: new Date(start).toISOString().slice(0, 10), to: new Date(end - DAY).toISOString().slice(0, 10), hours: model.trainHours, mount: model.mount, maxMwh: model.trainMaxMwh },
      weatherFetchedAt: w.fetchedAt,
      location: { latitude: loc.latitude, longitude: loc.longitude, locationSource: loc.locationSource },
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export async function projectLiveForecast(projectId: string, now = Date.now()): Promise<ProjectLiveForecast | null> {
  const list = await projectWeatherPlants(projectId);
  if (!list) return null;
  const wallNow = now + TR_OFFSET;
  const tomorrow = Date.UTC(new Date(wallNow).getUTCFullYear(), new Date(wallNow).getUTCMonth(), new Date(wallNow).getUTCDate() + 1);
  const days = Array.from({ length: LIVE_DAYS }, (_, i) => new Date(tomorrow + i * DAY).toISOString().slice(0, 10));
  const n = LIVE_DAYS * 24;
  const total: Array<number | null> = Array(n).fill(null);
  const fetchedTimes: string[] = [];
  const plants: LivePlantForecast[] = [];
  for (const p of list.plants) {
    const base = { epiasPlantId: p.epiasPlantId, name: p.name, organizationName: p.organizationName, locationText: p.locationText, locationSource: p.locationSource };
    if (p.epiasPlantId === null || !p.locationSource) {
      plants.push({ ...base, status: p.locationText.startsWith("lisanssız") ? "unlicensed" : "no-location" });
      continue;
    }
    const f = await forecastSolarPlant(p.epiasPlantId, tomorrow, n, { now });
    if (f.status !== "ok") {
      plants.push({ ...base, status: f.status, message: f.message });
      continue;
    }
    const hours = f.hours!;
    fetchedTimes.push(f.weatherFetchedAt!);
    hours.forEach((v, i) => {
      if (v !== null) total[i] = (total[i] ?? 0) + v;
    });
    const daily = days.map((_, d) => hours.slice(d * 24, d * 24 + 24).reduce((a: number, v) => a + (v ?? 0), 0));
    plants.push({ ...base, status: "ok", ...(f.warning ? { warning: f.warning } : {}), hours, daily, peakMwh: Math.max(0, ...hours.map((v) => v ?? 0)), train: f.train });
  }
  // En eski önbellek anı: sayfadaki "hava tahmini şu andan" notu için kötümser değer
  const weatherFetchedAt = fetchedTimes.length ? fetchedTimes.sort()[0] : null;
  return { project: list.project, generatedAt: new Date(now).toISOString(), days, weatherFetchedAt, plants, total };
}
