/**
 * TR-Energy Analyst - İleriye dönük güneş üretim tahmini (Üretim tahmini sayfası; kullanıcı kararı 16.10.2026)
 *
 * Projenin konumu olan güneş santralleri için yarın ve öbür gün saatlik beklenen üretim. Model: donmuş sürüm 3
 * (production-model-v2.ts: panel düzlemi ışınımı, çarpımsal biçim, uydu etiketli eğitim temizliği), KALICILIKSIZ
 * (`noLag`): kamu üretim verisi (EPİAŞ UEVM) aylık uzlaştırmadan sonra yayımlandığı için 48 saat önceki üretim canlıda
 * yoktur (gerçek zamanlı üretim iki gün gecikir; kalıcılık 48 saatle kurulduğu için yine kapalı). Eğitim: havuzdaki son
 * tam üretim ayından önceki 4 ay (geriye dönük testle aynı pencere); geçici üretim (EPİAŞ gerçek zamanlı üretimi,
 * lib/pool/provisional.ts) daha ileriyse son tam güne kadar 4 ay (18.10.2026). Hava: 2 gün önceki tahmin (`d2`). Tahmin girdisi: isteğin yapıldığı andaki en yeni ECMWF IFS 0,25° tahmini (lib/weather/live-forecast.ts);
 * koordinat başına 3 saat önbellek (.cache/forecast/live). Kurulu güç sınırı: eğitimdeki en yüksek üretim.
 * Bu bir açık referanstır: geçmiş başarısı geriye dönük testte (scripts/forecast-backtest.mts, "sürüm 3 kalıcılıksız").
 */

import fs from "node:fs";
import path from "node:path";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/solar-engine/models/production-model-v2";
import { trainingLossFilter } from "@/lib/forecast/curtailment";
import { liveForecastUrl, liveWeatherHours } from "@/lib/weather/live-forecast";
import type { OpenMeteoHourly } from "@/lib/weather/weather-codec";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import { readPoolPlantInfo, readPoolYear, readProvisionalYear } from "@/lib/pool/pool-store";
import { loadSolarHours } from "./data/production-data";
import { ENSEMBLE_KINDS, fitEnsemble, type EnsembleKind, type NwpArchive } from "./models/ensemble";
import { NWP_MODELS, type NwpYear } from "@/lib/weather/nwp-models";
import { readNwpYear } from "@/lib/weather/weather-store";
import { projectWeatherPlants } from "../services/weather-preview";

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
  // Süre sınırı: takılan istek günlük tahmin kaydını kesimden sonraya itmesin
  const r = await fetch(liveForecastUrl(lat, lon, LIVE_DAYS + 1), { headers: { "User-Agent": "TR-Energy-Analyst/1.0 (non-commercial research)" }, signal: AbortSignal.timeout(30_000) });
  const body = await r.json();
  if (!r.ok || !body?.hourly?.time) throw new Error(`Open-Meteo: ${r.status} ${body?.reason ?? ""}`);
  const c = { res: body as OpenMeteoHourly, fetchedAt: new Date().toISOString() };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(c));
  return c;
}

/** Ek hava modellerinin (ICON-EU, GFS) canlı tahmini: tek istek, aynı önbellek kuralı (Aşama 22.3) */
async function cachedLiveNwp(lat: number, lon: number, fresh = false): Promise<{ res: OpenMeteoHourly; fetchedAt: string }> {
  const file = path.join(CACHE_DIR, `nwp_${lat.toFixed(4)}_${lon.toFixed(4)}.json`);
  if (!fresh)
    try {
      const c = JSON.parse(fs.readFileSync(file, "utf8")) as { res: OpenMeteoHourly; fetchedAt: string };
      if (Date.now() - Date.parse(c.fetchedAt) < CACHE_TTL_MS) return c;
    } catch {
      /* önbellek yok */
    }
  // Gölge sürümler günlük akışın yeniden deneme turuna girmez: düşen istek burada iki kez yeniden denenir (15 sn arayla)
  let body: any = null;
  let last = "";
  for (const wait of [0, 15_000, 15_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const r = await fetch(liveForecastUrl(lat, lon, LIVE_DAYS + 1, NWP_MODELS), { headers: { "User-Agent": "TR-Energy-Analyst/1.0 (non-commercial research)" }, signal: AbortSignal.timeout(30_000) });
      const b = await r.json();
      if (r.ok && b?.hourly?.time) {
        body = b;
        break;
      }
      last = `${r.status} ${b?.reason ?? ""}`;
      if (r.status === 400) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  if (!body) throw new Error(`Open-Meteo: ${last}`);
  const c = { res: body as OpenMeteoHourly, fetchedAt: new Date().toISOString() };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(c));
  return c;
}

/**
 * Eğitimin bitişi ve başlangıcı. `now` yalnız yılı seçer: havuzda o an ne varsa kullanılır (geçmiş bir `now` ile çağrılırsa
 * sonradan çekilmiş veri de girer; günlük tahmin kaydı geçmiş günü zaten reddeder). Yalnız UEVM varsa: son TAM ay sonrası ay başı, 4 ay geriye (geriye dönük testle aynı
 * pencere). Geçici üretim (EPİAŞ gerçek zamanlı üretimi; 18.10.2026) UEVM'den ilerideyse: son çekilen tam günün ertesi,
 * 4 ay geriye (en güncel üretimle eğitim).
 */
async function trainingWindow(epiasPlantId: number, now: number, months = 4): Promise<{ start: number; end: number; provisional: boolean } | null> {
  const y = new Date(now).getUTCFullYear();
  let uevmEnd: number | null = null;
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
    uevmEnd = t + HOUR >= nextMonth ? nextMonth : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    break;
  }
  let provEnd: number | null = null;
  for (const year of [y, y - 1]) {
    const g = await readProvisionalYear(epiasPlantId, year);
    if (g?.fetchedThrough) {
      provEnd = Date.parse(`${g.fetchedThrough}T00:00:00Z`) + DAY;
      break;
    }
  }
  if (provEnd !== null && (uevmEnd === null || provEnd > uevmEnd)) {
    // 4 ay geriye; ayın 29–31'inde kısa aya taşmasın (30 Haziran → 28/29 Şubat değil 2 Mart)
    const e = new Date(provEnd);
    const back = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - months, 1));
    const day = Math.min(e.getUTCDate(), new Date(Date.UTC(back.getUTCFullYear(), back.getUTCMonth() + 1, 0)).getUTCDate());
    return { start: Date.UTC(back.getUTCFullYear(), back.getUTCMonth(), day), end: provEnd, provisional: true };
  }
  if (uevmEnd === null) return null;
  return { start: Date.UTC(new Date(uevmEnd).getUTCFullYear(), new Date(uevmEnd).getUTCMonth() - months, 1), end: uevmEnd, provisional: false };
}

/** Tek santralin tahmini (sayfa ve günlük tahmin kaydı aynı yolu kullanır) */
export interface SolarPlantForecast {
  status: "ok" | "no-data" | "error";
  message?: string;
  warning?: string;
  /** Saat başına MWh, `from`'dan itibaren `hours` saat */
  hours?: Array<number | null>;
  /** provisionalHours: eğitimde geçici üretimle (GZÜ) doldurulan saat */
  /** provisionalThrough: geçici üretimin çekildiği son tam gün (kayıt sonradan, UEVM gelince, yeniden kurulamaz; iz için) */
  train?: { from: string; to: string; hours: number; mount: string; maxMwh: number; provisionalHours?: number; provisionalThrough?: string };
  /** Hava tahmininin alındığı an (ISO) */
  weatherFetchedAt?: string;
  location?: { latitude: number; longitude: number; locationSource: string };
  /** `recentFitDays` istendiyse: eğitimin son günlerinde (kayıp saatler hariç) model tahmini ve gerçekleşen (günlük hata düzeltmesinin yedek kaynağı) */
  recentFit?: Array<{ t: number; forecast: number; actual: number }>;
}

/**
 * Konumu havuzda olan güneş santrali için `from` (Türkiye duvar saati ms, gün başı) itibaren `count` saatlik tahmin.
 * Eğitim: `trainingWindow` (son tam üretim ayı ya da geçici üretimle son tam gün, 4 ay geriye); girdi: o andaki en yeni hava
 * tahmini.
 */
export async function forecastSolarPlant(
  epiasPlantId: number,
  from: number,
  count: number,
  opts: { now?: number; fresh?: boolean; trainingMonths?: number; recentFitDays?: number } = {}
): Promise<SolarPlantForecast> {
  const now = opts.now ?? Date.now();
  try {
    const info = await readPoolPlantInfo(epiasPlantId);
    const loc = info?.location;
    if (!loc) throw new Error("Havuzda konum yok");
    const win = await trainingWindow(epiasPlantId, now, opts.trainingMonths ?? 4);
    if (win === null) return { status: "no-data", message: "Havuzda üretim verisi yok" };
    const { start, end } = win;
    const data = await loadSolarHours(epiasPlantId, start, end, { provisional: win.provisional });
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
      return { status: "no-data", message: `Son ${opts.trainingMonths ?? 4} ayda eğitim için yeterli üretim saati yok (yeni santral?)` };
    }
    const w = await cachedLiveWeather(loc.latitude, loc.longitude, opts.fresh);
    const hours = liveWeatherHours(w.res, from, from + count * HOUR).map((wh) => {
      const h: SolarHourV2 = { ...wh, uevm: null, kgupFirst: null, kgupFinal: null, ptf: null, lag48: null, ghiLag48: null, directLag48: null, diffuseLag48: null, live: true };
      const v = model.predict(h);
      return v === null ? null : Math.round(v * 1000) / 1000;
    });
    // Eğitimin son günlerinde modelin hatası (örneklem içi; eğitimden çıkarılan kayıp saatler hariç)
    let recentFit: SolarPlantForecast["recentFit"];
    if (opts.recentFitDays) {
      const since = end - opts.recentFitDays * DAY;
      recentFit = [];
      for (const h of data.hours) {
        if (h.t < since || h.uevm === null || clean.exclude(h)) continue;
        const v = model.predict(h);
        if (v !== null) recentFit.push({ t: h.t, forecast: v, actual: h.uevm });
      }
    }
    return {
      status: "ok",
      ...(recentFit ? { recentFit } : {}),
      ...(model.trainHours < MIN_TRAIN_HOURS ? { warning: `Eğitimde yalnız ${model.trainHours} saat (yeni santral ya da veri eksik): tahmin kaba` } : {}),
      hours,
      train: {
        from: new Date(start).toISOString().slice(0, 10),
        to: new Date(end - DAY).toISOString().slice(0, 10),
        hours: model.trainHours,
        mount: model.mount,
        maxMwh: model.trainMaxMwh,
        ...(win.provisional ? { provisionalHours: data.provisionalHours ?? 0, provisionalThrough: new Date(end - DAY).toISOString().slice(0, 10) } : {}),
      },
      weatherFetchedAt: w.fetchedAt,
      location: { latitude: loc.latitude, longitude: loc.longitude, locationSource: loc.locationSource },
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Üç hava modelli birleşim (Aşama 22.3, models/ensemble.ts): `forecastSolarPlant` ile aynı eğitim penceresi ve temizlik;
 * ICON-EU ve GFS eğitimde arşivdeki 2 gün önceki tahminle, canlıda isteğin yapıldığı andaki en yeni tahminle. Ağırlıkların
 * doğrulama dönemi eğitimin son 30 günü. Üç birleşim tek eğitimle döner.
 */
export async function forecastSolarEnsemble(
  epiasPlantId: number,
  from: number,
  count: number,
  opts: { now?: number; fresh?: boolean } = {}
): Promise<Record<EnsembleKind, SolarPlantForecast>> {
  const now = opts.now ?? Date.now();
  const all = (f: SolarPlantForecast) => Object.fromEntries(ENSEMBLE_KINDS.map((k) => [k, f])) as Record<EnsembleKind, SolarPlantForecast>;
  try {
    const loc = (await readPoolPlantInfo(epiasPlantId))?.location;
    if (!loc) throw new Error("Havuzda konum yok");
    const win = await trainingWindow(epiasPlantId, now, 4);
    if (win === null) return all({ status: "no-data", message: "Havuzda üretim verisi yok" });
    const { start, end } = win;
    const data = await loadSolarHours(epiasPlantId, start, end, { provisional: win.provisional });
    if (!data) throw new Error("Eğitim verisi okunamadı");
    const nwp: NwpArchive = new Map();
    for (const m of NWP_MODELS) {
      const ys = new Map<number, NwpYear>();
      for (let y = new Date(start).getUTCFullYear(); y <= new Date(end - 1).getUTCFullYear(); y++) {
        const d = await readNwpYear(epiasPlantId, m, y);
        if (d) ys.set(y, d);
      }
      if (!ys.size) return all({ status: "no-data", message: `Ek hava modeli arşivi yok (${m}; scripts/weather-models-sync.mts)` });
      nwp.set(m, ys);
    }
    const clean = trainingLossFilter(
      data.hours.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
      data.site,
      end,
      SATELLITE_DELAY_DAYS
    );
    let ens;
    try {
      ens = fitEnsemble(data.hours, nwp, data.site, clean.exclude, end - 30 * DAY);
    } catch {
      return all({ status: "no-data", message: "Son 4 ayda eğitim için yeterli üretim saati yok (yeni santral?)" });
    }
    const [w, x] = await Promise.all([cachedLiveWeather(loc.latitude, loc.longitude, opts.fresh), cachedLiveNwp(loc.latitude, loc.longitude, opts.fresh)]);
    const toHour = (wh: ReturnType<typeof liveWeatherHours>[number]): SolarHourV2 => ({ ...wh, uevm: null, kgupFirst: null, kgupFinal: null, ptf: null, lag48: null, ghiLag48: null, directLag48: null, diffuseLag48: null, live: true });
    const src = [liveWeatherHours(w.res, from, from + count * HOUR), ...NWP_MODELS.map((m) => liveWeatherHours(x.res, from, from + count * HOUR, `_${m}`))];
    // Bir ek modelin saati eksikse o saatte ECMWF tahmini (birleşim temel sürümle aynı saatlerde ölçülür)
    const preds = src[0].map((_, i) => ens.predict(src.map((s) => toHour(s[i])), true));
    const round = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);
    const train = {
      from: new Date(start).toISOString().slice(0, 10),
      to: new Date(end - DAY).toISOString().slice(0, 10),
      hours: ens.trainHours,
      mount: `${ens.mount}; ağırlık ECMWF/ICON-EU/GFS ${ens.weights.map((v) => v.toFixed(2)).join("/")}`,
      maxMwh: ens.trainMaxMwh,
      ...(win.provisional ? { provisionalHours: data.provisionalHours ?? 0, provisionalThrough: new Date(end - DAY).toISOString().slice(0, 10) } : {}),
    };
    return Object.fromEntries(
      ENSEMBLE_KINDS.map((k) => [
        k,
        {
          status: "ok",
          hours: preds.map((p) => round(p[k])),
          train,
          weatherFetchedAt: [w.fetchedAt, x.fetchedAt].sort()[0],
          location: { latitude: loc.latitude, longitude: loc.longitude, locationSource: loc.locationSource },
        } satisfies SolarPlantForecast,
      ])
    ) as Record<EnsembleKind, SolarPlantForecast>;
  } catch (e) {
    return all({ status: "error", message: e instanceof Error ? e.message : String(e) });
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
